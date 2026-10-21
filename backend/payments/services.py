
from decimal import Decimal, InvalidOperation, ROUND_HALF_UP
from uuid import uuid4

from django.core.exceptions import ValidationError
from django.db import transaction
from django.db.models import Sum
from django.utils import timezone
from audit.services import log_action

from sales.models import Order
from .models import Payment


CENT = Decimal("0.01")


def _money(value):
    try:
        amount = Decimal(str(value)).quantize(
            CENT, rounding=ROUND_HALF_UP
        )
    except (InvalidOperation, TypeError, ValueError):
        raise ValidationError("Amount must be a valid monetary value.")

    if not amount.is_finite() or amount <= 0:
        raise ValidationError("Payment amount must be greater than zero.")

    return amount


def _totals(order):
    completed = order.payments.filter(
        status=Payment.Status.COMPLETED
    ).aggregate(total=Sum("amount"))["total"] or Decimal("0.00")

    pending = order.payments.filter(
        status=Payment.Status.PENDING
    ).aggregate(total=Sum("amount"))["total"] or Decimal("0.00")

    return completed, pending


def payment_summary(order):
    """Return paid, pending, balance due and unreserved balance."""
    paid, pending = _totals(order)
    total = order.total_amount

    return {
        "total": total,
        "paid": paid,
        "pending": pending,
        "balance_due": max(Decimal("0.00"), total - paid),
        "available_to_collect": max(
            Decimal("0.00"), total - paid - pending
        ),
    }


def _validate_collectable_order(order):
    if order.status in {
        Order.Status.CANCELLED,
        Order.Status.COMPLETED,
    }:
        raise ValidationError(
            "Payments cannot be collected for cancelled or completed orders."
        )


@transaction.atomic
def create_mpesa_payment(
    *,
    order_id,
    amount,
    recorded_by=None,
    notes="",
):
    """
    Create a pending M-Pesa payment request.

    This does not initiate an actual STK push or prove that money
    has been received. Provider integration comes later.
    """
    order = Order.objects.select_for_update().get(pk=order_id)
    _validate_collectable_order(order)

    amount = _money(amount)
    summary = payment_summary(order)

    if amount > summary["available_to_collect"]:
        raise ValidationError(
            "Payment exceeds the balance available for collection."
        )
    log_action(
        actor=recorded_by,
        action="MPESA_PAYMENT_REQUEST_CREATED",
        entity=payment,
        description="Pending M-Pesa payment request created.",
        metadata={
            "order_number": order.order_number,
            "amount": str(payment.amount),
        },
    )

    return Payment.objects.create(
        order=order,
        method=Payment.Method.MPESA,
        status=Payment.Status.PENDING,
        amount=amount,
        recorded_by=recorded_by,
        notes=notes,
    )

@transaction.atomic
def record_cash_payment(
    *,
    order_id,
    amount,
    recorded_by,
    notes="",
):
    """Record cash received by an authenticated, authorized staff member."""
    if (
        not recorded_by
        or not recorded_by.is_authenticated
        or not recorded_by.is_active
        or not recorded_by.is_staff_member
        or recorded_by.role not in {"OWNER", "ADMIN", "CLERK"}
    ):
        raise ValidationError("An authorized staff member is required.")

    order = Order.objects.select_for_update().get(pk=order_id)
    _validate_collectable_order(order)

    amount = _money(amount)
    summary = payment_summary(order)

    if amount > summary["available_to_collect"]:
        raise ValidationError(
            "Cash payment exceeds the balance available for collection."
        )

    payment = Payment.objects.create(
    order=order,
    method=Payment.Method.CASH,
    status=Payment.Status.COMPLETED,
    amount=amount,
    reference=f"CASH-{uuid4().hex[:12].upper()}",
    recorded_by=recorded_by,
    notes=notes,
    completed_at=timezone.now(),
    )

    log_action(
        actor=recorded_by,
        action="CASH_PAYMENT_RECORDED",
        entity=payment,
        description="Cash payment recorded.",
        metadata={
            "order_number": order.order_number,
            "amount": str(payment.amount),
            "reference": payment.reference,
        },
    )

    return payment


@transaction.atomic
def complete_verified_mpesa_payment(
    *,
    payment_id,
    verified_reference,
    verified_amount,
):
    """
    Mark an M-Pesa payment complete only after trusted server-side
    provider verification.

    Never call this with amounts or receipt details taken only
    from the customer's browser.
    """
    reference = (verified_reference or "").strip()

    if not reference:
        raise ValidationError("A verified M-Pesa receipt is required.")

    amount = _money(verified_amount)

    payment = Payment.objects.select_for_update().select_related(
        "order"
    ).get(pk=payment_id)

    if payment.method != Payment.Method.MPESA:
        raise ValidationError("This is not an M-Pesa payment.")

    if payment.status == Payment.Status.COMPLETED:
        if payment.reference == reference and payment.amount == amount:
            # Safe retry when the same verified callback is delivered twice.
            return payment

        raise ValidationError(
            "This payment has already been completed with different details."
        )

    if payment.status != Payment.Status.PENDING:
        raise ValidationError("This payment is no longer pending.")

    if payment.amount != amount:
        raise ValidationError(
            "Verified payment amount does not match the requested amount."
        )

    order = Order.objects.select_for_update().get(
        pk=payment.order_id
    )

    if order.status in {
        Order.Status.CANCELLED,
        Order.Status.COMPLETED,
    }:
        raise ValidationError(
            "This order cannot accept a new completed payment. "
            "Reconciliation is required."
        )

    if Payment.objects.filter(
        method=Payment.Method.MPESA,
        reference=reference,
    ).exclude(pk=payment.pk).exists():
        raise ValidationError("This M-Pesa receipt has already been used.")

    paid, _pending = _totals(order)

    if paid + payment.amount > order.total_amount:
        raise ValidationError(
            "Completing this payment would exceed the order total."
        )

    payment.status = Payment.Status.COMPLETED
    payment.reference = reference
    payment.completed_at = timezone.now()
    payment.save(
        update_fields=["status", "reference", "completed_at", "updated_at"]
    )
    log_action(
        action="MPESA_PAYMENT_VERIFIED",
        entity=payment,
        description="M-Pesa payment completed after verification.",
        metadata={
            "order_number": order.order_number,
            "amount": str(payment.amount),
            "reference": payment.reference,
        },
    )

    return payment


@transaction.atomic
def initiate_order_mpesa_payment(*, order_id, amount):
    from .mpesa import initiate_stk_push

    payment = create_mpesa_payment(
        order_id=order_id,
        amount=amount,
    )
   
    order = Order.objects.get(pk=order_id)

    try:
        result = initiate_stk_push(
            payment=payment,
            phone_number=order.customer_phone,
        )
    except Exception as exc:
        # Preserve the failed attempt for diagnostics and reconciliation.
        Payment.objects.filter(
            pk=payment.pk,
            status=Payment.Status.PENDING,
        ).update(
            status=Payment.Status.FAILED,
            provider_result_description=str(exc)[:255],
        )
        payment.refresh_from_db()
        log_action(
            action="MPESA_STK_INITIATION_FAILED",
            entity=payment,
            description="M-Pesa STK initiation failed.",
            metadata={"status": payment.status},
        )
        return payment, False

    Payment.objects.filter(pk=payment.pk).update(
        provider_checkout_id=result["checkout_id"],
        provider_merchant_request_id=result["merchant_id"],
    )
    payment.refresh_from_db()
    log_action(
        action="MPESA_STK_INITIATED",
        entity=payment,
        description="M-Pesa STK request accepted by the provider.",
        metadata={"status": payment.status},
    )
    return payment, True