
from decimal import Decimal

from django.core.exceptions import ValidationError
from django.test import TestCase

from accounts.models import User
from catalog.models import Category, Product
from customers.models import Customer
from inventory.services import receive_stock
from payments.models import Payment
from payments.services import (
    create_mpesa_payment,
    record_cash_payment,
    complete_verified_mpesa_payment,
    payment_summary,
)
from sales.models import Order
from sales.services import create_order


class PaymentServiceTests(TestCase):
    def setUp(self):
        self.staff = User.objects.create_user(
            username="cashier",
            password="test-password-not-for-production",
            role=User.Role.CLERK,
            is_staff_member=True,
        )

        category = Category.objects.create(
            name="Chairs",
            slug="chairs",
        )
        product = Product.objects.create(
            category=category,
            sku="CHR-001",
            name="Test Chair",
            slug="test-chair",
            cost_price="1000.00",
            selling_price="2500.00",
        )
        receive_stock(product.pk, 10)

        self.order = create_order(
            source=Order.Source.POS,
            customer_name="Test Customer",
            customer_phone="0712345678",
            items=[{"product_id": product.pk, "quantity": 2}],
            created_by=self.staff,
        )

    def test_cash_payment_updates_balance(self):
        record_cash_payment(
            order_id=self.order.pk,
            amount="1000.00",
            recorded_by=self.staff,
        )

        summary = payment_summary(self.order)
        self.assertEqual(summary["paid"], Decimal("1000.00"))
        self.assertEqual(summary["balance_due"], Decimal("4000.00"))

    def test_pending_mpesa_reserves_collectable_balance(self):
        create_mpesa_payment(
            order_id=self.order.pk,
            amount="3000.00",
        )

        summary = payment_summary(self.order)
        self.assertEqual(summary["pending"], Decimal("3000.00"))
        self.assertEqual(
            summary["available_to_collect"],
            Decimal("2000.00"),
        )

    def test_cannot_overallocate_pending_payments(self):
        create_mpesa_payment(
            order_id=self.order.pk,
            amount="4000.00",
        )

        with self.assertRaises(ValidationError):
            create_mpesa_payment(
                order_id=self.order.pk,
                amount="2000.00",
            )

    def test_verified_mpesa_payment_completes(self):
        payment = create_mpesa_payment(
            order_id=self.order.pk,
            amount="2500.00",
        )

        complete_verified_mpesa_payment(
            payment_id=payment.pk,
            verified_reference="QAB1234567",
            verified_amount="2500.00",
        )

        payment.refresh_from_db()
        self.assertEqual(payment.status, Payment.Status.COMPLETED)
        self.assertEqual(payment.reference, "QAB1234567")

    def test_same_verified_callback_is_idempotent(self):
        payment = create_mpesa_payment(
            order_id=self.order.pk,
            amount="2500.00",
        )

        first = complete_verified_mpesa_payment(
            payment_id=payment.pk,
            verified_reference="QAB7654321",
            verified_amount="2500.00",
        )
        second = complete_verified_mpesa_payment(
            payment_id=payment.pk,
            verified_reference="QAB7654321",
            verified_amount="2500.00",
        )

        self.assertEqual(first.pk, second.pk)
        self.assertEqual(
            payment_summary(self.order)["paid"],
            Decimal("2500.00"),
        )

    def test_wrong_verified_amount_is_rejected(self):
        payment = create_mpesa_payment(
            order_id=self.order.pk,
            amount="2500.00",
        )

        with self.assertRaises(ValidationError):
            complete_verified_mpesa_payment(
                payment_id=payment.pk,
                verified_reference="QAB1111111",
                verified_amount="2000.00",
            )

        payment.refresh_from_db()
        self.assertEqual(payment.status, Payment.Status.PENDING)

    def test_cash_cannot_exceed_available_balance(self):
        with self.assertRaises(ValidationError):
            record_cash_payment(
                order_id=self.order.pk,
                amount="6000.00",
                recorded_by=self.staff,
            )

        self.assertEqual(self.order.payments.count(), 0)

    def test_duplicate_mpesa_receipt_is_rejected(self):
        first = create_mpesa_payment(
            order_id=self.order.pk,
            amount="1000.00",
        )
        second = create_mpesa_payment(
            order_id=self.order.pk,
            amount="1000.00",
        )

        complete_verified_mpesa_payment(
            payment_id=first.pk,
            verified_reference="QAB9999999",
            verified_amount="1000.00",
        )

        with self.assertRaises(ValidationError):
            complete_verified_mpesa_payment(
                payment_id=second.pk,
                verified_reference="QAB9999999",
                verified_amount="1000.00",
            )