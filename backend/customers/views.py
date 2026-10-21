from django.db.models import Sum
from rest_framework import viewsets
from rest_framework.decorators import action
from rest_framework.response import Response

from payments.models import Payment
from sales.models import Order
from sales.serializers import OrderReadSerializer
from sales.permissions import IsAuthorizedStaff

from .models import Customer
from .serializers import CustomerSerializer


class CustomerViewSet(viewsets.ModelViewSet):
    serializer_class = CustomerSerializer
    permission_classes = [IsAuthorizedStaff]
    search_fields = ["name", "phone", "email"]
    ordering_fields = ["name", "created_at", "updated_at"]
    ordering = ["name"]

    def get_queryset(self):
        queryset = Customer.objects.all()
        phone = self.request.query_params.get("phone")

        if phone:
            queryset = queryset.filter(phone__icontains=phone.strip())

        return queryset

    @action(detail=True, methods=["get"])
    def history(self, request, pk=None):
        customer = self.get_object()

        orders = (
            Order.objects.filter(customer=customer)
            .select_related("customer", "created_by")
            .prefetch_related("items", "payments")
            .order_by("-created_at")
        )

        completed_payments = Payment.objects.filter(
            order__customer=customer,
            status=Payment.Status.COMPLETED,
        )

        total_paid = (
            completed_payments.aggregate(total=Sum("amount"))["total"] or 0
        )

        return Response({
            "customer": self.get_serializer(customer).data,
            "orders": OrderReadSerializer(
                orders,
                many=True,
                context=self.get_serializer_context(),
            ).data,
            "summary": {
                "order_count": orders.count(),
                "completed_payment_total": str(total_paid),
            },
        })
