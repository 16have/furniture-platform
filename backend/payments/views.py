
import hashlib
import hmac
import logging
from decimal import Decimal, InvalidOperation

from django.conf import settings
from django.db import transaction
from django.utils import timezone

from rest_framework import serializers, status
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.throttling import AnonRateThrottle
from rest_framework.views import APIView
from rest_framework import viewsets
from rest_framework.permissions import IsAuthenticated
from sales.permissions import IsAuthorizedStaff
from .serializers import PaymentRecordSerializer

from sales.models import Order
from .models import Payment
from .services import (
    initiate_order_mpesa_payment,
    complete_verified_mpesa_payment,
    payment_summary,
)
from .mpesa import normalize_ke_phone


logger = logging.getLogger(__name__)


class MpesaInitiationSerializer(serializers.Serializer):
    order_number = serializers.CharField(max_length=40)
    tracking_token = serializers.CharField(
        max_length=100,
        trim_whitespace=False,
        write_only=True,
    )
    amount = serializers.DecimalField(
        max_digits=12,
        decimal_places=2,
        min_value=Decimal("1.00"),
    )

    def validate_amount(self, value):
        if value != value.to_integral_value():
            raise serializers.ValidationError(
                "M-Pesa payments must be in whole Kenyan shillings."
            )
        return value


class PublicMpesaInitiationView(APIView):
    permission_classes = [AllowAny]
    throttle_classes = [AnonRateThrottle]

    def post(self, request):
        serializer = MpesaInitiationSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        token_hash = hashlib.sha256(
            data["tracking_token"].encode("utf-8")
        ).hexdigest()

        order = Order.objects.filter(
            order_number=data["order_number"],
            tracking_token_hash=token_hash,
            source=Order.Source.ONLINE,
        ).first()

        if order is None:
            return Response(
                {"detail": "Order not found or tracking credentials invalid."},
                status=status.HTTP_404_NOT_FOUND,
            )

        try:
            normalize_ke_phone(order.customer_phone)
            payment, initiated = initiate_order_mpesa_payment(
                order_id=order.pk,
                amount=data["amount"],
            )
        except (ValueError, InvalidOperation) as exc:
            return Response(
                {"detail": str(exc)},
                status=status.HTTP_400_BAD_REQUEST,
            )
        except Exception:
            logger.exception("Unable to create M-Pesa payment")
            return Response(
                {"detail": "Unable to initiate payment at this time."},
                status=status.HTTP_502_BAD_GATEWAY,
            )

        if not initiated:
            return Response(
                {
                    "payment_status": payment.status,
                    "message": (
                        "The payment request could not be confirmed. "
                        "Check the order before retrying."
                    ),
                    "payment_summary": payment_summary(order),
                },
                status=status.HTTP_502_BAD_GATEWAY,
            )

        return Response(
            {
                "order_number": order.order_number,
                "payment_status": payment.status,
                "message": (
                    "Payment prompt initiated. Complete the request "
                    "on your phone. This is not confirmation of payment."
                ),
                "payment_summary": payment_summary(order),
            },
            status=status.HTTP_202_ACCEPTED,
        )


def _metadata_items(callback):
    metadata = callback.get("CallbackMetadata", {})
    items = metadata.get("Item", [])
    return {
        item.get("Name"): item.get("Value")
        for item in items
        if isinstance(item, dict) and item.get("Name")
    }


class MpesaCallbackView(APIView):
    permission_classes = [AllowAny]
    authentication_classes = []
    throttle_classes = []

    def post(self, request, callback_secret):
        configured_secret = settings.MPESA_CALLBACK_SECRET

        if not configured_secret or not hmac.compare_digest(
            callback_secret,
            configured_secret,
        ):
            return Response(
                {"detail": "Not found."},
                status=status.HTTP_404_NOT_FOUND,
            )

        try:
            callback = request.data["Body"]["stkCallback"]
            checkout_id = callback["CheckoutRequestID"]
            result_code = str(callback["ResultCode"])
        except (KeyError, TypeError):
            return Response(
                {"detail": "Invalid callback payload."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        payment = Payment.objects.filter(
            method=Payment.Method.MPESA,
            provider_checkout_id=checkout_id,
        ).select_related("order").first()

        if payment is None:
            logger.warning(
                "M-Pesa callback has unknown checkout ID"
            )
            return Response(
                {"detail": "Unknown payment request."},
                status=status.HTTP_404_NOT_FOUND,
            )

        # Ignore late failure callbacks for already completed payments.
        if payment.status == Payment.Status.COMPLETED:
            return Response({"ResultCode": 0, "ResultDesc": "Accepted"})

        if result_code != "0":
            Payment.objects.filter(
                pk=payment.pk,
                status=Payment.Status.PENDING,
            ).update(
                status=Payment.Status.FAILED,
                provider_result_code=result_code[:20],
                provider_result_description=str(
                    callback.get("ResultDesc", "")
                )[:255],
            )
            return Response({"ResultCode": 0, "ResultDesc": "Accepted"})

        values = _metadata_items(callback)

        receipt = values.get("MpesaReceiptNumber")
        callback_amount = values.get("Amount")
        callback_phone = values.get("PhoneNumber")

        if not receipt or callback_amount is None or callback_phone is None:
            return Response(
                {"detail": "Successful callback is missing payment metadata."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            amount = Decimal(str(callback_amount))
            received_phone = normalize_ke_phone(callback_phone)
            expected_phone = normalize_ke_phone(
                payment.order.customer_phone
            )
        except (InvalidOperation, ValueError):
            return Response(
                {"detail": "Invalid payment metadata."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if amount != payment.amount or received_phone != expected_phone:
            logger.error(
                "M-Pesa callback mismatch for payment %s",
                payment.pk,
            )
            return Response(
                {"detail": "Payment metadata mismatch."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            with transaction.atomic():
                locked_payment = Payment.objects.select_for_update().get(
                    pk=payment.pk
                )

                if locked_payment.status == Payment.Status.COMPLETED:
                    return Response({
                        "ResultCode": 0,
                        "ResultDesc": "Accepted",
                    })

                locked_payment.provider_result_code = result_code
                locked_payment.provider_result_description = str(
                    callback.get("ResultDesc", "")
                )[:255]
                locked_payment.save(
                    update_fields=[
                        "provider_result_code",
                        "provider_result_description",
                        "updated_at",
                    ]
                )

                complete_verified_mpesa_payment(
                    payment_id=locked_payment.pk,
                    verified_reference=str(receipt),
                    verified_amount=amount,
                )
        except Exception:
            logger.exception(
                "M-Pesa callback processing failed for payment %s",
                payment.pk,
            )
            return Response(
                {"detail": "Callback processing failed; reconciliation required."},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )

        return Response({"ResultCode": 0, "ResultDesc": "Accepted"})

class PaymentRecordViewSet(viewsets.ReadOnlyModelViewSet):
    """
    Staff-only payment history.

    Supports filtering by order_number, status, method and reference.
    """
    permission_classes = [IsAuthorizedStaff]
    serializer_class = PaymentRecordSerializer

    def get_queryset(self):
        queryset = (
            Payment.objects
            .select_related("order", "recorded_by")
            .all()
        )

        params = self.request.query_params

        order_number = params.get("order_number")
        payment_status = params.get("status")
        method = params.get("method")
        reference = params.get("reference")

        if order_number:
            queryset = queryset.filter(
                order__order_number__iexact=order_number.strip()
            )

        if payment_status:
            allowed = {choice[0] for choice in Payment.Status.choices}
            if payment_status.upper() not in allowed:
                return queryset.none()
            queryset = queryset.filter(status=payment_status.upper())

        if method:
            allowed = {choice[0] for choice in Payment.Method.choices}
            if method.upper() not in allowed:
                return queryset.none()
            queryset = queryset.filter(method=method.upper())

        if reference:
            queryset = queryset.filter(
                reference__icontains=reference.strip()
            )

        return queryset  