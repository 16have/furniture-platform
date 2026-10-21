
from decimal import Decimal, InvalidOperation, ROUND_HALF_UP
from uuid import uuid4

from django.core.exceptions import ValidationError
from django.db import transaction

from catalog.models import Product
from customers.models import Customer
from inventory.services import reserve_stock, release_reservation, fulfill_reserved_stock
from payments.models import Payment
from .models import Order, OrderItem
from rest_framework import serializers
from audit.services import log_action


CENT = Decimal("0.01")


def money(value, field_name):
    try:
        amount = Decimal(str(value)).quantize(
            CENT, rounding=ROUND_HALF_UP
        )
    except (InvalidOperation, TypeError, ValueError):
        raise ValidationError(f"{field_name} must be a valid monetary amount.")

    if not amount.is_finite() or amount < 0:
        raise ValidationError(f"{field_name} cannot be negative.")

    return amount


def generate_order_number():
    return f"ORD-{uuid4().hex[:12].upper()}"


@transaction.atomic
def create_order(
    *,
    source,
    customer_name,
    customer_phone,
    items,
    customer_email="",
    fulfillment_type=Order.FulfillmentType.PICKUP,
    delivery_address="",
    requested_fulfillment_at=None,
    delivery_fee="0.00",
    discount_amount="0.00",
    customer_notes="",
    internal_notes="",
    created_by=None,
):
    """
    Create an order from product IDs and quantities.

    Expected items:
        [{"product_id": 1, "quantity": 2}, ...]

    Prices are always read from the database.
    Stock is reserved atomically for every order.
    """
    if source not in Order.Source.values:
        raise ValidationError("Invalid order source.")

    if fulfillment_type not in Order.FulfillmentType.values:
        raise ValidationError("Invalid fulfillment type.")

    customer_name = (customer_name or "").strip()
    customer_phone = (customer_phone or "").strip()
    customer_email = (customer_email or "").strip()

    if not customer_name:
        raise ValidationError("Customer name is required.")

    if not customer_phone:
        raise ValidationError("Customer phone is required.")

    if not isinstance(items, list) or not items:
        raise ValidationError("An order must contain at least one item.")

    if (
        fulfillment_type == Order.FulfillmentType.DELIVERY
        and not delivery_address.strip()
    ):
        raise ValidationError("A delivery address is required.")

    delivery_fee = money(delivery_fee, "Delivery fee")
    discount_amount = money(discount_amount, "Discount")

    # Reject duplicate products and malformed quantities.
    normalized_items = []
    seen_product_ids = set()

    for item in items:
        if not isinstance(item, dict):
            raise ValidationError("Each item must be an object.")

        product_id = item.get("product_id")
        quantity = item.get("quantity")

        if (
            isinstance(product_id, bool)
            or not isinstance(product_id, int)
            or product_id <= 0
        ):
            raise ValidationError("Each item needs a valid product ID.")

        if (
            isinstance(quantity, bool)
            or not isinstance(quantity, int)
            or quantity <= 0
        ):
            raise ValidationError("Item quantities must be positive integers.")

        if product_id in seen_product_ids:
            raise ValidationError(
                "Each product may appear only once in the order."
            )

        seen_product_ids.add(product_id)
        normalized_items.append((product_id, quantity))

    product_ids = [product_id for product_id, _ in normalized_items]
    products = Product.objects.filter(
        pk__in=product_ids,
        is_active=True,
    )
    products_by_id = {product.pk: product for product in products}

    if len(products_by_id) != len(product_ids):
        raise ValidationError(
            "One or more products do not exist or are inactive."
        )

    subtotal = Decimal("0.00")
    line_data = []

    for product_id, quantity in normalized_items:
        product = products_by_id[product_id]
        unit_price = money(product.selling_price, "Product selling price")
        line_total = (unit_price * quantity).quantize(CENT)

        subtotal += line_total
        line_data.append(
            (product, quantity, unit_price, line_total)
        )

    subtotal = subtotal.quantize(CENT)

    if discount_amount > subtotal:
        raise ValidationError("Discount cannot exceed the subtotal.")

    total_amount = (
        subtotal - discount_amount + delivery_fee
    ).quantize(CENT)

    # Link to an existing customer by phone, or create a guest customer.
    customer = Customer.objects.filter(
        phone=customer_phone
    ).order_by("id").first()

    if customer is None:
        customer = Customer.objects.create(
            name=customer_name,
            phone=customer_phone,
            email=customer_email,
        )

    order = Order.objects.create(
        order_number=generate_order_number(),
        source=source,
        status=Order.Status.PENDING_PAYMENT,
        customer=customer,
        customer_name=customer_name,
        customer_phone=customer_phone,
        customer_email=customer_email,
        fulfillment_type=fulfillment_type,
        delivery_address=delivery_address,
        requested_fulfillment_at=requested_fulfillment_at,
        subtotal=subtotal,
        discount_amount=discount_amount,
        delivery_fee=delivery_fee,
        total_amount=total_amount,
        customer_notes=customer_notes,
        internal_notes=internal_notes,
        created_by=created_by,
    )

    for product, quantity, unit_price, line_total in line_data:
        OrderItem.objects.create(
            order=order,
            product=product,
            product_name=product.name,
            sku=product.sku,
            quantity=quantity,
            unit_price=unit_price,
            unit_cost=money(product.cost_price, "Product cost price"),
            line_total=line_total,
        )

        reserve_stock(
            product.pk,
            quantity,
            user=created_by,
            reference=order.order_number,
            notes="Reserved for order",
        )
        log_action(
            actor=created_by,
            action="ORDER_CREATED",
            entity=order,
            description="Order created and stock reserved.",
            metadata={
                "source": order.source,
                "status": order.status,
                "item_count": len(line_data),
                "total_amount": str(order.total_amount),
            },
        )

    return order

@transaction.atomic
def cancel_order(*, order_id, user=None, reason=""):
    """
    Cancel an order and release its outstanding stock reservations.

    Orders with completed payments require the refund workflow,
    which will be implemented separately.
    """
    order = Order.objects.select_for_update().get(pk=order_id)

    if order.status == Order.Status.CANCELLED:
        raise ValidationError("This order is already cancelled.")

    if order.status == Order.Status.COMPLETED:
        raise ValidationError("Completed orders cannot be cancelled.")

    if order.payments.filter(
        status=Payment.Status.COMPLETED
    ).exists():
        raise ValidationError(
            "This order has completed payments. Process a refund "
            "before implementing cancellation for paid orders."
        )

    if order.status not in {
        Order.Status.DRAFT,
        Order.Status.PENDING_PAYMENT,
        Order.Status.CONFIRMED,
        Order.Status.PROCESSING,
        Order.Status.READY,
    }:
        raise ValidationError("This order cannot be cancelled.")

    for item in order.items.select_related("product").order_by("product_id"):
        release_reservation(
            item.product_id,
            item.quantity,
            user=user,
            reference=order.order_number,
            notes=reason or "Order cancelled",
        )

    order.status = Order.Status.CANCELLED

    if reason:
        note = f"Cancellation reason: {reason}"
        order.internal_notes = (
            f"{order.internal_notes}\n{note}".strip()
        )

    order.save(update_fields=[
        "status",
        "internal_notes",
        "updated_at",
    ])
    log_action(
        actor=user,
        action="ORDER_CANCELLED",
        entity=order,
        description="Order cancelled and stock reservations released.",
        metadata={
            "order_number": order.order_number,
            "reason": reason[:500],
        },
    )
    return order
@transaction.atomic
def transition_order(
    *,
    order_id,
    target_status,
    user=None,
    confirmed_fulfillment_at=None,
):
    """
    Enforce valid order transitions and consume reserved stock
    exactly once when an order is completed.
    """
    from django.db.models import Sum

    order = Order.objects.select_for_update().get(pk=order_id)

    transitions = {
        Order.Status.PENDING_PAYMENT: {
            Order.Status.CONFIRMED,
        },
        Order.Status.CONFIRMED: {
            Order.Status.PROCESSING,
        },
        Order.Status.PROCESSING: {
            Order.Status.READY,
        },
        Order.Status.READY: {
            Order.Status.COMPLETED,
        },
    }

    allowed = transitions.get(order.status, set())

    if target_status not in allowed:
        raise ValidationError(
            f"Cannot move an order from {order.status} "
            f"to {target_status}."
        )

    if target_status == Order.Status.COMPLETED:
        paid = (
            order.payments.filter(
                status=Payment.Status.COMPLETED,
            ).aggregate(total=Sum("amount"))["total"]
            or Decimal("0.00")
        )

        if paid < order.total_amount:
            balance = order.total_amount - paid
            raise ValidationError(
                f"Order cannot be completed. "
                f"Outstanding balance: {balance:.2f}."
            )

        items = order.items.all().order_by("product_id")

        for item in items:
            fulfill_reserved_stock(
                item.product_id,
                item.quantity,
                user=user,
                reference=order.order_number,
                notes="Stock fulfilled for completed order",
            )

    previous_status = order.status
    order.status = target_status

    log_action(
        actor=user,
        action="ORDER_STATUS_CHANGED",
        entity=order,
        description="Order status changed.",
        metadata={
            "previous_status": previous_status,
            "new_status": order.status,
        },
    )
    if confirmed_fulfillment_at is not None:
        order.confirmed_fulfillment_at = confirmed_fulfillment_at

    update_fields = ["status", "updated_at"]

    if confirmed_fulfillment_at is not None:
        update_fields.append("confirmed_fulfillment_at")

    order.save(update_fields=update_fields)
    return order


@transaction.atomic
def schedule_order_fulfillment(
    *,
    order_id,
    confirmed_fulfillment_at,
):
    """Set or update the staff-confirmed pickup/delivery time."""
    from django.utils import timezone

    order = Order.objects.select_for_update().get(pk=order_id)

    if order.status in {
        Order.Status.COMPLETED,
        Order.Status.CANCELLED,
    }:
        raise ValidationError(
            "Fulfillment cannot be rescheduled for a "
            "completed or cancelled order."
        )

    if confirmed_fulfillment_at <= timezone.now():
        raise ValidationError(
            "The confirmed fulfillment time must be in the future."
        )

    order.confirmed_fulfillment_at = confirmed_fulfillment_at
    order.save(
        update_fields=["confirmed_fulfillment_at", "updated_at"]
    )
    log_action(
        action="ORDER_FULFILLMENT_SCHEDULED",
        entity=order,
        description="Confirmed pickup or delivery time updated.",
        metadata={
            "confirmed_fulfillment_at": (
                order.confirmed_fulfillment_at.isoformat()
            ),
        },
    )
    return order