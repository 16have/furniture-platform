
from rest_framework import serializers

from .models import Payment


class PaymentRecordSerializer(serializers.ModelSerializer):
    order_number = serializers.CharField(
        source="order.order_number",
        read_only=True,
    )
    customer_name = serializers.CharField(
        source="order.customer_name",
        read_only=True,
    )
    customer_phone = serializers.CharField(
        source="order.customer_phone",
        read_only=True,
    )
    recorded_by_username = serializers.CharField(
        source="recorded_by.username",
        read_only=True,
        allow_null=True,
    )

    class Meta:
        model = Payment
        fields = [
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
        read_only_fields = fields