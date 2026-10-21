
from django.core.exceptions import ValidationError
from django.db import transaction

from catalog.models import Product
from .models import StockLevel, StockMovement, Supplier
from audit.services import log_action

def _positive_quantity(quantity):
    if isinstance(quantity, bool) or not isinstance(quantity, int) or quantity <= 0:
        raise ValidationError("Quantity must be a positive whole number.")


def _locked_stock(product_id):
    # Validate the product before creating its stock record.
    product = Product.objects.get(pk=product_id)

    stock, _ = StockLevel.objects.get_or_create(product=product)

    # Serialize concurrent changes to this product's stock.
    return StockLevel.objects.select_for_update().get(pk=stock.pk)


def _record_movement(
    stock,
    movement_type,
    quantity_delta,
    quantity_reserved_delta=0,
    user=None,
    supplier=None,
    reference="",
    notes="",
):
    movement = StockMovement.objects.create(
        product=stock.product,
        movement_type=movement_type,
        quantity_delta=quantity_delta,
        quantity_reserved_delta=quantity_reserved_delta,
        created_by=user,
        supplier=supplier,
        reference=reference,
        notes=notes,
    )

    action_by_type = {
        StockMovement.MovementType.RECEIPT: "STOCK_RECEIVED",
        StockMovement.MovementType.RESERVATION: "STOCK_RESERVED",
        StockMovement.MovementType.RELEASE: "STOCK_RESERVATION_RELEASED",
        StockMovement.MovementType.SALE: "STOCK_SOLD",
        StockMovement.MovementType.DAMAGE: "STOCK_DAMAGED",
        StockMovement.MovementType.ADJUSTMENT: "STOCK_ADJUSTED",
        StockMovement.MovementType.RETURN: "STOCK_RETURNED",
    }

    log_action(
        actor=user,
        action=action_by_type.get(
            movement_type,
            "STOCK_MOVEMENT_RECORDED",
        ),
        entity=movement,
        description="Inventory movement recorded.",
        metadata={
            "product_id": stock.product_id,
            "quantity_delta": quantity_delta,
            "quantity_reserved_delta": quantity_reserved_delta,
            "reference": reference,
        },
    )

    return movement

@transaction.atomic
def receive_stock(
    product_id,
    quantity,
    user=None,
    supplier_id=None,
    reference="",
    notes="",
):
    """Receive purchased or replenished inventory."""
    _positive_quantity(quantity)
    stock = _locked_stock(product_id)

    supplier = None
    if supplier_id is not None:
        supplier = Supplier.objects.get(pk=supplier_id)

    stock.quantity_on_hand += quantity
    stock.save(update_fields=["quantity_on_hand", "updated_at"])

    _record_movement(
        stock,
        StockMovement.MovementType.RECEIPT,
        quantity,
        user=user,
        supplier=supplier,
        reference=reference,
        notes=notes,
    )
    return stock


@transaction.atomic
def reserve_stock(product_id, quantity, user=None, reference="", notes=""):
    """Reserve available stock for an order."""
    _positive_quantity(quantity)
    stock = _locked_stock(product_id)

    if stock.quantity_available < quantity:
        raise ValidationError("Insufficient available stock.")

    stock.quantity_reserved += quantity
    stock.save(update_fields=["quantity_reserved", "updated_at"])

    _record_movement(
        stock,
        StockMovement.MovementType.RESERVATION,
        0,
        quantity_reserved_delta=quantity,
        user=user,
        reference=reference,
        notes=notes,
    )
    return stock


@transaction.atomic
def release_reservation(
    product_id, quantity, user=None, reference="", notes=""
):
    """Release a cancelled or expired order's reservation."""
    _positive_quantity(quantity)
    stock = _locked_stock(product_id)

    if stock.quantity_reserved < quantity:
        raise ValidationError("Cannot release more stock than is reserved.")

    stock.quantity_reserved -= quantity
    stock.save(update_fields=["quantity_reserved", "updated_at"])

    _record_movement(
        stock,
        StockMovement.MovementType.RELEASE,
        0,
        quantity_reserved_delta=-quantity,
        user=user,
        reference=reference,
        notes=notes,
    )
    return stock


@transaction.atomic
def fulfill_reserved_stock(
    product_id, quantity, user=None, reference="", notes=""
):
    """Complete a sale using stock already reserved for its order."""
    _positive_quantity(quantity)
    stock = _locked_stock(product_id)

    if stock.quantity_reserved < quantity:
        raise ValidationError("Insufficient reserved stock.")

    stock.quantity_on_hand -= quantity
    stock.quantity_reserved -= quantity
    stock.save(
        update_fields=[
            "quantity_on_hand",
            "quantity_reserved",
            "updated_at",
        ]
    )

    _record_movement(
        stock,
        StockMovement.MovementType.SALE,
        -quantity,
        quantity_reserved_delta=-quantity,
        user=user,
        reference=reference,
        notes=notes,
    )
    return stock


@transaction.atomic
def sell_available_stock(
    product_id, quantity, user=None, reference="", notes=""
):
    """Complete a POS sale that has not reserved stock beforehand."""
    _positive_quantity(quantity)
    stock = _locked_stock(product_id)

    if stock.quantity_available < quantity:
        raise ValidationError("Insufficient available stock.")

    stock.quantity_on_hand -= quantity
    stock.save(update_fields=["quantity_on_hand", "updated_at"])

    _record_movement(
        stock,
        StockMovement.MovementType.SALE,
        -quantity,
        user=user,
        reference=reference,
        notes=notes,
    )
    return stock


@transaction.atomic
def record_damage(
    product_id, quantity, user=None, reference="", notes=""
):
    """Remove damaged units that are not reserved for orders."""
    _positive_quantity(quantity)
    stock = _locked_stock(product_id)

    if stock.quantity_available < quantity:
        raise ValidationError(
            "Insufficient unreserved stock to remove damaged units."
        )

    stock.quantity_on_hand -= quantity
    stock.save(update_fields=["quantity_on_hand", "updated_at"])

    _record_movement(
        stock,
        StockMovement.MovementType.DAMAGE,
        -quantity,
        user=user,
        reference=reference,
        notes=notes,
    )
    return stock


@transaction.atomic
def adjust_stock(
    product_id, quantity_delta, user=None, reference="", notes=""
):
    """Apply a signed, documented stock-count correction."""
    if (
        isinstance(quantity_delta, bool)
        or not isinstance(quantity_delta, int)
        or quantity_delta == 0
    ):
        raise ValidationError("Adjustment must be a non-zero whole number.")

    stock = _locked_stock(product_id)
    new_quantity = stock.quantity_on_hand + quantity_delta

    if new_quantity < stock.quantity_reserved:
        raise ValidationError(
            "Adjustment cannot reduce physical stock below reserved stock."
        )

    if new_quantity < 0:
        raise ValidationError("Stock cannot become negative.")

    stock.quantity_on_hand = new_quantity
    stock.save(update_fields=["quantity_on_hand", "updated_at"])

    _record_movement(
        stock,
        StockMovement.MovementType.ADJUSTMENT,
        quantity_delta,
        user=user,
        reference=reference,
        notes=notes,
    )
    return stock