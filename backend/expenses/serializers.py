from rest_framework import serializers

from .models import Expense


class ExpenseSerializer(serializers.ModelSerializer):
    product_name = serializers.CharField(
        source="product.name", read_only=True, default=None
    )
    supplier_name = serializers.CharField(
        source="supplier.name", read_only=True, default=None
    )
    recorded_by_username = serializers.CharField(
        source="recorded_by.username", read_only=True, default=None
    )

    class Meta:
        model = Expense
        fields = [
            "id",
            "category",
            "description",
            "amount",
            "expense_date",
            "product",
            "product_name",
            "supplier",
            "supplier_name",
            "reference",
            "notes",
            "recorded_by",
            "recorded_by_username",
            "created_at",
            "updated_at",
        ]
        read_only_fields = [
            "id",
            "recorded_by",
            "created_at",
            "updated_at",
        ]

    def validate_amount(self, value):
        if value <= 0:
            raise serializers.ValidationError(
                "Expense amount must be greater than zero."
            )
        return value

    def create(self, validated_data):
        request = self.context["request"]
        validated_data["recorded_by"] = request.user
        return super().create(validated_data)
