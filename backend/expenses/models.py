from decimal import Decimal

from django.conf import settings
from django.core.validators import MinValueValidator
from django.db import models


class Expense(models.Model):
    class Category(models.TextChoices):
        MAINTENANCE = "MAINTENANCE", "Maintenance"
        REPAIR = "REPAIR", "Repair"
        TRANSPORT = "TRANSPORT", "Transport"
        UTILITIES = "UTILITIES", "Utilities"
        RENT = "RENT", "Rent"
        SUPPLIES = "SUPPLIES", "Supplies"
        OTHER = "OTHER", "Other"

    category = models.CharField(
        max_length=20,
        choices=Category.choices,
        default=Category.OTHER,
        db_index=True,
    )
    description = models.CharField(max_length=250)
    amount = models.DecimalField(
        max_digits=12,
        decimal_places=2,
        validators=[MinValueValidator(Decimal("0.01"))],
    )
    expense_date = models.DateField(db_index=True)

    product = models.ForeignKey(
        "catalog.Product",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="expenses",
    )
    supplier = models.ForeignKey(
        "inventory.Supplier",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="expenses",
    )

    reference = models.CharField(max_length=100, blank=True)
    notes = models.TextField(blank=True)
    recorded_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="recorded_expenses",
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-expense_date", "-created_at"]
        indexes = [
            models.Index(
                fields=["expense_date", "category"],
                name="expense_date_category_idx",
            ),
        ]

    def __str__(self):
        return f"{self.expense_date} | {self.category} | {self.amount}"
