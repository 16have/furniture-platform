
from django.core.exceptions import ValidationError as DjangoValidationError
from django.shortcuts import get_object_or_404
from rest_framework import serializers, status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import ValidationError
from rest_framework.response import Response
from rest_framework.permissions import AllowAny
from rest_framework.views import APIView
import hashlib

from rest_framework.throttling import AnonRateThrottle

from .serializers import PublicOrderTrackingRequestSerializer

from .serializers import PublicCheckoutSerializer
from django.db import transaction
from rest_framework import serializers, status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import ValidationError
from rest_framework.response import Response
from decimal import Decimal

from django.db.models import Sum
from rest_framework.decorators import action
from rest_framework.response import Response

from payments.models import Payment
from sales.models import OrderItem

from .models import SuspendedCart
from .suspended_serializers import SuspendedCartSerializer
from .services import create_order, cancel_order, transition_order, schedule_order_fulfillment
from .permissions import IsAuthorizedStaff
from payments.services import record_cash_payment, payment_summary
from .models import Order
from .permissions import IsAuthorizedStaff
from .serializers import (
    OrderReadSerializer,
    POSOrderCreateSerializer,
)
from .services import cancel_order


class OrderViewSet(viewsets.ModelViewSet):
    permission_classes = [IsAuthorizedStaff]
    http_method_names = ["get", "post", "head", "options"]

    def get_queryset(self):
        return (
            Order.objects
            .select_related("customer", "created_by")
            .prefetch_related("items", "payments")
            .all()
        )

    def get_serializer_class(self):
        if self.action == "create":
            return POSOrderCreateSerializer
        return OrderReadSerializer

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        order = serializer.save()

        output = OrderReadSerializer(
            order,
            context=self.get_serializer_context(),
        )

        return Response(output.data, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=["post"])
    def cancel(self, request, pk=None):
        order = self.get_object()
        reason = request.data.get("reason", "")

        if not isinstance(reason, str):
            raise ValidationError({"reason": "Must be text."})

        try:
            order = cancel_order(
                order_id=order.pk,
                user=request.user,
                reason=reason,
            )
        except DjangoValidationError as exc:
            raise ValidationError(exc.messages) from exc

        return Response(OrderReadSerializer(order).data)

    @action(detail=True, methods=["post"], url_path="cash-payment")
    def cash_payment(self, request, pk=None):
        order = self.get_object()
        amount = request.data.get("amount")
        notes = request.data.get("notes", "")

        if not isinstance(notes, str):
            raise ValidationError({"notes": "Must be text."})

        try:
            payment = record_cash_payment(
                order_id=order.pk,
                amount=amount,
                recorded_by=request.user,
                notes=notes,
            )
        except DjangoValidationError as exc:
            raise ValidationError(exc.messages) from exc

        return Response(
            {
                "payment_id": payment.pk,
                "order_number": order.order_number,
                "payment_status": payment.status,
                "summary": payment_summary(order),
            },
            status=status.HTTP_201_CREATED,
        )
    @action(detail=True, methods=["get"])
    def receipt(self, request, pk=None):
        order = self.get_object()

        items = order.items.all().order_by("id")

        paid = (
            Payment.objects.filter(
                order=order,
                status=Payment.Status.COMPLETED,
            ).aggregate(total=Sum("amount"))["total"]
            or Decimal("0.00")
        )

        balance_due = max(
            Decimal("0.00"),
            order.total_amount - paid,
        )

        return Response({
            "receipt": {
                "order_number": order.order_number,
                "created_at": order.created_at,
                "source": order.source,
                "status": order.status,
                "customer": {
                    "name": order.customer_name,
                    "phone": order.customer_phone,
                },
                "fulfillment": {
                    "type": order.fulfillment_type,
                    "address": order.delivery_address,
                    "requested_at": order.requested_fulfillment_at,
                    "confirmed_at": order.confirmed_fulfillment_at,
                },
                "items": [
                    {
                        "product_name": item.product_name,
                        "sku": item.sku,
                        "quantity": item.quantity,
                        "unit_price": item.unit_price,
                        "line_total": item.line_total,
                    }
                    for item in items
                ],
                "subtotal": order.subtotal,
                "discount_amount": order.discount_amount,
                "delivery_fee": order.delivery_fee,
                "total_amount": order.total_amount,
                "paid": paid,
                "balance_due": balance_due,
            }
        })
    def _apply_order_transition(
        self,
        order,
        target_status,
        confirmed_fulfillment_at=None,
    ):
        try:
            order = transition_order(
                order_id=order.pk,
                target_status=target_status,
                user=self.request.user,
                confirmed_fulfillment_at=confirmed_fulfillment_at,
            )
        except DjangoValidationError as exc:
            raise ValidationError(exc.messages) from exc

        return Response(
            OrderReadSerializer(
                order,
                context=self.get_serializer_context(),
            ).data
        )

    @action(detail=True, methods=["post"])
    def confirm(self, request, pk=None):
        order = self.get_object()
        confirmed_at = None

        if "confirmed_fulfillment_at" in request.data:
            confirmed_at = serializers.DateTimeField().run_validation(
                request.data["confirmed_fulfillment_at"]
            )

        return self._apply_order_transition(
            order,
            Order.Status.CONFIRMED,
            confirmed_fulfillment_at=confirmed_at,
        )

    @action(
        detail=True,
        methods=["post"],
        url_path="start-processing",
    )
    def start_processing(self, request, pk=None):
        order = self.get_object()

        return self._apply_order_transition(
            order,
            Order.Status.PROCESSING,
        )

    @action(
        detail=True,
        methods=["post"],
        url_path="mark-ready",
    )
    def mark_ready(self, request, pk=None):
        order = self.get_object()

        return self._apply_order_transition(
            order,
            Order.Status.READY,
        )

    @action(detail=True, methods=["post"])
    def complete(self, request, pk=None):
        order = self.get_object()

        return self._apply_order_transition(
            order,
            Order.Status.COMPLETED,
        )

    @action(
        detail=True,
        methods=["post"],
        url_path="schedule-fulfillment",
    )
    def schedule_fulfillment(self, request, pk=None):
        order = self.get_object()

        field = serializers.DateTimeField()
        confirmed_at = field.run_validation(
            request.data.get("confirmed_fulfillment_at")
        )

        try:
            order = schedule_order_fulfillment(
                order_id=order.pk,
                confirmed_fulfillment_at=confirmed_at,
            )
        except DjangoValidationError as exc:
            raise ValidationError(exc.messages) from exc

        return Response(
            OrderReadSerializer(
                order,
                context=self.get_serializer_context(),
            ).data
        )

class PublicCheckoutView(APIView):
    permission_classes = [AllowAny]
    throttle_classes = [AnonRateThrottle]

    def post(self, request):
        serializer = PublicCheckoutSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        order = serializer.save()

        # Return only customer-safe order information.
        return Response(
            {
                "order_number": order.order_number,
                "status": order.status,
                "fulfillment_type": order.fulfillment_type,
                "requested_fulfillment_at": (
                    order.requested_fulfillment_at
                ),
                "subtotal": order.subtotal,
                "delivery_fee": order.delivery_fee,
                "discount_amount": order.discount_amount,
                "total_amount": order.total_amount,
                "items": [
                    {
                        "product_name": item.product_name,
                        "sku": item.sku,
                        "quantity": item.quantity,
                        "unit_price": item.unit_price,
                        "line_total": item.line_total,
                    }
                    for item in order.items.all()
                ],
                "tracking_token": order._tracking_token,
                "message": (
                    "Order received. Save your tracking token securely. "
                    "Payment and fulfillment will be confirmed separately."
                ),
            },
            status=status.HTTP_201_CREATED,
        )
        
    
class PublicOrderTrackingView(APIView):
    permission_classes = [AllowAny]
    throttle_classes = [AnonRateThrottle]

    def post(self, request):
        serializer = PublicOrderTrackingRequestSerializer(
            data=request.data
        )
        serializer.is_valid(raise_exception=True)

        order_number = serializer.validated_data["order_number"]
        tracking_token = serializer.validated_data["tracking_token"]

        token_hash = hashlib.sha256(
            tracking_token.encode("utf-8")
        ).hexdigest()

        order = (
            Order.objects
            .filter(
                order_number=order_number,
                tracking_token_hash=token_hash,
                source=Order.Source.ONLINE,
            )
            .prefetch_related("items")
            .first()
        )

        # Do not reveal whether an order number or token was correct.
        if order is None:
            return Response(
                {"detail": "Order not found or tracking credentials invalid."},
                status=status.HTTP_404_NOT_FOUND,
            )

        return Response({
            "order_number": order.order_number,
            "status": order.status,
            "fulfillment_type": order.fulfillment_type,
            "delivery_address": order.delivery_address,
            "requested_fulfillment_at": order.requested_fulfillment_at,
            "confirmed_fulfillment_at": order.confirmed_fulfillment_at,
            "subtotal": order.subtotal,
            "delivery_fee": order.delivery_fee,
            "discount_amount": order.discount_amount,
            "total_amount": order.total_amount,
            "payment_summary": payment_summary(order),
            "items": [
                {
                    "product_name": item.product_name,
                    "sku": item.sku,
                    "quantity": item.quantity,
                    "unit_price": item.unit_price,
                    "line_total": item.line_total,
                }
                for item in order.items.all()
            ],
        })

class SuspendedCartViewSet(viewsets.ModelViewSet):
    serializer_class = SuspendedCartSerializer
    permission_classes = [IsAuthorizedStaff]
    http_method_names = ["get", "post", "patch", "delete", "head", "options"]

    def get_queryset(self):
        queryset = SuspendedCart.objects.select_related("created_by")

        # Clerks see their own suspended carts. Owners/admins can see all.
        if self.request.user.role not in {"OWNER", "ADMIN"}:
            queryset = queryset.filter(created_by=self.request.user)

        return queryset

    @action(detail=True, methods=["post"])
    def resume(self, request, pk=None):
        try:
            return self._resume(request, pk)
        except DjangoValidationError as exc:
            raise ValidationError(exc.messages) from exc

    def _resume(self, request, pk):
        with transaction.atomic():
            cart = get_object_or_404(
                self.get_queryset().select_for_update(), pk=pk
            )

            order = create_order(
                source=Order.Source.POS,
                created_by=request.user,
                customer_name=cart.customer_name,
                customer_phone=cart.customer_phone,
                customer_email=cart.customer_email,
                fulfillment_type=cart.fulfillment_type,
                delivery_address=cart.delivery_address,
                requested_fulfillment_at=cart.requested_fulfillment_at,
                delivery_fee=cart.delivery_fee,
                discount_amount=cart.discount_amount,
                customer_notes=cart.customer_notes,
                internal_notes=cart.internal_notes,
                items=cart.items,
                customer=cart.customer,
                auto_match_customer=False,
            )

            order_id = order.pk
            order_number = order.order_number
            cart.delete()

        return Response(
            {
                "message": "Cart resumed as a POS order.",
                "order_id": order_id,
                "order_number": order_number,
            },
            status=status.HTTP_201_CREATED,
        )