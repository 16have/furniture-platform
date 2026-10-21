from django.utils import timezone
from rest_framework import viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import ValidationError
from rest_framework.response import Response

from .models import Notification
from .serializers import NotificationSerializer


class NotificationViewSet(viewsets.ReadOnlyModelViewSet):
    serializer_class = NotificationSerializer
    http_method_names = ["get", "post", "head", "options"]
    filterset_fields = ["channel", "event", "status"]
    search_fields = ["recipient", "related_id", "last_error"]
    ordering_fields = ["created_at", "updated_at", "attempts"]
    ordering = ["-created_at"]

    def get_queryset(self):
        user = self.request.user
        if not (
            user.is_authenticated
            and user.is_active
            and getattr(user, "is_staff_member", False)
            and user.role in {"OWNER", "ADMIN"}
        ):
            return Notification.objects.none()

        return Notification.objects.all()

    def get_permissions(self):
        from rest_framework.permissions import IsAuthenticated
        return [IsAuthenticated()]

    @action(detail=True, methods=["post"])
    def retry(self, request, pk=None):
        user = request.user
        if user.role not in {"OWNER", "ADMIN"}:
            raise ValidationError("Only an owner or admin can retry messages.")

        notification = self.get_object()
        if notification.status == Notification.Status.SENT:
            raise ValidationError("This notification has already been sent.")

        notification.status = Notification.Status.QUEUED
        notification.attempts = 0
        notification.next_attempt_at = timezone.now()
        notification.last_error = ""
        notification.save(update_fields=[
            "status",
            "attempts",
            "next_attempt_at",
            "last_error",
            "updated_at",
        ])

        return Response(NotificationSerializer(notification).data)
