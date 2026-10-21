import uuid

from django.conf import settings
from django.core.validators import MinValueValidator
from django.db import models


class DesignRequest(models.Model):
    class Status(models.TextChoices):
        REQUESTED = "REQUESTED", "Requested"
        REVIEWING = "REVIEWING", "Reviewing"
        QUOTED = "QUOTED", "Quoted"
        APPROVED = "APPROVED", "Approved"
        IN_PRODUCTION = "IN_PRODUCTION", "In production"
        READY = "READY", "Ready"
        COMPLETED = "COMPLETED", "Completed"
        CANCELLED = "CANCELLED", "Cancelled"

    reference = models.CharField(
        max_length=20,
        unique=True,
        editable=False,
    )

    customer = models.ForeignKey(
        "customers.Customer",
        on_delete=models.PROTECT,
        related_name="design_requests",
        null=True,
        blank=True,
    )
    customer_name = models.CharField(max_length=200)
    customer_phone = models.CharField(max_length=30, db_index=True)
    customer_email = models.EmailField(blank=True)

    title = models.CharField(max_length=200)
    description = models.TextField()
    dimensions = models.JSONField(default=dict, blank=True)
    materials = models.CharField(max_length=500, blank=True)
    finish = models.CharField(max_length=200, blank=True)
    quantity = models.PositiveIntegerField(
        default=1,
        validators=[MinValueValidator(1)],
    )
    notes = models.TextField(blank=True)
    reference_image_url = models.URLField(max_length=1000, blank=True)

    status = models.CharField(
        max_length=20,
        choices=Status.choices,
        default=Status.REQUESTED,
        db_index=True,
    )

    estimated_price = models.DecimalField(
        max_digits=12,
        decimal_places=2,
        null=True,
        blank=True,
        validators=[MinValueValidator(0)],
    )
    estimated_production_days = models.PositiveIntegerField(
        null=True,
        blank=True,
    )

    internal_production_cost = models.DecimalField(
        max_digits=12,
        decimal_places=2,
        null=True,
        blank=True,
        validators=[MinValueValidator(0)],
    )
    internal_notes = models.TextField(blank=True)

    reviewed_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="reviewed_design_requests",
    )
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="created_design_requests",
    )

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at"]
        indexes = [
            models.Index(
                fields=["status", "-created_at"],
                name="design_status_created_idx",
            ),
            models.Index(
                fields=["customer_phone", "-created_at"],
                name="design_phone_created_idx",
            ),
        ]

    def save(self, *args, **kwargs):
        if not self.reference:
            self.reference = f"DSN-{uuid.uuid4().hex[:12].upper()}"
        super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.reference} - {self.title}"
