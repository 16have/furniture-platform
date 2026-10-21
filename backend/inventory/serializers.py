
from rest_framework import serializers

from .models import Supplier, StockLevel, StockMovement


class SupplierSerializer(serializers.ModelSerializer):
    class Meta:
        model = Supplier
        fields = [
            "id",
            "name",
            "contact_person",
            "phone",
            "email",
            "address",
            "notes",
            "is_active",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "created_at", "updated_at"]


class StockLevelSerializer(serializers.ModelSerializer):
    product_name = serializers.CharField(source="product.name", read_only=True)
    sku = serializers.CharField(source="product.sku", read_only=True)
    reorder_level = serializers.IntegerField(
        source="product.reorder_level",
        read_only=True,
    )
    quantity_available = serializers.IntegerField(read_only=True)
    is_low_stock = serializers.BooleanField(read_only=True)

    class Meta:
        model = StockLevel
        fields = [
            "id",
            "product",
            "product_name",
            "sku",
            "quantity_on_hand",
            "quantity_reserved",
            "quantity_available",
            "reorder_level",
            "is_low_stock",
            "updated_at",
        ]
        read_only_fields = fields


class StockMovementSerializer(serializers.ModelSerializer):
    product_name = serializers.CharField(
        source="product.name",
        read_only=True,
    )
    sku = serializers.CharField(source="product.sku", read_only=True)
    supplier_name = serializers.CharField(
        source="supplier.name",
        read_only=True,
        default=None,
    )
    created_by_username = serializers.CharField(
        source="created_by.username",
        read_only=True,
        default=None,
    )

    class Meta:
        model = StockMovement
        fields = [
            "id",
            "product",
            "product_name",
            "sku",
            "movement_type",
            "quantity_delta",
            "quantity_reserved_delta",
            "supplier",
            "supplier_name",
            "reference",
            "notes",
            "created_by",
            "created_by_username",
            "created_at",
        ]
        read_only_fields = fields


class StockOperationSerializer(serializers.Serializer):
    product_id = serializers.IntegerField(min_value=1)
    quantity = serializers.IntegerField(min_value=1)
    reference = serializers.CharField(required=False, allow_blank=True)
    notes = serializers.CharField(required=False, allow_blank=True)


class ReceiveStockSerializer(StockOperationSerializer):
    supplier_id = serializers.IntegerField(min_value=1, required=False)


class StockAdjustmentSerializer(serializers.Serializer):
    product_id = serializers.IntegerField(min_value=1)
    quantity_delta = serializers.IntegerField()
    reference = serializers.CharField(required=False, allow_blank=True)
    notes = serializers.CharField(required=False, allow_blank=True)

    def validate_quantity_delta(self, value):
        if value == 0:
            raise serializers.ValidationError(
                "Adjustment must not be zero."
            )
        return value