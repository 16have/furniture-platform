import hashlib
import logging
import re
from datetime import timedelta

import requests
from django.conf import settings
from django.core.mail import send_mail
from django.db import transaction
from django.utils import timezone

from .models import Notification

logger = logging.getLogger(__name__)


def _key(channel, event, entity_type, entity_id, suffix=""):
    raw = f"{channel}|{event}|{entity_type}|{entity_id}|{suffix}"
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()


def queue_message(
    *,
    channel,
    event,
    recipient,
    message,
    subject="",
    related_type="",
    related_id="",
    metadata=None,
    idempotency_key=None,
):
    recipient = (recipient or "").strip()
    if not recipient:
        return None

    if channel not in Notification.Channel.values:
        raise ValueError("Unsupported notification channel.")

    key = idempotency_key or _key(
        channel,
        event,
        related_type,
        related_id,
        recipient,
    )

    notification, created = Notification.objects.get_or_create(
        idempotency_key=key,
        defaults={
            "channel": channel,
            "event": event,
            "recipient": recipient,
            "subject": subject[:200],
            "message": message,
            "related_type": related_type[:80],
            "related_id": str(related_id)[:100],
            "metadata": metadata or {},
        },
    )

    return notification


def queue_customer_message(
    *,
    event,
    phone="",
    email="",
    message,
    subject="",
    related_type="",
    related_id="",
    metadata=None,
):
    """
    Write an outbox record for each available contact method.
    No provider/network request is made here.
    """
    created = []

    if email:
        item = queue_message(
            channel=Notification.Channel.EMAIL,
            event=event,
            recipient=email,
            subject=subject or "Update from our furniture store",
            message=message,
            related_type=related_type,
            related_id=related_id,
            metadata=metadata,
        )
        if item:
            created.append(item)

    if phone:
        for channel in (
            Notification.Channel.SMS,
            Notification.Channel.WHATSAPP,
        ):
            item = queue_message(
                channel=channel,
                event=event,
                recipient=phone,
                message=message,
                subject=subject,
                related_type=related_type,
                related_id=related_id,
                metadata=metadata,
            )
            if item:
                created.append(item)

    return created


def queue_order_created(order_id):
    from sales.models import Order

    try:
        order = Order.objects.get(pk=order_id)
        queue_customer_message(
            event=Notification.Event.ORDER_CREATED,
            phone=order.customer_phone,
            email=order.customer_email,
            subject=f"Order {order.order_number} received",
            message=(
                f"Hello {order.customer_name}, we have received order "
                f"{order.order_number}. "
                f"Total: KES {order.total_amount}. "
                "We will update you as your order progresses."
            ),
            related_type="sales.Order",
            related_id=order.pk,
            metadata={"order_number": order.order_number},
        )
    except Exception:
        logger.exception("Could not queue order-created notification.")


def queue_order_status_changed(order_id, previous_status):
    from sales.models import Order

    try:
        order = Order.objects.get(pk=order_id)
        queue_customer_message(
            event=Notification.Event.ORDER_STATUS_CHANGED,
            phone=order.customer_phone,
            email=order.customer_email,
            subject=f"Order {order.order_number} update",
            message=(
                f"Hello {order.customer_name}, order {order.order_number} "
                f"has been updated to: {order.get_status_display()}."
            ),
            related_type="sales.Order",
            related_id=order.pk,
            metadata={
                "order_number": order.order_number,
                "previous_status": previous_status,
                "new_status": order.status,
            },
        )
    except Exception:
        logger.exception("Could not queue order-status notification.")


def queue_payment_received(payment_id):
    from payments.models import Payment

    try:
        payment = Payment.objects.select_related("order").get(pk=payment_id)
        order = payment.order
        queue_customer_message(
            event=Notification.Event.PAYMENT_RECEIVED,
            phone=order.customer_phone,
            email=order.customer_email,
            subject=f"Payment received for {order.order_number}",
            message=(
                f"Hello {order.customer_name}, we have confirmed receipt "
                f"of KES {payment.amount} for order {order.order_number}. "
                "Thank you."
            ),
            related_type="payments.Payment",
            related_id=payment.pk,
            metadata={
                "order_number": order.order_number,
                "payment_method": payment.method,
            },
        )
    except Exception:
        logger.exception("Could not queue payment notification.")


def queue_design_created(request_id):
    from designs.models import DesignRequest

    try:
        item = DesignRequest.objects.get(pk=request_id)
        queue_customer_message(
            event=Notification.Event.DESIGN_REQUEST_CREATED,
            phone=item.customer_phone,
            email=item.customer_email,
            subject=f"Design request {item.reference} received",
            message=(
                f"Hello {item.customer_name}, we received your custom "
                f"furniture design request {item.reference}. "
                "Our team will review it and contact you with an update."
            ),
            related_type="designs.DesignRequest",
            related_id=item.pk,
            metadata={"reference": item.reference},
        )
    except Exception:
        logger.exception("Could not queue design-request notification.")


def queue_design_status_changed(request_id, previous_status):
    from designs.models import DesignRequest

    try:
        item = DesignRequest.objects.get(pk=request_id)
        message = (
            f"Hello {item.customer_name}, your design request "
            f"{item.reference} is now {item.get_status_display()}."
        )

        if item.status == DesignRequest.Status.QUOTED:
            message += (
                f" Estimated price: KES {item.estimated_price}. "
                f"Estimated production time: "
                f"{item.estimated_production_days} days."
            )

        queue_customer_message(
            event=Notification.Event.DESIGN_STATUS_CHANGED,
            phone=item.customer_phone,
            email=item.customer_email,
            subject=f"Design request {item.reference} update",
            message=message,
            related_type="designs.DesignRequest",
            related_id=item.pk,
            metadata={
                "reference": item.reference,
                "previous_status": previous_status,
                "new_status": item.status,
            },
        )
    except Exception:
        logger.exception("Could not queue design-status notification.")


def _send_email(notification):
    if not settings.EMAIL_HOST or not settings.DEFAULT_FROM_EMAIL:
        raise RuntimeError("Email SMTP settings are not configured.")

    count = send_mail(
        subject=notification.subject or "Furniture store update",
        message=notification.message,
        from_email=settings.DEFAULT_FROM_EMAIL,
        recipient_list=[notification.recipient],
        fail_silently=False,
    )
    if count != 1:
        raise RuntimeError("Email provider did not confirm a sent message.")

    return ""


def _normalize_phone(value):
    # Twilio and WhatsApp expect international-format numbers.
    phone = re.sub(r"[^\d+]", "", value or "")
    if phone.startswith("00"):
        phone = "+" + phone[2:]
    if not phone.startswith("+") or len(phone) < 9:
        raise ValueError(
            "Phone number must include its international country code."
        )
    return phone


def _send_sms(notification):
    sid = settings.TWILIO_ACCOUNT_SID
    token = settings.TWILIO_AUTH_TOKEN
    sender = settings.TWILIO_FROM_NUMBER

    if not sid or not token or not sender:
        raise RuntimeError("Twilio SMS credentials are not configured.")

    response = requests.post(
        f"https://api.twilio.com/2010-04-01/Accounts/{sid}/Messages.json",
        auth=(sid, token),
        data={
            "From": sender,
            "To": _normalize_phone(notification.recipient),
            "Body": notification.message,
        },
        timeout=settings.NOTIFICATION_HTTP_TIMEOUT,
    )
    response.raise_for_status()
    data = response.json()
    return data.get("sid", "")


def _send_whatsapp(notification):
    token = settings.WHATSAPP_ACCESS_TOKEN
    phone_number_id = settings.WHATSAPP_PHONE_NUMBER_ID

    if not token or not phone_number_id:
        raise RuntimeError("WhatsApp Business API credentials are not configured.")

    phone = _normalize_phone(notification.recipient).lstrip("+")

    response = requests.post(
        (
            f"https://graph.facebook.com/"
            f"{settings.WHATSAPP_API_VERSION}/{phone_number_id}/messages"
        ),
        headers={"Authorization": f"Bearer {token}"},
        json={
            "messaging_product": "whatsapp",
            "recipient_type": "individual",
            "to": phone,
            "type": "text",
            "text": {
                "preview_url": False,
                "body": notification.message,
            },
        },
        timeout=settings.NOTIFICATION_HTTP_TIMEOUT,
    )
    response.raise_for_status()
    data = response.json()
    messages = data.get("messages", [])
    return messages[0].get("id", "") if messages else ""


def deliver_notification(notification_id):
    """
    Attempt one delivery. Provider errors are persisted and retried later.
    Run this from the notification worker, never inside checkout.
    """
    now = timezone.now()

    with transaction.atomic():
        notification = (
            Notification.objects.select_for_update()
            .get(pk=notification_id)
        )

        if notification.status == Notification.Status.SENT:
            return True

        if notification.attempts >= notification.max_attempts:
            notification.status = Notification.Status.FAILED
            notification.save(update_fields=["status", "updated_at"])
            return False

        notification.status = Notification.Status.SENDING
        notification.attempts += 1
        notification.last_error = ""
        notification.save(update_fields=[
            "status", "attempts", "last_error", "updated_at",
        ])

    try:
        if notification.channel == Notification.Channel.EMAIL:
            provider_id = _send_email(notification)
        elif notification.channel == Notification.Channel.SMS:
            provider_id = _send_sms(notification)
        elif notification.channel == Notification.Channel.WHATSAPP:
            provider_id = _send_whatsapp(notification)
        else:
            raise ValueError("Unsupported notification channel.")

        Notification.objects.filter(pk=notification_id).update(
            status=Notification.Status.SENT,
            sent_at=timezone.now(),
            provider_message_id=provider_id,
            last_error="",
            updated_at=timezone.now(),
        )
        return True

    except Exception as exc:
        attempts = notification.attempts
        exhausted = attempts >= notification.max_attempts
        delay_minutes = min(2 ** attempts, 60)

        Notification.objects.filter(pk=notification_id).update(
            status=(
                Notification.Status.FAILED
                if exhausted
                else Notification.Status.QUEUED
            ),
            last_error=str(exc)[:4000],
            next_attempt_at=now + timedelta(minutes=delay_minutes),
            updated_at=timezone.now(),
        )
        logger.warning(
            "Notification %s failed on attempt %s: %s",
            notification_id,
            attempts,
            exc,
        )
        return False
