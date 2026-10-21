
from django.conf import settings
from django.db import models
from django.db.models import F, Q


class Supplier(models.Model):
    name = models.CharField(max_length=200)
    contact_person = models.CharField(max_length=150, blank=True)
    phone = models.CharField(max_length=30, blank=True)
    email = models.EmailField(blank=True)
    address = models.TextField(blank=True)
    notes = models.TextField(blank=True)
    is_active = models.BooleanField(default=True)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["name"]

    def __str__(self):
        return self.name


class StockLevel(models.Model):
    product = models.OneToOneField(
        "catalog.Product",
        on_delete=models.PROTECT,
        related_name="stock",
    )
    quantity_on_hand = models.PositiveIntegerField(default=0)
    quantity_reserved = models.PositiveIntegerField(default=0)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        constraints = [
            models.CheckConstraint(
                condition=Q(quantity_reserved__lte=F("quantity_on_hand")),
                name="reserved_stock_not_above_on_hand",
            ),
        ]

    @property
    def quantity_available(self):
        return self.quantity_on_hand - self.quantity_reserved

    @property
    def is_low_stock(self):
        return self.quantity_available <= self.product.reorder_level

    def __str__(self):
        return f"{self.product.sku}: {self.quantity_available} available"


class StockMovement(models.Model):
    class MovementType(models.TextChoices):
        RECEIPT = "RECEIPT", "Stock received"
        SALE = "SALE", "Sale"
        RESERVATION = "RESERVATION", "Stock reserved"
        RELEASE = "RELEASE", "Reservation released"
        DAMAGE = "DAMAGE", "Damaged stock"
        ADJUSTMENT = "ADJUSTMENT", "Stock adjustment"
        RETURN = "RETURN", "Stock returned"

    product = models.ForeignKey(
        "catalog.Product",
        on_delete=models.PROTECT,
        related_name="stock_movements",
    )
    movement_type = models.CharField(
        max_length=20,
        choices=MovementType.choices,
    )
    quantity_delta = models.IntegerField(
        help_text="Signed change to physical stock; positive adds stock, negative removes it.",
    )
    quantity_reserved_delta = models.IntegerField(
        default=0,
        help_text="Signed change to reserved stock.",
    )
    supplier = models.ForeignKey(
        Supplier,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="stock_movements",
    )
    reference = models.CharField(max_length=100, blank=True)
    notes = models.TextField(blank=True)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="stock_movements",
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["product", "-created_at"]),
            models.Index(fields=["movement_type", "-created_at"]),
        ]

    def __str__(self):
        return (
            f"{self.product.sku} | {self.movement_type} | "
            f"stock {self.quantity_delta:+d}"
        )