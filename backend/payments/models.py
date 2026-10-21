
from decimal import Decimal

from django.conf import settings
from django.core.validators import MinValueValidator
from django.db import models
from django.db.models import Q


class Payment(models.Model):
    class Method(models.TextChoices):
        MPESA = "MPESA", "M-Pesa"
        CASH = "CASH", "Cash"

    class Status(models.TextChoices):
        PENDING = "PENDING", "Pending"
        COMPLETED = "COMPLETED", "Completed"
        FAILED = "FAILED", "Failed"
        REFUNDED = "REFUNDED", "Refunded"

    order = models.ForeignKey(
        "sales.Order",
        on_delete=models.PROTECT,
        related_name="payments",
    )
    method = models.CharField(max_length=10, choices=Method.choices)
    status = models.CharField(
        max_length=10,
        choices=Status.choices,
        default=Status.PENDING,
        db_index=True,
    )
    amount = models.DecimalField(
        max_digits=12,
        decimal_places=2,
        validators=[MinValueValidator(Decimal("0.01"))],
    )

    # M-Pesa receipt or internal cash reference.
    reference = models.CharField(max_length=100, blank=True, db_index=True)
    provider_checkout_id = models.CharField(max_length=150, blank=True)
    provider_merchant_request_id = models.CharField(
        max_length=150, blank=True
    )
    provider_result_code = models.CharField(max_length=20, blank=True)
    provider_result_description = models.CharField(
        max_length=255, blank=True
    )

    recorded_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="recorded_payments",
    )
    notes = models.TextField(blank=True)
    completed_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["order", "status"]),
        ]
        constraints = [
            models.CheckConstraint(
                condition=Q(amount__gt=0),
                name="payment_amount_positive",
            ),
            models.UniqueConstraint(
                fields=["method", "reference"],
                condition=~Q(reference=""),
                name="unique_payment_method_reference",
            ),
            models.UniqueConstraint(
                fields=["provider_checkout_id"],
                condition=~Q(provider_checkout_id=""),
                name="unique_provider_checkout_id",
            ),
        ]

    def __str__(self):
        return f"{self.order.order_number} — {self.method} — {self.amount}"
