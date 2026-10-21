from datetime import timedelta

from django.core.management.base import BaseCommand
from django.db.models import Q
from django.utils import timezone

from notifications.models import Notification
from notifications.services import deliver_notification


class Command(BaseCommand):
    help = "Deliver queued email, SMS, and WhatsApp notifications."

    def add_arguments(self, parser):
        parser.add_argument("--limit", type=int, default=100)

    def handle(self, *args, **options):
        limit = options["limit"]
        if limit < 1:
            self.stderr.write("Limit must be greater than zero.")
            return

        now = timezone.now()
        stale_sending = now - timedelta(minutes=15)

        # Recover records left in SENDING if a worker was interrupted.
        Notification.objects.filter(
            status=Notification.Status.SENDING,
            updated_at__lte=stale_sending,
        ).update(
            status=Notification.Status.QUEUED,
            next_attempt_at=now,
        )

        ids = list(
            Notification.objects.filter(
                attempts__lt=__import__("django.db.models", fromlist=["F"]).F(
                    "max_attempts"
                ),
                next_attempt_at__lte=now,
            )
            .filter(
                Q(status=Notification.Status.QUEUED)
                | Q(status=Notification.Status.FAILED)
            )
            .order_by("created_at")
            .values_list("id", flat=True)[:limit]
        )

        sent = 0
        failed = 0

        for notification_id in ids:
            if deliver_notification(notification_id):
                sent += 1
            else:
                failed += 1

        self.stdout.write(
            self.style.SUCCESS(
                f"Processed {len(ids)} notifications: "
                f"{sent} sent, {failed} failed or awaiting retry."
            )
        )
