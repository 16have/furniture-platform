
from rest_framework import serializers
from .models import Category, Product, ProductImage


class ProductImageSerializer(serializers.ModelSerializer):
    class Meta:
        model = ProductImage
        fields = [
            "id", "image_url", "alt_text",
            "is_primary", "display_order",
        ]


class CategorySerializer(serializers.ModelSerializer):
    class Meta:
        model = Category
        fields = [
            "id", "name", "slug", "description",
            "image_url", "display_order",
        ]


class PublicProductSerializer(serializers.ModelSerializer):
    category = CategorySerializer(read_only=True)
    images = ProductImageSerializer(many=True, read_only=True)

    class Meta:
        model = Product
        fields = [
            "id", "name", "slug", "sku", "category",
            "description", "specifications", "selling_price",
            "is_featured", "images", "created_at",
        ]


class StaffProductSerializer(serializers.ModelSerializer):
    images = ProductImageSerializer(many=True, read_only=True)

    class Meta:
        model = Product
        fields = [
            "id", "category", "name", "slug", "sku",
            "description", "specifications",
            "cost_price", "selling_price", "reorder_level",
            "is_featured", "is_active", "images",
            "created_at", "updated_at",
        ]
        read_only_fields = ["id", "created_at", "updated_at"]

    def get_fields(self):
        fields = super().get_fields()
        request = self.context.get("request")
        user = getattr(request, "user", None)

        is_owner_or_admin = bool(
            user
            and user.is_authenticated
            and user.is_active
            and user.is_staff_member
            and user.role in {"OWNER", "ADMIN"}
        )

        if not is_owner_or_admin:
            fields.pop("cost_price", None)

        return fields