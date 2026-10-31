"use client";

import Link from "next/link";
import { useEffect, useState, type FormEvent } from "react";
import { useCart } from "@/context/CartContext";
import {
  apiRequest,
  formatKES,
  readableError,
} from "@/lib/api";

type CheckoutResponse = {
  order_number: string;
  status: string;
  fulfillment_type: string;
  requested_fulfillment_at: string | null;
  subtotal: string;
  delivery_fee: string;
  discount_amount: string;
  total_amount: string;
  tracking_token: string;
  message: string;
  items: {
    product_name: string;
    sku: string;
    quantity: number;
    unit_price: string;
    line_total: string;
  }[];
};

export default function CheckoutPage() {
  const { items, subtotal, hydrated, unavailableIds, refresh, clearCart } =
    useCart();
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [fulfillment, setFulfillment] = useState("PICKUP");
  const [address, setAddress] = useState("");
  const [requestedAt, setRequestedAt] = useState("");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<CheckoutResponse | null>(null);

  useEffect(() => {
    if (hydrated) void refresh();
  }, [hydrated, refresh]);

  async function submitCheckout(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");

    if (!items.length) {
      setError("Your bag is empty.");
      return;
    }

    if (unavailableIds.length) {
      setError("Remove the unavailable items from your bag before ordering.");
      return;
    }

    setSubmitting(true);

    try {
      const payload = {
        customer_name: name.trim(),
        customer_phone: phone.trim(),
        customer_email: email.trim(),
        fulfillment_type: fulfillment,
        delivery_address: fulfillment === "DELIVERY" ? address.trim() : "",
        requested_fulfillment_at: requestedAt
          ? new Date(requestedAt).toISOString()
          : null,
        customer_notes: notes.trim(),
        items: items.map(({ product, quantity }) => ({
          product_id: product.id,
          quantity,
        })),
      };

      const response = await apiRequest<CheckoutResponse>(
        "/sales/checkout/",
        {
          method: "POST",
          body: JSON.stringify(payload),
        },
      );

      // Keep tracking credentials for the customer. They are required for
      // tracking and for initiating an M-Pesa payment.
      localStorage.setItem(
        `furniture-order-${response.order_number}`,
        JSON.stringify({
          order_number: response.order_number,
          tracking_token: response.tracking_token,
        }),
      );

      setResult(response);
      clearCart();
    } catch (err) {
      setError(readableError(err));
    } finally {
      setSubmitting(false);
    }
  }

  if (!hydrated) {
    return <section className="container page-shell">Preparing checkout…</section>;
  }

  if (result) {
    return (
      <section className="container page-shell">
        <div className="order-confirmation">
          <p className="eyebrow">Thank you for your order</p>
          <h2>Your order has been received.</h2>
          <p>
            Order <strong>{result.order_number}</strong> has been created.
            This is an order confirmation, not confirmation of payment.
          </p>

          <div className="summary-card" style={{ marginTop: 22 }}>
            <div className="summary-line">
              <span>Items subtotal</span>
              <span>{formatKES(result.subtotal)}</span>
            </div>
            <div className="summary-line">
              <span>Delivery fee</span>
              <span>{formatKES(result.delivery_fee)}</span>
            </div>
            <div className="summary-total">
              <span>Order total</span>
              <span>{formatKES(result.total_amount)}</span>
            </div>
          </div>

          <div className="tracking-credentials">
            <strong>Save your tracking credentials</strong>
            <p className="form-hint">
              Keep this token private. You will need it to track your order
              and initiate M-Pesa payment.
            </p>
            <code>{result.tracking_token}</code>
            <button
              type="button"
              className="button button-secondary button-small"
              style={{ marginTop: 12 }}
              onClick={() => {
                void navigator.clipboard?.writeText(result.tracking_token);
              }}
            >
              Copy tracking token
            </button>
          </div>

          <Link
            href={`/track?order=${encodeURIComponent(result.order_number)}`}
            className="button"
          >
            Track your order
          </Link>
          <Link
            href="/"
            className="button button-secondary"
            style={{ marginLeft: 8 }}
          >
            Back to home
          </Link>
        </div>
      </section>
    );
  }

  return (
    <section className="container page-shell">
      <div className="breadcrumbs"><Link href="/">Home</Link> / <Link href="/cart">Bag</Link> / Checkout</div>
      <div className="page-intro">
        <p className="eyebrow">Almost yours</p>
        <h1 className="page-title">Guest checkout</h1>
        <p>No account needed. Provide your contact details so we can update you about your order.</p>
      </div>

      {!items.length ? (
        <div className="empty-state">
          Your bag is empty.
          <p><Link href="/products" className="button">Browse furniture</Link></p>
        </div>
      ) : (
        <div className="checkout-layout">
          <form className="form-stack" onSubmit={submitCheckout}>
            <h2 style={{ fontFamily: "Georgia, serif", fontWeight: 400 }}>Contact details</h2>

            <div>
              <label className="field-label" htmlFor="customer-name">Full name *</label>
              <input id="customer-name" className="field" required maxLength={200} value={name} onChange={(event) => setName(event.target.value)} />
            </div>

            <div className="form-grid">
              <div>
                <label className="field-label" htmlFor="customer-phone">Phone number *</label>
                <input id="customer-phone" className="field" type="tel" required maxLength={30} placeholder="+254 7xx xxx xxx" value={phone} onChange={(event) => setPhone(event.target.value)} />
              </div>
              <div>
                <label className="field-label" htmlFor="customer-email">Email (optional)</label>
                <input id="customer-email" className="field" type="email" value={email} onChange={(event) => setEmail(event.target.value)} />
              </div>
            </div>

            <h2 style={{ fontFamily: "Georgia, serif", fontWeight: 400, marginTop: 12 }}>Fulfillment</h2>

            <label className="radio-card">
              <input type="radio" name="fulfillment" value="PICKUP" checked={fulfillment === "PICKUP"} onChange={() => setFulfillment("PICKUP")} />
              <span><strong>Store pickup</strong><small>We will confirm when your order is ready for collection.</small></span>
            </label>

            <label className="radio-card">
              <input type="radio" name="fulfillment" value="DELIVERY" checked={fulfillment === "DELIVERY"} onChange={() => setFulfillment("DELIVERY")} />
              <span><strong>Delivery</strong><small>Delivery charges are calculated by the store.</small></span>
            </label>

            {fulfillment === "DELIVERY" && (
              <div>
                <label className="field-label" htmlFor="delivery-address">Delivery address *</label>
                <textarea id="delivery-address" className="textarea-field" required value={address} onChange={(event) => setAddress(event.target.value)} placeholder="Estate, building, area, town and any helpful directions" />
              </div>
            )}

            <div>
              <label className="field-label" htmlFor="requested-time">Preferred date and time (optional)</label>
              <input id="requested-time" className="field" type="datetime-local" value={requestedAt} onChange={(event) => setRequestedAt(event.target.value)} min={new Date(Date.now() + 60000).toISOString().slice(0, 16)} />
              <p className="form-hint">Your requested time is not confirmed until the store approves it.</p>
            </div>

            <div>
              <label className="field-label" htmlFor="customer-notes">Order notes (optional)</label>
              <textarea id="customer-notes" className="textarea-field" value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Anything we should know about this order?" />
            </div>

            {unavailableIds.length > 0 && (
              <div className="form-error">
                Some items in your bag are no longer available.{" "}
                <Link href="/cart">Review your bag</Link>
              </div>
            )}

            {error && <div className="form-error">{error}</div>}

            <button className="button" type="submit" disabled={submitting || unavailableIds.length > 0}>
              {submitting ? "Submitting order…" : "Place order"}
            </button>

            <p className="form-hint">
              Prices, availability, and the final order total are validated by
              the store server. Payment is a separate step.
            </p>
          </form>

          <aside className="summary-card">
            <h2>Your order</h2>
            {items.map(({ product, quantity }) => (
              <div className="summary-line" key={product.id}>
                <span>
                  {product.name} × {quantity}
                  {unavailableIds.includes(product.id) ? " (no longer available)" : ""}
                </span>
                <span>{formatKES(Number(product.selling_price) * quantity)}</span>
              </div>
            ))}
            <div className="summary-total">
              <span>Items subtotal</span>
              <span>{formatKES(subtotal)}</span>
            </div>
            <p className="form-hint">
              The final total, including any delivery fee, comes from Django.
            </p>
            <Link href="/cart" className="text-link">Edit bag</Link>
          </aside>
        </div>
      )}
    </section>
  );
}
