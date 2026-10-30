from django.db import models
from decimal import Decimal

from django.conf import settings
from django.core.validators import MinValueValidator



class Order(models.Model):
    class Source(models.TextChoices):
        ONLINE = "ONLINE", "Online"
        POS = "POS", "Point of sale"

    class Status(models.TextChoices):
        DRAFT = "DRAFT", "Draft"
        PENDING_PAYMENT = "PENDING_PAYMENT", "Pending payment"
        CONFIRMED = "CONFIRMED", "Confirmed"
        PROCESSING = "PROCESSING", "Processing"
        READY = "READY", "Ready"
        COMPLETED = "COMPLETED", "Completed"
        CANCELLED = "CANCELLED", "Cancelled"

    class FulfillmentType(models.TextChoices):
        PICKUP = "PICKUP", "Pickup"
        DELIVERY = "DELIVERY", "Delivery"

    order_number = models.CharField(max_length=40, unique=True)
    source = models.CharField(max_length=10, choices=Source.choices)
    status = models.CharField(
        max_length=20,
        choices=Status.choices,
        default=Status.DRAFT,
        db_index=True,
    )
    tracking_token_hash = models.CharField(
    max_length=64,
    unique=True,
    null=True,
    blank=True,
    editable=False,
    )

    customer = models.ForeignKey(
        "customers.Customer",
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="orders",
    )
    customer_name = models.CharField(max_length=200)
    customer_phone = models.CharField(max_length=30, db_index=True)
    customer_email = models.EmailField(blank=True)

    fulfillment_type = models.CharField(
        max_length=10,
        choices=FulfillmentType.choices,
        default=FulfillmentType.PICKUP,
    )
    delivery_address = models.TextField(blank=True)
    requested_fulfillment_at = models.DateTimeField(null=True, blank=True)
    confirmed_fulfillment_at = models.DateTimeField(null=True, blank=True)

    subtotal = models.DecimalField(
        max_digits=12,
        decimal_places=2,
        default=Decimal("0.00"),
        validators=[MinValueValidator(Decimal("0.00"))],
    )
    discount_amount = models.DecimalField(
        max_digits=12,
        decimal_places=2,
        default=Decimal("0.00"),
        validators=[MinValueValidator(Decimal("0.00"))],
    )
    delivery_fee = models.DecimalField(
        max_digits=12,
        decimal_places=2,
        default=Decimal("0.00"),
        validators=[MinValueValidator(Decimal("0.00"))],
    )
    total_amount = models.DecimalField(
        max_digits=12,
        decimal_places=2,
        default=Decimal("0.00"),
        validators=[MinValueValidator(Decimal("0.00"))],
    )

    customer_notes = models.TextField(blank=True)
    internal_notes = models.TextField(blank=True)

    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="created_orders",
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["source", "status"]),
            models.Index(fields=["customer_phone", "-created_at"]),
        ]

    def __str__(self):
        return self.order_number


class OrderItem(models.Model):
    order = models.ForeignKey(
        Order,
        on_delete=models.PROTECT,
        related_name="items",
    )
    product = models.ForeignKey(
        "catalog.Product",
        on_delete=models.PROTECT,
        related_name="order_items",
    )

    # Historical snapshots: these remain unchanged if the catalog changes.
    product_name = models.CharField(max_length=200)
    sku = models.CharField(max_length=100)
    quantity = models.PositiveIntegerField(
        validators=[MinValueValidator(1)],
    )
    unit_price = models.DecimalField(
        max_digits=12,
        decimal_places=2,
        validators=[MinValueValidator(Decimal("0.00"))],
    )
    unit_cost = models.DecimalField(
        max_digits=12,
        decimal_places=2,
        default=Decimal("0.00"),
        validators=[MinValueValidator(Decimal("0.00"))],
        help_text="Product cost captured when this order item was created.",
    )
    line_total = models.DecimalField(
        max_digits=12,
        decimal_places=2,
        validators=[MinValueValidator(Decimal("0.00"))],
    )

    class Meta:
        ordering = ["id"]
        constraints = [
            models.CheckConstraint(
                condition=models.Q(quantity__gt=0),
                name="order_item_quantity_positive",
            ),
            models.CheckConstraint(
                condition=models.Q(unit_price__gte=0),
                name="order_item_unit_price_nonnegative",
            ),
        ]

    def __str__(self):
        return f"{self.order.order_number}: {self.product_name} x {self.quantity}"
class SuspendedCart(models.Model):
    created_by = models.ForeignKey(
        "accounts.User",
        on_delete=models.CASCADE,
        related_name="suspended_carts",
    )
    customer = models.ForeignKey(
        "customers.Customer",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="suspended_carts",
    )
    customer_name = models.CharField(max_length=150)
    customer_phone = models.CharField(max_length=30)
    customer_email = models.EmailField(blank=True)

    fulfillment_type = models.CharField(
        max_length=20,
        choices=Order.FulfillmentType.choices,
        default=Order.FulfillmentType.PICKUP,
    )
    delivery_address = models.TextField(blank=True)
    requested_fulfillment_at = models.DateTimeField(
        null=True,
        blank=True,
    )

    delivery_fee = models.DecimalField(
        max_digits=12,
        decimal_places=2,
        default=0,
    )
    discount_amount = models.DecimalField(
        max_digits=12,
        decimal_places=2,
        default=0,
    )

    customer_notes = models.TextField(blank=True)
    internal_notes = models.TextField(blank=True)
    items = models.JSONField(default=list)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-updated_at"]

    def __str__(self):
        return f"Suspended cart #{self.pk} - {self.customer_name}"