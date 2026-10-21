import csv
from datetime import date
from decimal import Decimal
from io import BytesIO

from django.db.models import Sum
from django.http import HttpResponse
from rest_framework import status, viewsets
from rest_framework.exceptions import ValidationError
from rest_framework.response import Response
from rest_framework.views import APIView

from audit.services import log_action
from inventory.models import StockLevel
from payments.models import Payment
from sales.models import Order, OrderItem

from .models import Expense
from .permissions import IsOwnerOrAdmin
from .serializers import ExpenseSerializer


ZERO = Decimal("0.00")


def report_dates(request):
    """Read optional inclusive start_date/end_date query parameters."""
    try:
        start = (
            date.fromisoformat(request.query_params["start_date"])
            if request.query_params.get("start_date")
            else None
        )
        end = (
            date.fromisoformat(request.query_params["end_date"])
            if request.query_params.get("end_date")
            else None
        )
    except ValueError:
        raise ValidationError({
            "date": "Use ISO dates in YYYY-MM-DD format."
        })

    if start and end and start > end:
        raise ValidationError({
            "date": "start_date cannot be after end_date."
        })

    return start, end


def apply_date_range(queryset, field, start, end):
    if start:
        queryset = queryset.filter(**{f"{field}__gte": start})
    if end:
        queryset = queryset.filter(**{f"{field}__lte": end})
    return queryset


def completed_orders(start, end):
    orders = Order.objects.filter(status=Order.Status.COMPLETED)
    return apply_date_range(orders, "created_at__date", start, end)


def filtered_expenses(start, end):
    expenses = Expense.objects.select_related(
        "product", "supplier", "recorded_by"
    )
    return apply_date_range(expenses, "expense_date", start, end)


def calculate_report(start, end):
    orders = completed_orders(start, end).prefetch_related("items")
    expenses = filtered_expenses(start, end)

    revenue = ZERO
    cost_of_goods = ZERO
    completed_order_count = 0

    for order in orders:
        completed_order_count += 1
        revenue += order.subtotal - order.discount_amount

        for item in order.items.all():
            cost_of_goods += item.unit_cost * item.quantity

    expense_total = (
        expenses.aggregate(total=Sum("amount"))["total"] or ZERO
    )

    payments = Payment.objects.filter(
        status=Payment.Status.COMPLETED,
        completed_at__isnull=False,
    )
    payments = apply_date_range(payments, "completed_at__date", start, end)
    collected = payments.aggregate(total=Sum("amount"))["total"] or ZERO

    stock_levels = StockLevel.objects.select_related("product")
    stock_cost_value = ZERO
    stock_retail_value = ZERO
    for stock in stock_levels:
        stock_cost_value += (
            stock.quantity_on_hand * stock.product.cost_price
        )
        stock_retail_value += (
            stock.quantity_on_hand * stock.product.selling_price
        )

    gross_profit = revenue - cost_of_goods
    net_profit = gross_profit - expense_total

    return {
        "period": {
            "start_date": start.isoformat() if start else None,
            "end_date": end.isoformat() if end else None,
        },
        "completed_orders": completed_order_count,
        "sales_revenue_excluding_delivery": str(revenue),
        "cost_of_goods_sold": str(cost_of_goods),
        "gross_profit_estimate": str(gross_profit),
        "operating_expenses": str(expense_total),
        "net_profit_estimate": str(net_profit),
        "completed_payments_collected": str(collected),
        "inventory": {
            "stock_cost_value": str(stock_cost_value),
            "stock_retail_value": str(stock_retail_value),
        },
        "notes": [
            "Sales revenue and cost of goods use completed orders in the selected order-creation date range.",
            "Collected payments use payment completion dates in the selected date range.",
            "Net profit estimate subtracts recorded expenses; it is not an accounting or tax statement.",
            "Historical order items created before cost snapshots were added have a default unit cost of zero and may overstate profit.",
            "Inventory valuation uses current product costs and on-hand quantities, including reserved stock.",
        ],
    }


def export_response(request, filename, headers, rows):
    file_format = request.query_params.get("format", "csv").lower()

    if file_format == "csv":
        response = HttpResponse(content_type="text/csv; charset=utf-8")
        response["Content-Disposition"] = (
            f'attachment; filename="{filename}.csv"'
        )
        response.write("\ufeff")
        writer = csv.writer(response)
        writer.writerow(headers)
        writer.writerows(rows)
        return response

    if file_format == "xlsx":
        try:
            from openpyxl import Workbook
        except ImportError:
            raise ValidationError({
                "format": "Excel export requires openpyxl to be installed."
            })

        workbook = Workbook()
        sheet = workbook.active
        sheet.title = filename[:31].replace("_", " ").title()
        sheet.append(headers)

        for row in rows:
            sheet.append(list(row))

        sheet.freeze_panes = "A2"
        sheet.auto_filter.ref = sheet.dimensions

        output = BytesIO()
        workbook.save(output)
        output.seek(0)

        response = HttpResponse(
            output.getvalue(),
            content_type=(
                "application/vnd.openxmlformats-officedocument."
                "spreadsheetml.sheet"
            ),
        )
        response["Content-Disposition"] = (
            f'attachment; filename="{filename}.xlsx"'
        )
        return response

    raise ValidationError({
        "format": "Supported export formats are csv and xlsx."
    })


class ExpenseViewSet(viewsets.ModelViewSet):
    serializer_class = ExpenseSerializer
    permission_classes = [IsOwnerOrAdmin]
    http_method_names = ["get", "post", "patch", "head", "options"]
    filterset_fields = ["category", "product", "supplier", "expense_date"]
    search_fields = ["description", "reference", "notes"]
    ordering_fields = ["expense_date", "amount", "created_at"]
    ordering = ["-expense_date", "-created_at"]

    def get_queryset(self):
        start, end = report_dates(self.request)
        return apply_date_range(
            Expense.objects.select_related(
                "product", "supplier", "recorded_by"
            ),
            "expense_date",
            start,
            end,
        )

    def perform_create(self, serializer):
        expense = serializer.save()
        log_action(
            actor=self.request.user,
            action="EXPENSE_CREATED",
            entity=expense,
            description="Operating expense recorded.",
            metadata={
                "amount": str(expense.amount),
                "category": expense.category,
            },
            ip_address=self.request.META.get("REMOTE_ADDR"),
        )

    def perform_update(self, serializer):
        expense = serializer.save()
        log_action(
            actor=self.request.user,
            action="EXPENSE_UPDATED",
            entity=expense,
            description="Operating expense updated.",
            metadata={
                "amount": str(expense.amount),
                "category": expense.category,
            },
            ip_address=self.request.META.get("REMOTE_ADDR"),
        )


class ReportSummaryView(APIView):
    permission_classes = [IsOwnerOrAdmin]

    def get(self, request):
        start, end = report_dates(request)
        return Response(calculate_report(start, end))


class SalesExportView(APIView):
    permission_classes = [IsOwnerOrAdmin]

    def get(self, request):
        start, end = report_dates(request)
        orders = completed_orders(start, end).prefetch_related("items")

        rows = []
        for order in orders:
            item_cost = sum(
                (item.unit_cost * item.quantity for item in order.items.all()),
                ZERO,
            )
            revenue = order.subtotal - order.discount_amount
            rows.append([
                order.order_number,
                order.created_at.isoformat(),
                order.source,
                order.status,
                order.customer_name,
                order.customer_phone,
                str(order.subtotal),
                str(order.discount_amount),
                str(order.delivery_fee),
                str(order.total_amount),
                str(item_cost),
                str(revenue - item_cost),
            ])

        return export_response(
            request,
            "sales_report",
            [
                "Order number", "Created at", "Source", "Status",
                "Customer", "Phone", "Subtotal", "Discount",
                "Delivery fee", "Order total", "Cost of goods",
                "Gross profit estimate",
            ],
            rows,
        )


class ExpensesExportView(APIView):
    permission_classes = [IsOwnerOrAdmin]

    def get(self, request):
        start, end = report_dates(request)
        expenses = filtered_expenses(start, end)

        rows = [
            [
                expense.expense_date.isoformat(),
                expense.category,
                expense.description,
                str(expense.amount),
                expense.product.name if expense.product else "",
                expense.supplier.name if expense.supplier else "",
                expense.reference,
                expense.recorded_by.username if expense.recorded_by else "",
                expense.notes,
            ]
            for expense in expenses
        ]

        return export_response(
            request,
            "expenses_report",
            [
                "Date", "Category", "Description", "Amount",
                "Product", "Supplier", "Reference", "Recorded by", "Notes",
            ],
            rows,
        )
