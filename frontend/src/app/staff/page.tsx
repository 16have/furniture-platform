"use client";

import Link from "next/link";
import RoleBadge from "@/components/RoleBadge";
import { useEffect, useState } from "react";
import {
  errorMessage,
  listFrom,
  money,
  StaffOrder,
  staffRequest,
} from "@/lib/staff-api";

type LowStockItem = {
  id?: number;
  product_name?: string;
  name?: string;
  sku?: string;
  quantity_on_hand?: number;
  quantity_reserved?: number;
  available_quantity?: number;
  available?: number;
  reorder_level?: number;
};

function Shortcut({
  href,
  title,
  description,
}: {
  href: string;
  title: string;
  description: string;
}) {
  return (
    <Link
      href={href}
      className="rounded-xl border border-stone-200 bg-white p-5 transition hover:border-amber-700 hover:shadow-sm"
    >
      <h3 className="font-semibold">{title} ↗</h3>
      <p className="mt-2 text-sm text-stone-600">{description}</p>
    </Link>
  );
}

export default function StaffDashboardPage() {
  const [orders, setOrders] = useState<StaffOrder[]>([]);
  const [lowStock, setLowStock] = useState<LowStockItem[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;

    async function load() {
      try {
        const [orderData, stockData] = await Promise.all([
          staffRequest<unknown>("/sales/orders/?page_size=8"),
          staffRequest<unknown>("/inventory/stock/low-stock/"),
        ]);

        if (!alive) return;
        setOrders(listFrom(orderData as never));
        setLowStock(listFrom(stockData as never));
      } catch (err) {
        if (alive) setError(errorMessage(err));
      } finally {
        if (alive) setLoading(false);
      }
    }

    load();
    return () => {
      alive = false;
    };
  }, []);

  return (
    <main className="min-h-screen bg-stone-100 px-4 py-8 text-stone-900 sm:px-8">
      <div className="mx-auto max-w-7xl">
        <header className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-amber-800">
              Haven &amp; Grain · Operations
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-3">
              <h1 className="text-3xl font-semibold">Staff dashboard</h1>
              <RoleBadge />
            </div>
            <p className="mt-1 text-sm text-stone-600">
              Sales, stock and day-to-day store operations.
            </p>
          </div>
          <div className="flex gap-3">
            <Link href="/" className="rounded-lg border border-stone-300 bg-white px-4 py-2 text-sm">
              Storefront
            </Link>
            <button
              onClick={() => {
                localStorage.removeItem("furniture_access_token");
                localStorage.removeItem("furniture_refresh_token");
                window.location.href = "/staff/login";
              }}
              className="rounded-lg border border-stone-300 bg-white px-4 py-2 text-sm"
            >
              Sign out
            </button>
          </div>
        </header>

        <section className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Shortcut href="/staff/pos" title="Point of sale" description="Create a sale, take a deposit or record a payment." />
          <Shortcut href="/staff/orders" title="Order management" description="Track outstanding balances, record payments, schedule fulfillment and manage order status." />
          <Shortcut href="/staff/products" title="Manage products" description="Create products, edit prices and manage catalogue visibility." />
          <Shortcut href="/staff/suspended" title="Suspended sales" description="Resume a cart saved for later." />
          <Shortcut href="/staff/inventory" title="Inventory" description="Review stock levels, receive deliveries, record damage and audit movements." />
          <Shortcut href="/staff/suppliers" title="Suppliers" description="Maintain supplier contacts and deactivate outdated records." />
          <Shortcut href="/staff/customers" title="Customers" description="Search the customer directory, edit details and review purchase history." />
          <Shortcut href="/staff/designs" title="Design requests" description="Review custom design requests, send quotes and move them through production." />
          <Shortcut href="/products" title="Public catalogue" description="View the products customers can browse." />
          <Shortcut href="/staff" title="Operations overview" description="Recent orders and inventory alerts." />
        </section>

        {error && (
          <div className="mt-6 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            {error}
            <p className="mt-1">
              Confirm that Django is running and this staff account is authorized.
            </p>
          </div>
        )}

        <div className="mt-8 grid gap-6 lg:grid-cols-2">
          <section className="rounded-xl border border-stone-200 bg-white p-5">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-lg font-semibold">Recent orders</h2>
              <span className="text-sm text-stone-500">{orders.length} shown</span>
            </div>
            {loading ? (
              <p className="mt-5 text-sm text-stone-500">Loading orders…</p>
            ) : orders.length === 0 ? (
              <p className="mt-5 text-sm text-stone-500">No orders to display.</p>
            ) : (
              <div className="mt-4 divide-y divide-stone-100">
                {orders.map((order) => (
                  <div key={order.id} className="flex items-start justify-between gap-3 py-3">
                    <div>
                      <p className="font-medium">{order.order_number}</p>
                      <p className="mt-1 text-sm text-stone-500">
                        {order.customer_name || "Customer"} · {order.customer_phone || "No phone"}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-medium">{money(order.total_amount)}</p>
                      <p className="mt-1 text-xs text-stone-500">{order.status}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section className="rounded-xl border border-stone-200 bg-white p-5">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-lg font-semibold">Low-stock alerts</h2>
              <span className="text-sm text-stone-500">{lowStock.length} shown</span>
            </div>
            {loading ? (
              <p className="mt-5 text-sm text-stone-500">Loading stock…</p>
            ) : lowStock.length === 0 ? (
              <p className="mt-5 text-sm text-stone-500">
                No low-stock items returned by the API.
              </p>
            ) : (
              <div className="mt-4 divide-y divide-stone-100">
                {lowStock.map((item, index) => (
                  <div key={item.id ?? index} className="flex items-start justify-between gap-3 py-3">
                    <div>
                      <p className="font-medium">{item.product_name || item.name || "Stock item"}</p>
                      <p className="mt-1 text-sm text-stone-500">{item.sku || "No SKU"}</p>
                    </div>
                    <p className="text-sm text-amber-800">
                      Available: {item.available_quantity ?? item.available ?? "—"}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      </div>
    </main>
  );
}
