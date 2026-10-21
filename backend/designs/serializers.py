from rest_framework import serializers

from .models import DesignRequest


class PublicDesignRequestSerializer(serializers.ModelSerializer):
    class Meta:
        model = DesignRequest
        fields = [
            "reference",
            "customer_name",
            "customer_phone",
            "customer_email",
            "title",
            "description",
            "dimensions",
            "materials",
            "finish",
            "quantity",
            "notes",
            "reference_image_url",
            "status",
            "estimated_price",
            "estimated_production_days",
            "created_at",
            "updated_at",
        ]
        read_only_fields = [
            "reference",
            "status",
            "estimated_price",
            "estimated_production_days",
            "created_at",
            "updated_at",
        ]

    def validate_quantity(self, value):
        if value < 1:
            raise serializers.ValidationError(
                "Quantity must be at least 1."
            )
        return value


class StaffDesignRequestSerializer(serializers.ModelSerializer):
    class Meta:
        model = DesignRequest
        fields = "__all__"
        read_only_fields = [
            "id",
            "reference",
            "customer",
            "customer_name",
            "customer_phone",
            "customer_email",
            "title",
            "description",
            "dimensions",
            "materials",
            "finish",
            "quantity",
            "notes",
            "reference_image_url",
            "created_by",
            "created_at",
            "updated_at",
        ]
