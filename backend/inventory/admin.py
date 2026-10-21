
from django.contrib import admin
from .models import Supplier, StockLevel, StockMovement


@admin.register(Supplier)
class SupplierAdmin(admin.ModelAdmin):
    list_display = ("name", "contact_person", "phone", "is_active")
    search_fields = ("name", "contact_person", "phone")
    list_filter = ("is_active",)


@admin.register(StockLevel)
class StockLevelAdmin(admin.ModelAdmin):
    list_display = (
        "product",
        "quantity_on_hand",
        "quantity_reserved",
        "available_stock",
        "low_stock",
    )
    search_fields = ("product__name", "product__sku")

    @admin.display(description="Available")
    def available_stock(self, obj):
        return obj.quantity_available

    @admin.display(boolean=True, description="Low stock")
    def low_stock(self, obj):
        return obj.is_low_stock


@admin.register(StockMovement)
class StockMovementAdmin(admin.ModelAdmin):
    list_display = (
        "product",
        "movement_type",
        "quantity_delta",
        "reference",
        "created_by",
        "created_at",
    )
    list_filter = ("movement_type", "created_at")
    search_fields = ("product__name", "product__sku", "reference")
    readonly_fields = ("created_at",)