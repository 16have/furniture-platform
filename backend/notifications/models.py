import uuid

from django.conf import settings
from django.db import models
from django.utils import timezone


class Notification(models.Model):
    class Channel(models.TextChoices):
        EMAIL = "EMAIL", "Email"
        SMS = "SMS", "SMS"
        WHATSAPP = "WHATSAPP", "WhatsApp"

    class Status(models.TextChoices):
        QUEUED = "QUEUED", "Queued"
        SENDING = "SENDING", "Sending"
        SENT = "SENT", "Sent"
        FAILED = "FAILED", "Failed"

    class Event(models.TextChoices):
        ORDER_CREATED = "ORDER_CREATED", "Order created"
        ORDER_STATUS_CHANGED = "ORDER_STATUS_CHANGED", "Order status changed"
        PAYMENT_RECEIVED = "PAYMENT_RECEIVED", "Payment received"
        DESIGN_REQUEST_CREATED = "DESIGN_REQUEST_CREATED", "Design request received"
        DESIGN_STATUS_CHANGED = "DESIGN_STATUS_CHANGED", "Design status changed"

    channel = models.CharField(max_length=12, choices=Channel.choices)
    event = models.CharField(max_length=40, db_index=True)
    recipient = models.CharField(max_length=255)
    subject = models.CharField(max_length=200, blank=True)
    message = models.TextField()

    status = models.CharField(
        max_length=10,
        choices=Status.choices,
        default=Status.QUEUED,
        db_index=True,
    )
    attempts = models.PositiveIntegerField(default=0)
    max_attempts = models.PositiveIntegerField(default=5)
    next_attempt_at = models.DateTimeField(default=timezone.now, db_index=True)
    sent_at = models.DateTimeField(null=True, blank=True)

    provider_message_id = models.CharField(max_length=200, blank=True)
    last_error = models.TextField(blank=True)
    idempotency_key = models.CharField(
        max_length=64,
        unique=True,
        default=uuid.uuid4,
        editable=False,
    )

    related_type = models.CharField(max_length=80, blank=True)
    related_id = models.CharField(max_length=100, blank=True)
    metadata = models.JSONField(default=dict, blank=True)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["created_at"]
        indexes = [
            models.Index(
                fields=["status", "next_attempt_at"],
                name="notification_retry_idx",
            ),
            models.Index(
                fields=["related_type", "related_id"],
                name="notification_entity_idx",
            ),
        ]

    def __str__(self):
        return f"{self.channel} {self.event} -> {self.recipient} ({self.status})"
