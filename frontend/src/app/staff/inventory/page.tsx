"use client";

import Link from "next/link";
import RoleBadge from "@/components/RoleBadge";
import { useCallback, useEffect, useState } from "react";
import {
  errorMessage,
  listFrom,
  money,
  staffRequest,
  StaffProduct,
} from "@/lib/staff-api";

type Stock = {
  id: number;
  product: number;
  product_name: string;
  sku: string;
  quantity_on_hand: number;
  quantity_reserved: number;
  quantity_available: number;
  reorder_level: number;
  is_low_stock: boolean;
  updated_at: string;
};

type Supplier = { id: number; name: string };

type Movement = {
  id: number;
  product_name: string;
  sku: string;
  movement_type: string;
  quantity_delta: number;
  quantity_reserved_delta: number;
  supplier_name?: string | null;
  reference?: string;
  notes?: string;
  created_by_username?: string | null;
  created_at: string;
};

type Operation = "receive" | "damage" | "adjust";

const inputClass =
  "mt-1 w-full rounded-lg border border-stone-300 bg-white px-3 py-2.5 text-sm outline-none focus:border-amber-700";
const labelClass = "block text-sm font-medium text-stone-700";

export default function InventoryPage() {
  const [stock, setStock] = useState<Stock[]>([]);
  const [products, setProducts] = useState<StaffProduct[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [movements, setMovements] = useState<Movement[]>([]);
  const [operation, setOperation] = useState<Operation>("receive");
  const [productId, setProductId] = useState("");
  const [supplierId, setSupplierId] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [reference, setReference] = useState("");
  const [notes, setNotes] = useState("");
  const [search, setSearch] = useState("");
  const [movementFilter, setMovementFilter] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const loadData = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [stockData, productData, supplierData, movementData] =
        await Promise.all([
          staffRequest<unknown>("/inventory/stock/?page_size=100"),
          staffRequest<unknown>("/products/?page_size=100"),
          staffRequest<unknown>("/inventory/suppliers/?page_size=100"),
          staffRequest<unknown>("/inventory/movements/?page_size=100"),
        ]);

      setStock(listFrom(stockData as never) as Stock[]);
      setProducts(
        (listFrom(productData as never) as StaffProduct[]).filter(
          (p) => p.is_active !== false,
        ),
      );
      setSuppliers(listFrom(supplierData as never) as Supplier[]);
      setMovements(listFrom(movementData as never) as Movement[]);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const normalizedSearch = search.trim().toLowerCase();
  const filteredStock = stock.filter((item) =>
    `${item.product_name} ${item.sku}`.toLowerCase().includes(normalizedSearch),
  );
  const filteredMovements = movements.filter((item) => {
    const matchesType =
      !movementFilter || item.movement_type === movementFilter;
    const matchesSearch =
      !normalizedSearch ||
      `${item.product_name} ${item.sku} ${item.reference ?? ""}`
        .toLowerCase()
        .includes(normalizedSearch);
    return matchesType && matchesSearch;
  });

  const lowStockCount = stock.filter((item) => item.is_low_stock).length;
  const totalUnits = stock.reduce((sum, item) => sum + item.quantity_on_hand, 0);
  const totalReserved = stock.reduce(
    (sum, item) => sum + item.quantity_reserved,
    0,
  );
  const totalAvailable = stock.reduce(
    (sum, item) => sum + item.quantity_available,
    0,
  );

  async function submitOperation(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setMessage("");

    if (!productId) {
      setError("Select a product.");
      return;
    }

    const parsedQuantity = Number(quantity);
    if (!Number.isInteger(parsedQuantity) || parsedQuantity <= 0) {
      setError("Enter a positive whole-number quantity.");
      return;
    }

    if (operation === "adjust" && parsedQuantity === 0) {
      setError("Adjustment cannot be zero.");
      return;
    }

    const payload: Record<string, unknown> = {
      product_id: Number(productId),
      reference: reference.trim(),
      notes: notes.trim(),
    };

    if (operation === "adjust") {
      payload.quantity_delta = parsedQuantity;
    } else {
      payload.quantity = parsedQuantity;
    }

    if (operation === "receive" && supplierId) {
      payload.supplier_id = Number(supplierId);
    }

    setBusy(true);
    try {
      await staffRequest(`/inventory/operations/${operation}/`, {
        method: "POST",
        body: JSON.stringify(payload),
      });

      setMessage(
        operation === "receive"
          ? "Stock receipt recorded."
          : operation === "damage"
            ? "Damaged stock recorded."
            : "Stock adjustment recorded.",
      );
      setQuantity("1");
      setReference("");
      setNotes("");
      await loadData();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="min-h-screen bg-stone-100 px-4 py-7 text-stone-900 sm:px-8">
      <div className="mx-auto max-w-7xl">
        <Link href="/staff" className="text-sm text-stone-500 hover:text-stone-900">
          ← Staff dashboard
        </Link>

        <header className="mt-3 flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-amber-800">
              Store operations
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-3">
              <h1 className="text-3xl font-semibold">Inventory</h1>
              <RoleBadge />
            </div>
            <p className="mt-1 text-sm text-stone-600">
              Track stock, receive deliveries and maintain an auditable movement ledger.
            </p>
          </div>
          <Link
            href="/staff/suppliers"
            className="rounded-lg border border-stone-300 bg-white px-4 py-3 text-sm font-medium"
          >
            Manage suppliers →
          </Link>
        </header>

        {error && (
          <p role="alert" className="mt-5 rounded-lg bg-red-50 p-3 text-sm text-red-700">
            {error}
          </p>
        )}
        {message && (
          <p role="status" className="mt-5 rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800">
            {message}
          </p>
        )}

        <section className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {[
            ["Physical units", totalUnits],
            ["Reserved units", totalReserved],
            ["Available units", totalAvailable],
            ["Low-stock products", lowStockCount],
          ].map(([label, value]) => (
            <div key={label} className="rounded-xl border border-stone-200 bg-white p-5">
              <p className="text-sm text-stone-500">{label}</p>
              <p className="mt-2 text-3xl font-semibold">{value}</p>
            </div>
          ))}
        </section>

        <section className="mt-6 grid items-start gap-6 xl:grid-cols-[0.85fr_1.15fr]">
          <form
            onSubmit={submitOperation}
            className="rounded-xl border border-stone-200 bg-white p-5"
          >
            <h2 className="text-lg font-semibold">Record a stock operation</h2>
            <p className="mt-1 text-sm text-stone-500">
              Stock-changing operations require an owner or admin account.
            </p>

            <label className={`${labelClass} mt-5`}>
              Operation
              <select
                value={operation}
                onChange={(e) => setOperation(e.target.value as Operation)}
                className={inputClass}
              >
                <option value="receive">Receive delivery</option>
                <option value="damage">Record damaged units</option>
                <option value="adjust">Adjust stock count</option>
              </select>
            </label>

            <label className={`${labelClass} mt-4`}>
              Product
              <select
                value={productId}
                onChange={(e) => setProductId(e.target.value)}
                className={inputClass}
                required
              >
                <option value="">Select a product…</option>
                {products.map((product) => (
                  <option key={product.id} value={product.id}>
                    {product.name} · {product.sku}
                  </option>
                ))}
              </select>
            </label>

            <label className={`${labelClass} mt-4`}>
              {operation === "adjust"
                ? "Quantity change (+ or −)"
                : "Quantity"}
              <input
                type="number"
                step="1"
                min={operation === "adjust" ? undefined : 1}
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
                className={inputClass}
                required
              />
            </label>

            {operation === "receive" && (
              <label className={`${labelClass} mt-4`}>
                Supplier (optional)
                <select
                  value={supplierId}
                  onChange={(e) => setSupplierId(e.target.value)}
                  className={inputClass}
                >
                  <option value="">No supplier selected</option>
                  {suppliers
                    .filter((supplier) => supplier.name)
                    .map((supplier) => (
                      <option key={supplier.id} value={supplier.id}>
                        {supplier.name}
                      </option>
                    ))}
                </select>
              </label>
            )}

            <label className={`${labelClass} mt-4`}>
              Reference
              <input
                value={reference}
                onChange={(e) => setReference(e.target.value)}
                placeholder="Invoice, delivery note or count reference"
                maxLength={100}
                className={inputClass}
              />
            </label>

            <label className={`${labelClass} mt-4`}>
              Notes
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={3}
                className={inputClass}
                placeholder="Reason or additional details"
              />
            </label>

            {operation === "adjust" && (
              <p className="mt-3 rounded-lg bg-amber-50 p-3 text-xs text-amber-900">
                Use a positive number to add units and a negative number to remove units. The backend rejects zero and prevents stock from falling below reserved quantities.
              </p>
            )}

            <button
              type="submit"
              disabled={busy || loading}
              className="mt-5 w-full rounded-lg bg-stone-900 px-4 py-3 text-sm font-medium text-white disabled:opacity-50"
            >
              {busy ? "Saving…" : "Record operation"}
            </button>
          </form>

          <section className="rounded-xl border border-stone-200 bg-white p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold">Stock levels</h2>
                <p className="mt-1 text-sm text-stone-500">
                  Available units exclude reservations for orders.
                </p>
              </div>
              <button
                onClick={() => void loadData()}
                disabled={loading}
                className="rounded-lg border border-stone-300 px-3 py-2 text-sm disabled:opacity-50"
              >
                Refresh
              </button>
            </div>

            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search product or SKU…"
              className={`${inputClass} mb-4 mt-4`}
            />

            {loading ? (
              <p className="py-6 text-sm text-stone-500">Loading inventory…</p>
            ) : filteredStock.length === 0 ? (
              <p className="py-6 text-sm text-stone-500">
                No stock records match this search. Receive stock for a product to create its stock record.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[620px] text-left text-sm">
                  <thead className="border-b border-stone-200 text-xs uppercase text-stone-500">
                    <tr>
                      <th className="py-3 pr-4">Product</th>
                      <th className="py-3 pr-4">On hand</th>
                      <th className="py-3 pr-4">Reserved</th>
                      <th className="py-3 pr-4">Available</th>
                      <th className="py-3">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-stone-100">
                    {filteredStock.map((item) => (
                      <tr key={item.id}>
                        <td className="py-3 pr-4">
                          <p className="font-medium">{item.product_name}</p>
                          <p className="mt-1 text-xs text-stone-500">{item.sku}</p>
                        </td>
                        <td className="py-3 pr-4">{item.quantity_on_hand}</td>
                        <td className="py-3 pr-4">{item.quantity_reserved}</td>
                        <td className="py-3 pr-4 font-semibold">{item.quantity_available}</td>
                        <td className="py-3">
                          {item.is_low_stock ? (
                            <span className="rounded-full bg-amber-100 px-2 py-1 text-xs text-amber-900">
                              Reorder ≤ {item.reorder_level}
                            </span>
                          ) : (
                            <span className="text-xs text-emerald-800">In range</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </section>

        <section className="mt-6 rounded-xl border border-stone-200 bg-white p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold">Stock movement ledger</h2>
              <p className="mt-1 text-sm text-stone-500">
                Read-only history of recorded inventory changes.
              </p>
            </div>
            <select
              value={movementFilter}
              onChange={(e) => setMovementFilter(e.target.value)}
              className="rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm"
            >
              <option value="">All movement types</option>
              {["RECEIPT", "SALE", "RESERVATION", "RELEASE", "DAMAGE", "ADJUSTMENT", "RETURN"].map((type) => (
                <option key={type} value={type}>{type}</option>
              ))}
            </select>
          </div>

          {loading ? (
            <p className="py-6 text-sm text-stone-500">Loading movements…</p>
          ) : filteredMovements.length === 0 ? (
            <p className="py-6 text-sm text-stone-500">No matching stock movements.</p>
          ) : (
            <div className="mt-4 overflow-x-auto">
              <table className="w-full min-w-[760px] text-left text-sm">
                <thead className="border-b border-stone-200 text-xs uppercase text-stone-500">
                  <tr>
                    <th className="py-3 pr-4">Date</th>
                    <th className="py-3 pr-4">Product</th>
                    <th className="py-3 pr-4">Type</th>
                    <th className="py-3 pr-4">Stock change</th>
                    <th className="py-3 pr-4">Reserved change</th>
                    <th className="py-3 pr-4">Reference</th>
                    <th className="py-3">Recorded by</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-100">
                  {filteredMovements.map((movement) => (
                    <tr key={movement.id}>
                      <td className="whitespace-nowrap py-3 pr-4 text-stone-500">
                        {new Date(movement.created_at).toLocaleString()}
                      </td>
                      <td className="py-3 pr-4">
                        <p className="font-medium">{movement.product_name}</p>
                        <p className="mt-1 text-xs text-stone-500">{movement.sku}</p>
                      </td>
                      <td className="py-3 pr-4">{movement.movement_type}</td>
                      <td className="py-3 pr-4 font-medium">
                        {movement.quantity_delta > 0 ? "+" : ""}
                        {movement.quantity_delta}
                      </td>
                      <td className="py-3 pr-4">
                        {movement.quantity_reserved_delta > 0 ? "+" : ""}
                        {movement.quantity_reserved_delta}
                      </td>
                      <td className="py-3 pr-4">
                        <p>{movement.reference || "—"}</p>
                        {movement.notes && (
                          <p className="mt-1 max-w-48 truncate text-xs text-stone-500" title={movement.notes}>
                            {movement.notes}
                          </p>
                        )}
                      </td>
                      <td className="py-3">{movement.created_by_username || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
