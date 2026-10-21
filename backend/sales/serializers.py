
from django.core.exceptions import ValidationError as DjangoValidationError
from rest_framework import serializers

from payments.models import Payment
from payments.services import payment_summary
from .models import Order, OrderItem
from .services import create_order
from django.conf import settings
from django.utils import timezone
import hashlib
import secrets

from django.db import transaction

class OrderItemReadSerializer(serializers.ModelSerializer):
    class Meta:
        model = OrderItem
        fields = [
            "id",
            "product",
            "product_name",
            "sku",
            "quantity",
            "unit_price",
            "line_total",
        ]


class PaymentReadSerializer(serializers.ModelSerializer):
    class Meta:
        model = Payment
        read_only_fields = [
            "id",
            "order",
            "order_number",
            "customer_name",
            "customer_phone",
            "method",
            "status",
            "amount",
            "reference",
            "provider_checkout_id",
            "provider_merchant_request_id",
            "provider_result_code",
            "provider_result_description",
            "recorded_by",
            "recorded_by_username",
            "notes",
            "completed_at",
            "created_at",
            "updated_at",
        ]

class OrderReadSerializer(serializers.ModelSerializer):
    items = OrderItemReadSerializer(many=True, read_only=True)
    payments = PaymentReadSerializer(many=True, read_only=True)
    payment_summary = serializers.SerializerMethodField()

    class Meta:
        model = Order
        fields = [
            "id",
            "order_number",
            "source",
            "status",
            "customer",
            "customer_name",
            "customer_phone",
            "customer_email",
            "fulfillment_type",
            "delivery_address",
            "requested_fulfillment_at",
            "confirmed_fulfillment_at",
            "subtotal",
            "discount_amount",
            "delivery_fee",
            "total_amount",
            "customer_notes",
            "internal_notes",
            "items",
            "payments",
            "payment_summary",
            "created_by",
            "created_at",
            "updated_at",
        ]

    def get_payment_summary(self, order):
        return payment_summary(order)


class POSOrderCreateSerializer(serializers.Serializer):
    customer_name = serializers.CharField(max_length=200)
    customer_phone = serializers.CharField(max_length=30)
    customer_email = serializers.EmailField(required=False, allow_blank=True)

    fulfillment_type = serializers.ChoiceField(
        choices=Order.FulfillmentType.choices,
        default=Order.FulfillmentType.PICKUP,
    )
    delivery_address = serializers.CharField(
        required=False,
        allow_blank=True,
    )
    requested_fulfillment_at = serializers.DateTimeField(
        required=False,
        allow_null=True,
    )

    delivery_fee = serializers.DecimalField(
        max_digits=12,
        decimal_places=2,
        min_value=0,
        default="0.00",
    )
    discount_amount = serializers.DecimalField(
        max_digits=12,
        decimal_places=2,
        min_value=0,
        default="0.00",
    )

    customer_notes = serializers.CharField(required=False, allow_blank=True)
    internal_notes = serializers.CharField(required=False, allow_blank=True)

    items = serializers.ListField(
        child=serializers.DictField(),
        allow_empty=False,
    )

    def validate_items(self, items):
        validated = []

        for item in items:
            if set(item.keys()) != {"product_id", "quantity"}:
                raise serializers.ValidationError(
                    "Each item must contain only product_id and quantity."
                )

            product_id = item["product_id"]
            quantity = item["quantity"]

            if (
                isinstance(product_id, bool)
                or not isinstance(product_id, int)
                or product_id <= 0
            ):
                raise serializers.ValidationError(
                    "product_id must be a positive integer."
                )

            if (
                isinstance(quantity, bool)
                or not isinstance(quantity, int)
                or quantity <= 0
            ):
                raise serializers.ValidationError(
                    "quantity must be a positive integer."
                )

            validated.append({
                "product_id": product_id,
                "quantity": quantity,
            })

        return validated

    def validate(self, attrs):
        request = self.context["request"]
        user = request.user

        if (
            attrs["discount_amount"] > 0
            and user.role not in {"OWNER", "ADMIN"}
        ):
            raise serializers.ValidationError({
                "discount_amount": "Only owners and admins may apply discounts."
            })

        if (
            attrs["fulfillment_type"] == Order.FulfillmentType.DELIVERY
            and not attrs.get("delivery_address", "").strip()
        ):
            raise serializers.ValidationError({
                "delivery_address": "Required for delivery orders."
            })

        return attrs

    def create(self, validated_data):
        request = self.context["request"]

        try:
            return create_order(
                source=Order.Source.POS,
                created_by=request.user,
                **validated_data,
            )
        except DjangoValidationError as exc:
            raise serializers.ValidationError(exc.messages) from exc

class PublicCheckoutSerializer(serializers.Serializer):
    customer_name = serializers.CharField(max_length=200)
    customer_phone = serializers.CharField(max_length=30)
    customer_email = serializers.EmailField(
        required=False,
        allow_blank=True,
        default="",
    )

    fulfillment_type = serializers.ChoiceField(
        choices=Order.FulfillmentType.choices,
        default=Order.FulfillmentType.PICKUP,
    )
    delivery_address = serializers.CharField(
        required=False,
        allow_blank=True,
        default="",
    )
    requested_fulfillment_at = serializers.DateTimeField(
        required=False,
        allow_null=True,
        default=None,
    )
    customer_notes = serializers.CharField(
        required=False,
        allow_blank=True,
        default="",
    )

    items = serializers.ListField(
        child=serializers.DictField(),
        allow_empty=False,
        max_length=50,
    )

    def validate_items(self, items):
        validated = []

        for item in items:
            if set(item.keys()) != {"product_id", "quantity"}:
                raise serializers.ValidationError(
                    "Each item must contain only product_id and quantity."
                )

            product_id = item["product_id"]
            quantity = item["quantity"]

            if (
                isinstance(product_id, bool)
                or not isinstance(product_id, int)
                or product_id <= 0
            ):
                raise serializers.ValidationError(
                    "product_id must be a positive integer."
                )

            if (
                isinstance(quantity, bool)
                or not isinstance(quantity, int)
                or quantity <= 0
            ):
                raise serializers.ValidationError(
                    "quantity must be a positive integer."
                )

            validated.append({
                "product_id": product_id,
                "quantity": quantity,
            })

        product_ids = [item["product_id"] for item in validated]

        if len(product_ids) != len(set(product_ids)):
            raise serializers.ValidationError(
                "Each product may appear only once."
            )

        return validated

    def validate_requested_fulfillment_at(self, value):
        if value is not None and value <= timezone.now():
            raise serializers.ValidationError(
                "Requested fulfillment time must be in the future."
            )
        return value

    def validate(self, attrs):
        if (
            attrs["fulfillment_type"] == Order.FulfillmentType.DELIVERY
            and not attrs.get("delivery_address", "").strip()
        ):
            raise serializers.ValidationError({
                "delivery_address": "Required for delivery orders."
            })

        return attrs
    @transaction.atomic
    def create(self, validated_data):
        fulfillment_type = validated_data["fulfillment_type"]

        if fulfillment_type == Order.FulfillmentType.DELIVERY:
            delivery_fee = getattr(
                settings,
                "ONLINE_DELIVERY_FEE",
                "0.00",
            )
        else:
            delivery_fee = "0.00"

        # Generate a secret that the customer will use for tracking.
        tracking_token = secrets.token_urlsafe(32)
        tracking_token_hash = hashlib.sha256(
            tracking_token.encode("utf-8")
        ).hexdigest()

        try:
            order = create_order(
                source=Order.Source.ONLINE,
                delivery_fee=delivery_fee,
                discount_amount="0.00",
                internal_notes="",
                created_by=None,
                **validated_data,
            )
        except DjangoValidationError as exc:
            raise serializers.ValidationError(
                exc.messages
            ) from exc

        order.tracking_token_hash = tracking_token_hash
        order.save(
            update_fields=["tracking_token_hash", "updated_at"]
        )

        # Available to the checkout response only; not a database field.
        order._tracking_token = tracking_token

        return order
    
class PublicOrderTrackingRequestSerializer(serializers.Serializer):
    order_number = serializers.CharField(max_length=40)
    tracking_token = serializers.CharField(
        max_length=100,
        trim_whitespace=False,
        write_only=True,
    )