"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  errorMessage,
  listFrom,
  money,
  staffRequest,
} from "@/lib/staff-api";

type OrderItem = {
  id: number;
  product_name: string;
  sku: string;
  quantity: number;
  unit_price: string | number;
  line_total: string | number;
};

type Payment = {
  id: number;
  method: string;
  status: string;
  amount: string | number;
  reference?: string;
  created_at?: string;
};

type PaymentSummary = {
  total?: string | number;
  paid?: string | number;
  pending?: string | number;
  balance_due?: string | number;
  available_to_collect?: string | number;
};

type Order = {
  id: number;
  order_number: string;
  source: string;
  status: string;
  customer_name: string;
  customer_phone: string;
  customer_email?: string;
  fulfillment_type: string;
  delivery_address?: string;
  requested_fulfillment_at?: string | null;
  confirmed_fulfillment_at?: string | null;
  subtotal: string | number;
  discount_amount: string | number;
  delivery_fee: string | number;
  total_amount: string | number;
  customer_notes?: string;
  internal_notes?: string;
  items: OrderItem[];
  payments: Payment[];
  payment_summary: PaymentSummary;
  created_at: string;
};

const statuses = [
  "DRAFT",
  "PENDING_PAYMENT",
  "CONFIRMED",
  "PROCESSING",
  "READY",
  "COMPLETED",
  "CANCELLED",
];

function displayDate(value?: string | null) {
  if (!value) return "Not scheduled";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

function statusLabel(value: string) {
  return value.replaceAll("_", " ");
}

export default function StaffOrdersPage() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("ALL");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [cashAmount, setCashAmount] = useState("");
  const [cashNotes, setCashNotes] = useState("");
  const [cancelReason, setCancelReason] = useState("");
  const [confirmedAt, setConfirmedAt] = useState("");

  const loadOrders = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const data = await staffRequest<unknown>(
        "/sales/orders/?page_size=100",
      );
      const results = listFrom(data as never) as Order[];
      setOrders(results);

      setSelectedId((current) => {
        if (current && results.some((order) => order.id === current)) {
          return current;
        }
        return results[0]?.id ?? null;
      });
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadOrders();
  }, [loadOrders]);

  const selected = orders.find((order) => order.id === selectedId) ?? null;

  const visibleOrders = useMemo(() => {
    const query = search.trim().toLowerCase();

    return orders.filter((order) => {
      const matchesStatus = status === "ALL" || order.status === status;
      const matchesSearch =
        !query ||
        [
          order.order_number,
          order.customer_name,
          order.customer_phone,
          order.customer_email,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase()
          .includes(query);

      return matchesStatus && matchesSearch;
    });
  }, [orders, search, status]);

  const runOrderAction = async (
    action: string,
    body: Record<string, unknown> = {},
    successMessage: string,
  ) => {
    if (!selected) return;

    setBusy(true);
    setError("");
    setNotice("");

    try {
      await staffRequest(
        `/sales/orders/${selected.id}/${action}/`,
        {
          method: "POST",
          body: JSON.stringify(body),
        },
      );
      setNotice(successMessage);
      await loadOrders();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const recordCashPayment = async () => {
    if (!selected) return;

    const amount = Number(cashAmount);
    const available = Number(
      selected.payment_summary?.available_to_collect ?? 0,
    );

    if (!Number.isFinite(amount) || amount <= 0) {
      setError("Enter a valid cash payment amount greater than zero.");
      return;
    }

    if (amount > available) {
      setError(
        `Payment exceeds the collectible balance of ${money(available)}.`,
      );
      return;
    }

    setBusy(true);
    setError("");
    setNotice("");

    try {
      await staffRequest(
        `/sales/orders/${selected.id}/cash-payment/`,
        {
          method: "POST",
          body: JSON.stringify({
            amount: amount.toFixed(2),
            notes: cashNotes,
          }),
        },
      );

      setCashAmount("");
      setCashNotes("");
      setNotice("Cash payment recorded successfully.");
      await loadOrders();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const scheduleFulfillment = async () => {
    if (!selected || !confirmedAt) {
      setError("Choose a pickup or delivery date and time.");
      return;
    }

    const date = new Date(confirmedAt);
    if (Number.isNaN(date.getTime()) || date.getTime() <= Date.now()) {
      setError("The scheduled fulfillment time must be in the future.");
      return;
    }

    await runOrderAction(
      "schedule-fulfillment",
      { confirmed_fulfillment_at: date.toISOString() },
      "Fulfillment schedule saved.",
    );
  };

  const confirmOrder = async () => {
    const body: Record<string, unknown> = {};

    if (confirmedAt) {
      const date = new Date(confirmedAt);

      if (Number.isNaN(date.getTime()) || date.getTime() <= Date.now()) {
        setError("Choose a valid future fulfillment time.");
        return;
      }

      body.confirmed_fulfillment_at = date.toISOString();
    }

    await runOrderAction(
      "confirm",
      body,
      "Order confirmed.",
    );
  };

  return (
    <main className="min-h-screen bg-stone-100 px-4 py-8 text-stone-900 sm:px-8">
      <div className="mx-auto max-w-7xl">
        <Link
          href="/staff"
          className="text-sm text-stone-500 hover:text-stone-900"
        >
          ← Dashboard
        </Link>

        <header className="mt-3 flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-amber-800">
              Store operations
            </p>
            <h1 className="mt-2 text-3xl font-semibold">Order management</h1>
            <p className="mt-1 text-sm text-stone-600">
              Manage fulfillment, collection and payments using the store's
              enforced order workflow.
            </p>
          </div>

          <button
            onClick={() => void loadOrders()}
            disabled={loading || busy}
            className="rounded-lg border border-stone-300 bg-white px-4 py-3 text-sm disabled:opacity-50"
          >
            Refresh orders
          </button>
        </header>

        {error && (
          <p role="alert" className="mt-5 rounded-lg bg-red-50 p-3 text-sm text-red-700">
            {error}
          </p>
        )}

        {notice && (
          <p role="status" className="mt-5 rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800">
            {notice}
          </p>
        )}

        <section className="mt-6 grid gap-4 sm:grid-cols-3">
          <Metric label="Orders loaded" value={String(orders.length)} />
          <Metric
            label="Awaiting payment"
            value={String(
              orders.filter((order) => order.status === "PENDING_PAYMENT").length,
            )}
          />
          <Metric
            label="Ready for collection/delivery"
            value={String(
              orders.filter((order) => order.status === "READY").length,
            )}
          />
        </section>

        <section className="mt-6 grid items-start gap-6 xl:grid-cols-[1fr_0.9fr]">
          <div className="rounded-xl border border-stone-200 bg-white p-5">
            <div className="grid gap-3 sm:grid-cols-2">
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Order number, customer or phone"
                className="w-full rounded-lg border border-stone-300 px-3 py-2"
              />

              <select
                value={status}
                onChange={(event) => setStatus(event.target.value)}
                className="w-full rounded-lg border border-stone-300 bg-white px-3 py-2"
              >
                <option value="ALL">All statuses</option>
                {statuses.map((option) => (
                  <option key={option} value={option}>
                    {statusLabel(option)}
                  </option>
                ))}
              </select>
            </div>

            <p className="mt-4 text-sm text-stone-500">
              {visibleOrders.length} matching order(s)
            </p>

            {loading ? (
              <p className="mt-5 text-sm text-stone-500">Loading orders…</p>
            ) : (
              <div className="mt-3 divide-y divide-stone-100">
                {visibleOrders.map((order) => (
                  <button
                    key={order.id}
                    onClick={() => {
                      setSelectedId(order.id);
                      setError("");
                      setNotice("");
                      setCashAmount("");
                      setConfirmedAt("");
                    }}
                    className={`w-full rounded-lg px-3 py-4 text-left transition hover:bg-stone-50 ${
                      selectedId === order.id ? "bg-stone-100" : ""
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-semibold">{order.order_number}</p>
                        <p className="mt-1 truncate text-sm text-stone-600">
                          {order.customer_name} · {order.customer_phone}
                        </p>
                        <p className="mt-1 text-xs text-stone-500">
                          {order.source} · {order.fulfillment_type} ·{" "}
                          {displayDate(order.created_at)}
                        </p>
                      </div>

                      <div className="shrink-0 text-right">
                        <p className="font-semibold">{money(order.total_amount)}</p>
                        <p className="mt-1 text-xs text-stone-500">
                          {statusLabel(order.status)}
                        </p>
                      </div>
                    </div>
                  </button>
                ))}

                {visibleOrders.length === 0 && (
                  <p className="py-8 text-sm text-stone-500">
                    No matching orders.
                  </p>
                )}
              </div>
            )}
          </div>

          <aside className="rounded-xl border border-stone-200 bg-white p-5">
            {!selected ? (
              <>
                <h2 className="text-lg font-semibold">Order details</h2>
                <p className="mt-2 text-sm text-stone-500">
                  Select an order to review its details and available actions.
                </p>
              </>
            ) : (
              <>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h2 className="text-xl font-semibold">
                      {selected.order_number}
                    </h2>
                    <p className="mt-1 text-sm text-stone-500">
                      {statusLabel(selected.status)} · {selected.source}
                    </p>
                  </div>
                  <span className="rounded-full bg-stone-100 px-3 py-1 text-xs">
                    {selected.fulfillment_type}
                  </span>
                </div>

                <div className="mt-5 space-y-4 text-sm">
                  <div>
                    <h3 className="font-semibold">Customer</h3>
                    <p className="mt-1">{selected.customer_name}</p>
                    <p>{selected.customer_phone}</p>
                    {selected.customer_email && <p>{selected.customer_email}</p>}
                  </div>

                  <div>
                    <h3 className="font-semibold">Fulfillment</h3>
                    {selected.delivery_address && <p>{selected.delivery_address}</p>}
                    <p className="mt-1">
                      Requested: {displayDate(selected.requested_fulfillment_at)}
                    </p>
                    <p>
                      Confirmed: {displayDate(selected.confirmed_fulfillment_at)}
                    </p>
                  </div>

                  {selected.customer_notes && (
                    <div>
                      <h3 className="font-semibold">Customer notes</h3>
                      <p>{selected.customer_notes}</p>
                    </div>
                  )}
                </div>

                <div className="mt-5 border-t border-stone-200 pt-4">
                  <h3 className="font-semibold">Items</h3>
                  <div className="mt-2 divide-y divide-stone-100">
                    {(selected.items || []).map((item) => (
                      <div
                        key={item.id}
                        className="flex justify-between gap-3 py-3 text-sm"
                      >
                        <div>
                          <p className="font-medium">{item.product_name}</p>
                          <p className="text-stone-500">
                            {item.sku} · Qty {item.quantity} ·{" "}
                            {money(item.unit_price)} each
                          </p>
                        </div>
                        <p className="shrink-0">{money(item.line_total)}</p>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="mt-4 space-y-2 border-t border-stone-200 pt-4 text-sm">
                  <MoneyRow label="Subtotal" value={selected.subtotal} />
                  <MoneyRow label="Discount" value={selected.discount_amount} />
                  <MoneyRow label="Delivery fee" value={selected.delivery_fee} />
                  <MoneyRow label="Order total" value={selected.total_amount} strong />
                  <MoneyRow
                    label="Paid"
                    value={selected.payment_summary?.paid}
                  />
                  <MoneyRow
                    label="Pending payments"
                    value={selected.payment_summary?.pending}
                  />
                  <MoneyRow
                    label="Balance due"
                    value={selected.payment_summary?.balance_due}
                    strong
                  />
                </div>

                {(selected.payments || []).length > 0 && (
                  <div className="mt-5 border-t border-stone-200 pt-4">
                    <h3 className="font-semibold">Payment history</h3>
                    <div className="mt-2 space-y-3">
                      {selected.payments.map((payment) => (
                        <div key={payment.id} className="text-sm">
                          <div className="flex justify-between gap-3">
                            <span>{payment.method} · {payment.status}</span>
                            <span>{money(payment.amount)}</span>
                          </div>
                          {payment.reference && (
                            <p className="text-xs text-stone-500">
                              Ref: {payment.reference}
                            </p>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div className="mt-6 border-t border-stone-200 pt-5">
                  <h3 className="font-semibold">Order actions</h3>
                  <p className="mt-1 text-xs text-stone-500">
                    The backend validates every transition and payment.
                  </p>

                  <div className="mt-4 space-y-3">
                    {["PENDING_PAYMENT", "CONFIRMED", "PROCESSING", "READY"].includes(
                      selected.status,
                    ) && (
                      <div>
                        <label className="mb-1 block text-xs text-stone-600">
                          Confirmed pickup/delivery time (optional when confirming)
                        </label>
                        <input
                          type="datetime-local"
                          value={confirmedAt}
                          onChange={(event) => setConfirmedAt(event.target.value)}
                          className="w-full rounded-lg border border-stone-300 px-3 py-2 text-sm"
                        />
                      </div>
                    )}

                    {selected.status === "PENDING_PAYMENT" && (
                      <ActionButton
                        disabled={busy}
                        onClick={() => void confirmOrder()}
                      >
                        Confirm order
                      </ActionButton>
                    )}

                    {selected.status === "CONFIRMED" && (
                      <ActionButton
                        disabled={busy}
                        onClick={() =>
                          void runOrderAction(
                            "start-processing",
                            {},
                            "Order moved to processing.",
                          )
                        }
                      >
                        Start processing
                      </ActionButton>
                    )}

                    {selected.status === "PROCESSING" && (
                      <ActionButton
                        disabled={busy}
                        onClick={() =>
                          void runOrderAction(
                            "mark-ready",
                            {},
                            "Order marked ready.",
                          )
                        }
                      >
                        Mark ready
                      </ActionButton>
                    )}

                    {selected.status === "READY" && (
                      <ActionButton
                        disabled={busy}
                        onClick={() =>
                          void runOrderAction(
                            "complete",
                            {},
                            "Order completed.",
                          )
                        }
                      >
                        Complete order
                      </ActionButton>
                    )}

                    {["PENDING_PAYMENT", "CONFIRMED", "PROCESSING", "READY"].includes(
                      selected.status,
                    ) && (
                      <button
                        disabled={busy}
                        onClick={() => void scheduleFulfillment()}
                        className="w-full rounded-lg border border-stone-300 px-4 py-3 text-sm disabled:opacity-50"
                      >
                        Save fulfillment schedule
                      </button>
                    )}

                    {!["CANCELLED", "COMPLETED"].includes(selected.status) &&
                      Number(selected.payment_summary?.available_to_collect ?? 0) > 0 && (
                        <div className="rounded-lg border border-stone-200 p-4">
                          <h4 className="font-medium">Record cash payment</h4>
                          <p className="mt-1 text-xs text-stone-500">
                            Collectible balance:{" "}
                            {money(selected.payment_summary?.available_to_collect)}
                          </p>

                          <label className="mt-3 block text-xs text-stone-600">
                            Amount (KES)
                          </label>
                          <input
                            type="number"
                            min="0.01"
                            step="0.01"
                            max={Number(selected.payment_summary?.available_to_collect ?? 0)}
                            value={cashAmount}
                            onChange={(event) => setCashAmount(event.target.value)}
                            placeholder="e.g. 1500"
                            className="mt-1 w-full rounded-lg border border-stone-300 px-3 py-2 text-sm"
                          />

                          <label className="mt-3 block text-xs text-stone-600">
                            Notes (optional)
                          </label>
                          <input
                            value={cashNotes}
                            onChange={(event) => setCashNotes(event.target.value)}
                            placeholder="Payment notes"
                            className="mt-1 w-full rounded-lg border border-stone-300 px-3 py-2 text-sm"
                          />

                          <button
                            disabled={busy}
                            onClick={() => void recordCashPayment()}
                            className="mt-3 w-full rounded-lg bg-stone-900 px-4 py-3 text-sm text-white disabled:opacity-50"
                          >
                            Record cash received
                          </button>
                        </div>
                      )}

                    {!["CANCELLED", "COMPLETED"].includes(selected.status) && (
                      <div className="rounded-lg border border-red-200 p-4">
                        <h4 className="font-medium text-red-800">Cancel order</h4>
                        <p className="mt-1 text-xs text-stone-500">
                          Paid orders cannot be cancelled until a refund is handled.
                        </p>
                        <input
                          value={cancelReason}
                          onChange={(event) => setCancelReason(event.target.value)}
                          placeholder="Reason for cancellation"
                          className="mt-3 w-full rounded-lg border border-stone-300 px-3 py-2 text-sm"
                        />
                        <button
                          disabled={busy}
                          onClick={() => {
                            if (!window.confirm(
                              `Cancel ${selected.order_number}? The backend will reject cancellation if a completed payment exists.`,
                            )) return;

                            void runOrderAction(
                              "cancel",
                              { reason: cancelReason },
                              "Order cancellation processed.",
                            );
                          }}
                          className="mt-3 w-full rounded-lg border border-red-300 px-4 py-3 text-sm text-red-700 disabled:opacity-50"
                        >
                          Cancel order
                        </button>
                      </div>
                    )}

                    {busy && (
                      <p className="text-sm text-stone-500">Saving changes…</p>
                    )}
                  </div>
                </div>
              </>
            )}
          </aside>
        </section>
      </div>
    </main>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-stone-200 bg-white p-5">
      <p className="text-sm text-stone-500">{label}</p>
      <p className="mt-2 text-2xl font-semibold">{value}</p>
    </div>
  );
}

function MoneyRow({
  label,
  value,
  strong = false,
}: {
  label: string;
  value?: string | number;
  strong?: boolean;
}) {
  return (
    <div className={`flex justify-between gap-3 ${strong ? "font-semibold" : ""}`}>
      <span>{label}</span>
      <span>{money(value)}</span>
    </div>
  );
}

function ActionButton({
  children,
  disabled,
  onClick,
}: {
  children: React.ReactNode;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button
      disabled={disabled}
      onClick={onClick}
      className="w-full rounded-lg bg-stone-900 px-4 py-3 text-sm text-white disabled:opacity-50"
    >
      {children}
    </button>
  );
}
