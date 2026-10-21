from rest_framework import serializers

from .models import Notification


class NotificationSerializer(serializers.ModelSerializer):
    class Meta:
        model = Notification
        fields = [
            "id",
            "channel",
            "event",
            "recipient",
            "subject",
            "message",
            "status",
            "attempts",
            "max_attempts",
            "next_attempt_at",
            "sent_at",
            "provider_message_id",
            "last_error",
            "related_type",
            "related_id",
            "metadata",
            "created_at",
            "updated_at",
        ]
        read_only_fields = fields
