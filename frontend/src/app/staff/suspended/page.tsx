"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import {
  errorMessage,
  listFrom,
  staffRequest,
} from "@/lib/staff-api";

type CartItem = {
  product_id: number;
  quantity: number;
};

type SuspendedCart = {
  id: number;
  customer_name: string;
  customer_phone: string;
  customer_email?: string;
  fulfillment_type: "PICKUP" | "DELIVERY" | string;
  delivery_address?: string;
  requested_fulfillment_at?: string | null;
  delivery_fee?: string | number;
  discount_amount?: string | number;
  customer_notes?: string;
  internal_notes?: string;
  items: CartItem[];
  created_at: string;
  updated_at: string;
};

type ResumeResult = {
  message: string;
  order_id: number;
  order_number: string;
};

export default function SuspendedSalesPage() {
  const [carts, setCarts] = useState<SuspendedCart[]>([]);
  const [loading, setLoading] = useState(true);
  const [resumingId, setResumingId] = useState<number | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [createdOrder, setCreatedOrder] = useState<ResumeResult | null>(null);
  const [search, setSearch] = useState("");

  const loadCarts = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const response = await staffRequest<unknown>(
        "/sales/suspended-carts/?page_size=100",
      );
      setCarts(listFrom(response as never) as SuspendedCart[]);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadCarts();
  }, [loadCarts]);

  const query = search.trim().toLowerCase();
  const filteredCarts = carts.filter((cart) =>
    `${cart.customer_name} ${cart.customer_phone} ${cart.customer_email ?? ""} ${cart.id}`
      .toLowerCase()
      .includes(query),
  );

  async function resumeCart(cart: SuspendedCart) {
    const confirmed = window.confirm(
      `Resume cart #${cart.id} for ${cart.customer_name}?\n\nThis creates a POS order and removes the suspended cart.`,
    );

    if (!confirmed) return;

    setError("");
    setMessage("");
    setCreatedOrder(null);
    setResumingId(cart.id);

    try {
      const result = await staffRequest<ResumeResult>(
        `/sales/suspended-carts/${cart.id}/resume/`,
        { method: "POST" },
      );

      setCreatedOrder(result);
      setMessage(result.message || "Cart resumed successfully.");
      await loadCarts();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setResumingId(null);
    }
  }

  async function deleteCart(cart: SuspendedCart) {
    const confirmed = window.confirm(
      `Permanently delete suspended cart #${cart.id} for ${cart.customer_name}? This cannot be undone.`,
    );

    if (!confirmed) return;

    setError("");
    setMessage("");
    setDeletingId(cart.id);

    try {
      await staffRequest(`/sales/suspended-carts/${cart.id}/`, {
        method: "DELETE",
      });
      setMessage(`Suspended cart #${cart.id} deleted.`);
      await loadCarts();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <main className="min-h-screen bg-stone-100 px-4 py-7 text-stone-900 sm:px-8">
      <div className="mx-auto max-w-6xl">
        <Link
          href="/staff"
          className="text-sm text-stone-500 hover:text-stone-900"
        >
          ← Staff dashboard
        </Link>

        <header className="mt-3 flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-amber-800">
              Point of sale
            </p>
            <h1 className="mt-2 text-3xl font-semibold">Suspended sales</h1>
            <p className="mt-1 text-sm text-stone-600">
              Recover saved carts or remove carts that are no longer needed.
            </p>
          </div>
          <Link
            href="/staff/pos"
            className="rounded-lg bg-stone-900 px-4 py-3 text-sm font-medium text-white"
          >
            Open POS
          </Link>
        </header>

        {error && (
          <p
            role="alert"
            className="mt-5 rounded-lg bg-red-50 p-3 text-sm text-red-700"
          >
            {error}
          </p>
        )}

        {message && (
          <div
            role="status"
            className="mt-5 rounded-lg bg-emerald-50 p-3 text-sm text-emerald-900"
          >
            <p>{message}</p>
            {createdOrder && (
              <div className="mt-2 flex flex-wrap items-center gap-3">
                <span>
                  Order <strong>{createdOrder.order_number}</strong>
                  {" · ID "}
                  {createdOrder.order_id}
                </span>
                <Link
                  href="/staff/orders"
                  className="font-medium underline underline-offset-2"
                >
                  Open order management →
                </Link>
              </div>
            )}
          </div>
        )}

        <section className="mt-6 rounded-xl border border-stone-200 bg-white p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold">Saved carts</h2>
              <p className="mt-1 text-sm text-stone-500">
                {filteredCarts.length} shown · {carts.length} total
              </p>
            </div>
            <button
              onClick={() => void loadCarts()}
              disabled={loading}
              className="rounded-lg border border-stone-300 px-3 py-2 text-sm disabled:opacity-50"
            >
              Refresh
            </button>
          </div>

          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search customer, phone or cart ID…"
            className="mt-4 w-full rounded-lg border border-stone-300 px-3 py-2.5 text-sm outline-none focus:border-amber-700"
          />

          {loading ? (
            <p className="py-8 text-sm text-stone-500">Loading saved carts…</p>
          ) : filteredCarts.length === 0 ? (
            <div className="py-10 text-center">
              <p className="font-medium">
                {carts.length === 0 ? "No suspended carts" : "No matching carts"}
              </p>
              <p className="mt-1 text-sm text-stone-500">
                {carts.length === 0
                  ? "Carts suspended at the POS will appear here."
                  : "Try another search term."}
              </p>
            </div>
          ) : (
            <div className="mt-4 space-y-3">
              {filteredCarts.map((cart) => {
                const itemCount = (cart.items ?? []).reduce(
                  (sum, item) => sum + (Number(item.quantity) || 0),
                  0,
                );
                const isBusy =
                  resumingId === cart.id || deletingId === cart.id;

                return (
                  <article
                    key={cart.id}
                    className="rounded-xl border border-stone-200 p-4 sm:p-5"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-4">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="font-semibold">
                            {cart.customer_name || "Walk-in customer"}
                          </h3>
                          <span className="rounded-full bg-stone-100 px-2 py-1 text-xs text-stone-600">
                            Cart #{cart.id}
                          </span>
                        </div>

                        <p className="mt-1 text-sm text-stone-600">
                          {cart.customer_phone || "No phone provided"}
                          {cart.customer_email ? ` · ${cart.customer_email}` : ""}
                        </p>

                        <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-sm text-stone-500">
                          <span>{itemCount} unit{itemCount === 1 ? "" : "s"}</span>
                          <span>
                            {(cart.items ?? []).length} product line
                            {(cart.items ?? []).length === 1 ? "" : "s"}
                          </span>
                          <span>
                            {cart.fulfillment_type === "DELIVERY" ? "Delivery" : "Pickup"}
                          </span>
                        </div>

                        {cart.fulfillment_type === "DELIVERY" &&
                          cart.delivery_address && (
                            <p className="mt-2 text-sm text-stone-600">
                              Delivery: {cart.delivery_address}
                            </p>
                          )}

                        {cart.customer_notes && (
                          <p className="mt-2 text-sm text-stone-500">
                            Customer note: {cart.customer_notes}
                          </p>
                        )}

                        <p className="mt-3 text-xs text-stone-400">
                          Last saved: {new Date(cart.updated_at).toLocaleString()}
                        </p>
                      </div>

                      <div className="flex flex-wrap gap-2">
                        <button
                          onClick={() => void resumeCart(cart)}
                          disabled={isBusy}
                          className="rounded-lg bg-stone-900 px-4 py-2.5 text-sm font-medium text-white disabled:opacity-50"
                        >
                          {resumingId === cart.id ? "Resuming…" : "Resume sale"}
                        </button>
                        <button
                          onClick={() => void deleteCart(cart)}
                          disabled={isBusy}
                          className="rounded-lg border border-stone-300 px-4 py-2.5 text-sm disabled:opacity-50"
                        >
                          {deletingId === cart.id ? "Deleting…" : "Delete"}
                        </button>
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
