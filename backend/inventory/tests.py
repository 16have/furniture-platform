
from django.core.exceptions import ValidationError
from django.test import TestCase

from catalog.models import Category, Product
from inventory.models import StockLevel, StockMovement
from inventory.services import (
    receive_stock,
    reserve_stock,
    release_reservation,
    fulfill_reserved_stock,
    sell_available_stock,
    record_damage,
    adjust_stock,
)


class InventoryServiceTests(TestCase):
    def setUp(self):
        category = Category.objects.create(
            name="Tables",
            slug="tables",
        )
        self.product = Product.objects.create(
            category=category,
            sku="TBL-001",
            name="Test Dining Table",
            slug="test-dining-table",
            cost_price="5000.00",
            selling_price="8500.00",
            reorder_level=2,
        )

    def stock(self):
        return StockLevel.objects.get(product=self.product)

    def test_receiving_stock_creates_level_and_movement(self):
        receive_stock(self.product.pk, 10)

        stock = self.stock()
        self.assertEqual(stock.quantity_on_hand, 10)
        self.assertEqual(stock.quantity_reserved, 0)
        self.assertEqual(stock.quantity_available, 10)
        self.assertEqual(StockMovement.objects.count(), 1)

    def test_reservation_reduces_available_stock(self):
        receive_stock(self.product.pk, 10)
        reserve_stock(self.product.pk, 3)

        stock = self.stock()
        self.assertEqual(stock.quantity_on_hand, 10)
        self.assertEqual(stock.quantity_reserved, 3)
        self.assertEqual(stock.quantity_available, 7)

    def test_fulfilment_reduces_on_hand_and_reserved(self):
        receive_stock(self.product.pk, 10)
        reserve_stock(self.product.pk, 3)
        fulfill_reserved_stock(self.product.pk, 2)

        stock = self.stock()
        self.assertEqual(stock.quantity_on_hand, 8)
        self.assertEqual(stock.quantity_reserved, 1)
        self.assertEqual(stock.quantity_available, 7)

    def test_releasing_reservation_restores_available_stock(self):
        receive_stock(self.product.pk, 10)
        reserve_stock(self.product.pk, 3)
        release_reservation(self.product.pk, 3)

        stock = self.stock()
        self.assertEqual(stock.quantity_on_hand, 10)
        self.assertEqual(stock.quantity_reserved, 0)
        self.assertEqual(stock.quantity_available, 10)

    def test_pos_sale_reduces_physical_stock(self):
        receive_stock(self.product.pk, 10)
        sell_available_stock(self.product.pk, 4)

        stock = self.stock()
        self.assertEqual(stock.quantity_on_hand, 6)
        self.assertEqual(stock.quantity_available, 6)

    def test_cannot_sell_more_than_available(self):
        receive_stock(self.product.pk, 5)
        reserve_stock(self.product.pk, 4)

        with self.assertRaises(ValidationError):
            sell_available_stock(self.product.pk, 2)

        stock = self.stock()
        self.assertEqual(stock.quantity_on_hand, 5)
        self.assertEqual(stock.quantity_reserved, 4)

    def test_cannot_reserve_more_than_available(self):
        receive_stock(self.product.pk, 3)

        with self.assertRaises(ValidationError):
            reserve_stock(self.product.pk, 4)

        self.assertEqual(self.stock().quantity_reserved, 0)

    def test_damage_removes_unreserved_stock(self):
        receive_stock(self.product.pk, 10)
        reserve_stock(self.product.pk, 3)
        record_damage(self.product.pk, 2)

        stock = self.stock()
        self.assertEqual(stock.quantity_on_hand, 8)
        self.assertEqual(stock.quantity_reserved, 3)
        self.assertEqual(stock.quantity_available, 5)

    def test_adjustment_cannot_reduce_stock_below_reservations(self):
        receive_stock(self.product.pk, 10)
        reserve_stock(self.product.pk, 4)

        with self.assertRaises(ValidationError):
            adjust_stock(self.product.pk, -7)

        self.assertEqual(self.stock().quantity_on_hand, 10)

    def test_movements_preserve_stock_history(self):
        receive_stock(self.product.pk, 10)
        reserve_stock(self.product.pk, 2)
        fulfill_reserved_stock(self.product.pk, 1)

        movements = list(
            StockMovement.objects.order_by("id").values_list(
                "movement_type",
                "quantity_delta",
                "quantity_reserved_delta",
            )
        )

        self.assertEqual(
            movements,
            [
                ("RECEIPT", 10, 0),
                ("RESERVATION", 0, 2),
                ("SALE", -1, -1),
            ],
        )

    def test_quantity_must_be_positive(self):
        with self.assertRaises(ValidationError):
            receive_stock(self.product.pk, 0)

        with self.assertRaises(ValidationError):
            receive_stock(self.product.pk, -2)

        self.assertEqual(StockMovement.objects.count(), 0)