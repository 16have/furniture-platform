from decimal import Decimal

from rest_framework import serializers

from catalog.models import Product
from .models import SuspendedCart, Order


class SuspendedCartSerializer(serializers.ModelSerializer):
    class Meta:
        model = SuspendedCart
        fields = [
            "id",
            "customer_name",
            "customer_phone",
            "customer_email",
            "fulfillment_type",
            "delivery_address",
            "requested_fulfillment_at",
            "delivery_fee",
            "discount_amount",
            "customer_notes",
            "internal_notes",
            "items",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "created_at", "updated_at"]

    def validate(self, attrs):
        request = self.context.get("request")
        user = request.user if request else None

        items = attrs.get("items", getattr(self.instance, "items", []))
        if not isinstance(items, list) or not items:
            raise serializers.ValidationError({
                "items": "Add at least one product to the cart."
            })

        seen = set()
        normalized = []

        for item in items:
            if not isinstance(item, dict):
                raise serializers.ValidationError({
                    "items": "Each item must contain product_id and quantity."
                })

            product_id = item.get("product_id")
            quantity = item.get("quantity")

            if (
                isinstance(product_id, bool)
                or not isinstance(product_id, int)
                or product_id <= 0
            ):
                raise serializers.ValidationError({
                    "items": "Each product_id must be a positive integer."
                })

            if (
                isinstance(quantity, bool)
                or not isinstance(quantity, int)
                or quantity <= 0
            ):
                raise serializers.ValidationError({
                    "items": "Each quantity must be a positive integer."
                })

            if product_id in seen:
                raise serializers.ValidationError({
                    "items": "Each product may appear only once."
                })

            seen.add(product_id)
            normalized.append({
                "product_id": product_id,
                "quantity": quantity,
            })

        products = Product.objects.filter(
            id__in=seen,
            is_active=True,
        )
        if products.count() != len(seen):
            raise serializers.ValidationError({
                "items": "One or more products are unavailable."
            })

        fulfillment = attrs.get(
            "fulfillment_type",
            getattr(
                self.instance,
                "fulfillment_type",
                Order.FulfillmentType.PICKUP,
            ),
        )
        address = attrs.get(
            "delivery_address",
            getattr(self.instance, "delivery_address", ""),
        )
        if (
            fulfillment == Order.FulfillmentType.DELIVERY
            and not address.strip()
        ):
            raise serializers.ValidationError({
                "delivery_address": "An address is required for delivery."
            })

        discount = Decimal(str(attrs.get(
            "discount_amount",
            getattr(self.instance, "discount_amount", 0),
        )))
        if discount < 0:
            raise serializers.ValidationError({
                "discount_amount": "Discount cannot be negative."
            })

        if discount > 0 and (
            not user
            or getattr(user, "role", None) not in {"OWNER", "ADMIN"}
        ):
            raise serializers.ValidationError({
                "discount_amount": "Only an owner or admin can apply discounts."
            })

        delivery_fee = Decimal(str(attrs.get(
            "delivery_fee",
            getattr(self.instance, "delivery_fee", 0),
        )))
        if delivery_fee < 0:
            raise serializers.ValidationError({
                "delivery_fee": "Delivery fee cannot be negative."
            })

        attrs["items"] = normalized
        return attrs

    def create(self, validated_data):
        validated_data["created_by"] = self.context["request"].user
        return super().create(validated_data)