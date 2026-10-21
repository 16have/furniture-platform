from django.contrib import admin

from .models import Notification


@admin.register(Notification)
class NotificationAdmin(admin.ModelAdmin):
    list_display = (
        "created_at",
        "channel",
        "event",
        "recipient",
        "status",
        "attempts",
        "sent_at",
    )
    list_filter = ("channel", "event", "status")
    search_fields = ("recipient", "related_id", "provider_message_id")
    readonly_fields = (
        "channel",
        "event",
        "recipient",
        "subject",
        "message",
        "attempts",
        "sent_at",
        "provider_message_id",
        "last_error",
        "idempotency_key",
        "related_type",
        "related_id",
        "metadata",
        "created_at",
        "updated_at",
    )

    def has_add_permission(self, request):
        return False

    def has_delete_permission(self, request, obj=None):
        return False
