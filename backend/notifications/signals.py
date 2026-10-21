from django.db import transaction
from django.db.models.signals import post_save, pre_save
from django.dispatch import receiver

from designs.models import DesignRequest
from payments.models import Payment
from sales.models import Order

from .models import Notification
from .services import (
    queue_design_created,
    queue_design_status_changed,
    queue_order_created,
    queue_order_status_changed,
    queue_payment_received,
)


@receiver(pre_save, sender=Order)
def capture_previous_order_status(sender, instance, **kwargs):
    instance._previous_notification_status = None
    if instance.pk:
        instance._previous_notification_status = (
            sender.objects.filter(pk=instance.pk)
            .values_list("status", flat=True)
            .first()
        )


@receiver(post_save, sender=Order)
def order_notification_events(sender, instance, created, **kwargs):
    if created:
        transaction.on_commit(
            lambda order_id=instance.pk: queue_order_created(order_id),
            robust=True,
        )
        return

    previous = getattr(instance, "_previous_notification_status", None)
    if previous and previous != instance.status:
        transaction.on_commit(
            lambda order_id=instance.pk, old=previous:
                queue_order_status_changed(order_id, old),
            robust=True,
        )


@receiver(pre_save, sender=Payment)
def capture_previous_payment_status(sender, instance, **kwargs):
    instance._previous_notification_status = None
    if instance.pk:
        instance._previous_notification_status = (
            sender.objects.filter(pk=instance.pk)
            .values_list("status", flat=True)
            .first()
        )


@receiver(post_save, sender=Payment)
def payment_notification_events(sender, instance, created, **kwargs):
    previous = getattr(instance, "_previous_notification_status", None)
    if (
        instance.status == Payment.Status.COMPLETED
        and previous != Payment.Status.COMPLETED
    ):
        transaction.on_commit(
            lambda payment_id=instance.pk:
                queue_payment_received(payment_id),
            robust=True,
        )


@receiver(pre_save, sender=DesignRequest)
def capture_previous_design_status(sender, instance, **kwargs):
    instance._previous_notification_status = None
    if instance.pk:
        instance._previous_notification_status = (
            sender.objects.filter(pk=instance.pk)
            .values_list("status", flat=True)
            .first()
        )


@receiver(post_save, sender=DesignRequest)
def design_notification_events(sender, instance, created, **kwargs):
    if created:
        transaction.on_commit(
            lambda request_id=instance.pk: queue_design_created(request_id),
            robust=True,
        )
        return

    previous = getattr(instance, "_previous_notification_status", None)
    if previous and previous != instance.status:
        transaction.on_commit(
            lambda request_id=instance.pk, old=previous:
                queue_design_status_changed(request_id, old),
            robust=True,
        )
