"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import {
  apiRequest,
  formatKES,
  readableError,
} from "@/lib/api";

type TrackedOrder = {
  order_number: string;
  status: string;
  fulfillment_type: string;
  delivery_address: string;
  requested_fulfillment_at: string | null;
  confirmed_fulfillment_at: string | null;
  subtotal: string;
  delivery_fee: string;
  discount_amount: string;
  total_amount: string;
  payment_summary: Record<string, unknown>;
  items: {
    product_name: string;
    sku: string;
    quantity: number;
    unit_price: string;
    line_total: string;
  }[];
};

function TrackingForm() {
  const searchParams = useSearchParams();
  const [orderNumber, setOrderNumber] = useState(searchParams.get("order") || "");
  const [token, setToken] = useState("");
  const [order, setOrder] = useState<TrackedOrder | null>(null);
  const [amount, setAmount] = useState("");
  const [loading, setLoading] = useState(false);
  const [paying, setPaying] = useState(false);
  const [error, setError] = useState("");
  const [paymentMessage, setPaymentMessage] = useState("");

  useEffect(() => {
    const order = searchParams.get("order");
    if (!order) return;

    try {
      const stored = localStorage.getItem(`furniture-order-${order}`);
      if (stored) {
        const credentials = JSON.parse(stored);
        setOrderNumber(credentials.order_number || order);
        setToken(credentials.tracking_token || "");
      }
    } catch {
      // The customer can enter their tracking token manually.
    }
  }, [searchParams]);

  async function track(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError("");
    setPaymentMessage("");
    setOrder(null);

    try {
      const data = await apiRequest<TrackedOrder>("/sales/track/", {
        method: "POST",
        body: JSON.stringify({
          order_number: orderNumber.trim(),
          tracking_token: token,
        }),
      });
      setOrder(data);
      const summary = data.payment_summary;
      const outstanding = Number(
        summary?.outstanding_amount ?? data.total_amount,
      );
      setAmount(String(Math.max(0, Math.ceil(outstanding))));
    } catch (err) {
      setError(readableError(err));
    } finally {
      setLoading(false);
    }
  }

  async function initiateMpesa(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPaying(true);
    setError("");
    setPaymentMessage("");

    try {
      const response = await apiRequest<{
        message: string;
        payment_status: string;
      }>("/payments/mpesa/initiate/", {
        method: "POST",
        body: JSON.stringify({
          order_number: orderNumber.trim(),
          tracking_token: token,
          amount,
        }),
      });

      setPaymentMessage(
        `${response.message} Current payment status: ${response.payment_status}. Track again to refresh the order.`,
      );
    } catch (err) {
      setError(readableError(err));
    } finally {
      setPaying(false);
    }
  }

  return (
    <section className="container page-shell">
      <div className="breadcrumbs">Home / Track order</div>
      <div className="page-intro">
        <p className="eyebrow">Order updates</p>
        <h1 className="page-title">Track your order.</h1>
        <p>Enter the order number and the private tracking token you received at checkout.</p>
      </div>

      <div className="checkout-layout">
        <form className="form-stack" onSubmit={track}>
          <div>
            <label className="field-label" htmlFor="tracking-order">Order number *</label>
            <input id="tracking-order" className="field" required value={orderNumber} onChange={(event) => setOrderNumber(event.target.value)} />
          </div>
          <div>
            <label className="field-label" htmlFor="tracking-token">Tracking token *</label>
            <input id="tracking-token" className="field" required value={token} onChange={(event) => setToken(event.target.value)} />
          </div>

          {error && <div className="form-error">{error}</div>}
          {paymentMessage && <div className="form-success">{paymentMessage}</div>}

          <button className="button" disabled={loading} type="submit">
            {loading ? "Looking up order…" : "Track order"}
          </button>
        </form>

        {order && (
          <div className="summary-card">
            <p className="eyebrow">Order {order.order_number}</p>
            <h2>{order.status.replaceAll("_", " ")}</h2>
            <div className="summary-line">
              <span>Fulfillment</span>
              <span>{order.fulfillment_type}</span>
            </div>
            <div className="summary-line">
              <span>Items subtotal</span>
              <span>{formatKES(order.subtotal)}</span>
            </div>
            <div className="summary-line">
              <span>Delivery</span>
              <span>{formatKES(order.delivery_fee)}</span>
            </div>
            <div className="summary-total">
              <span>Order total</span>
              <span>{formatKES(order.total_amount)}</span>
            </div>

            {order.confirmed_fulfillment_at && (
              <p className="form-hint">
                Confirmed fulfillment: {new Date(order.confirmed_fulfillment_at).toLocaleString()}
              </p>
            )}

            <h3 style={{ fontFamily: "Georgia, serif", fontWeight: 400 }}>Items</h3>
            {order.items.map((item, index) => (
              <div className="summary-line" key={`${item.sku}-${index}`}>
                <span>{item.product_name} × {item.quantity}</span>
                <span>{formatKES(item.line_total)}</span>
              </div>
            ))}

            <form className="form-stack" onSubmit={initiateMpesa} style={{ marginTop: 25 }}>
              <h3 style={{ fontFamily: "Georgia, serif", fontWeight: 400 }}>
                Pay with M-Pesa
              </h3>
              <div>
                <label className="field-label" htmlFor="mpesa-amount">Amount in KES</label>
                <input
                  id="mpesa-amount"
                  className="field"
                  type="number"
                  min="1"
                  step="1"
                  required
                  value={amount}
                  onChange={(event) => setAmount(event.target.value)}
                />
                <p className="form-hint">
                  Enter a whole number of Kenyan shillings. The backend checks
                  the outstanding balance and payment status.
                </p>
              </div>
              <button className="button" type="submit" disabled={paying}>
                {paying ? "Contacting M-Pesa…" : "Request M-Pesa prompt"}
              </button>
              <p className="form-hint">
                A prompt is not proof of payment. Refresh tracking after you
                complete the prompt to check the recorded status.
              </p>
            </form>
          </div>
        )}
      </div>
    </section>
  );
}

export default function TrackPage() {
  return (
    <Suspense fallback={<section className="container page-shell">Loading tracking…</section>}>
      <TrackingForm />
    </Suspense>
  );
}
