"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  errorMessage,
  listFrom,
  money,
  StaffProduct,
  staffRequest,
} from "@/lib/staff-api";

type CartLine = { product: StaffProduct; quantity: number };
type CreatedOrder = {
  id: number;
  order_number: string;
  status?: string;
  total_amount?: string | number;
  total?: string | number;
  payment_summary?: {
    balance_due?: string | number;
    outstanding_amount?: string | number;
    available_to_collect?: string | number;
    paid?: string | number;
  };
};

type Receipt = {
  order_number: string;
  created_at: string;
  source: string;
  status: string;
  customer: { name: string; phone: string };
  fulfillment: {
    type: string;
    address?: string;
    requested_at?: string | null;
    confirmed_at?: string | null;
  };
  items: {
    product_name: string;
    sku: string;
    quantity: number;
    unit_price: string | number;
    line_total: string | number;
  }[];
  subtotal: string | number;
  discount_amount: string | number;
  delivery_fee: string | number;
  total_amount: string | number;
  paid: string | number;
  balance_due: string | number;
};

export default function POSPage() {
  const [products, setProducts] = useState<StaffProduct[]>([]);
  const [cart, setCart] = useState<CartLine[]>([]);
  const [search, setSearch] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [fulfillment, setFulfillment] = useState("PICKUP");
  const [address, setAddress] = useState("");
  const [deliveryFee, setDeliveryFee] = useState("0");
  const [discount, setDiscount] = useState("0");
  const [paymentAmount, setPaymentAmount] = useState("");
  const [notes, setNotes] = useState("");
  const [createdOrder, setCreatedOrder] = useState<CreatedOrder | null>(null);
  const [receipt, setReceipt] = useState<Receipt | null>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    staffRequest<unknown>("/products/?page_size=100")
      .then((data) => setProducts(listFrom(data as never)))
      .catch((err) => setError(errorMessage(err)));
  }, []);

  const filteredProducts = useMemo(() => {
    const query = search.trim().toLowerCase();
    return products.filter((product) => {
      if (product.is_active === false) return false;
      return !query || `${product.name} ${product.sku}`.toLowerCase().includes(query);
    });
  }, [products, search]);

  const estimatedSubtotal = cart.reduce(
    (sum, line) => sum + Number(line.product.selling_price) * line.quantity,
    0,
  );
  const estimatedTotal =
    estimatedSubtotal +
    (fulfillment === "DELIVERY" ? Math.max(0, Number(deliveryFee) || 0) : 0) -
    Math.min(estimatedSubtotal, Math.max(0, Number(discount) || 0));

  function addProduct(product: StaffProduct) {
    setCreatedOrder(null);
    setReceipt(null);
    setCart((current) => {
      const existing = current.find((line) => line.product.id === product.id);
      if (existing) {
        return current.map((line) =>
          line.product.id === product.id
            ? { ...line, quantity: line.quantity + 1 }
            : line,
        );
      }
      return [...current, { product, quantity: 1 }];
    });
  }

  function changeQuantity(productId: number, quantity: number) {
    setCreatedOrder(null);
    setReceipt(null);
    setCart((current) =>
      quantity <= 0
        ? current.filter((line) => line.product.id !== productId)
        : current.map((line) =>
            line.product.id === productId ? { ...line, quantity } : line,
          ),
    );
  }

  async function createSale() {
    setError("");
    setMessage("");
    setReceipt(null);
    if (!cart.length) return setError("Add at least one product.");
    if (!customerName.trim() || !customerPhone.trim()) {
      return setError("Customer name and phone are required.");
    }
    if (fulfillment === "DELIVERY" && !address.trim()) {
      return setError("Enter a delivery address.");
    }

    setBusy(true);
    try {
      const order = await staffRequest<CreatedOrder>("/sales/orders/", {
        method: "POST",
        body: JSON.stringify({
          customer_name: customerName.trim(),
          customer_phone: customerPhone.trim(),
          fulfillment_type: fulfillment,
          delivery_address: fulfillment === "DELIVERY" ? address.trim() : "",
          delivery_fee: fulfillment === "DELIVERY" ? deliveryFee : "0",
          discount_amount: discount || "0",
          customer_notes: notes,
          internal_notes: "",
          items: cart.map((line) => ({
            product_id: line.product.id,
            quantity: line.quantity,
          })),
        }),
      });

      setCreatedOrder(order);
      const due =
        order.payment_summary?.balance_due ??
        order.payment_summary?.outstanding_amount ??
        order.total_amount ??
        order.total ??
        estimatedTotal;
      setPaymentAmount(String(due));
      setMessage(`Sale ${order.order_number} created. Record a payment below if one is being collected now.`);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function recordCashPayment() {
    if (!createdOrder?.id) {
      setError("Create the sale before recording its payment.");
      return;
    }
    const amount = Number(paymentAmount);
    if (!Number.isFinite(amount) || amount <= 0) {
      setError("Enter a payment amount greater than zero.");
      return;
    }

    setBusy(true);
    setError("");
    setMessage("");
    try {
      const result = await staffRequest<{
        order_number?: string;
        payment_status?: string;
        summary?: { balance_due?: string | number; paid?: string | number };
      }>(`/sales/orders/${createdOrder.id}/cash-payment/`, {
        method: "POST",
        body: JSON.stringify({ amount: paymentAmount, notes: "Recorded at POS" }),
      });

      const paidMessage =
        `Payment recorded for ${result.order_number || createdOrder.order_number}. ` +
        `Status: ${result.payment_status || "recorded"}. ` +
        (result.summary?.balance_due !== undefined
          ? `Remaining balance: ${money(result.summary.balance_due)}.`
          : "");

      // The payment is already recorded. Receipt retrieval is deliberately
      // separate so a receipt error cannot make a successful payment look failed.
      setMessage(paidMessage);

      try {
        const response = await staffRequest<{ receipt: Receipt }>(
          `/sales/orders/${createdOrder.id}/receipt/`,
        );
        setReceipt(response.receipt);
      } catch {
        setMessage(
          `${paidMessage} The payment was recorded, but the receipt could not be loaded. ` +
          `Find order ${createdOrder.order_number} in Order management.`,
        );
      }

      setCart([]);
      setCreatedOrder(null);
      setCustomerName("");
      setCustomerPhone("");
      setAddress("");
      setNotes("");
      setDiscount("0");
      setDeliveryFee("0");
      setPaymentAmount("");
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function suspendSale() {
    setError("");
    setMessage("");
    if (!cart.length) return setError("Add products before suspending a sale.");

    setBusy(true);
    try {
      const result = await staffRequest<{ id?: number }>("/sales/suspended-carts/", {
        method: "POST",
        body: JSON.stringify({
          customer_name: customerName,
          customer_phone: customerPhone,
          customer_email: "",
          fulfillment_type: fulfillment,
          delivery_address: fulfillment === "DELIVERY" ? address : "",
          delivery_fee: fulfillment === "DELIVERY" ? deliveryFee : "0",
          discount_amount: discount || "0",
          customer_notes: notes,
          internal_notes: "",
          items: cart.map((line) => ({
            product_id: line.product.id,
            quantity: line.quantity,
          })),
        }),
      });

      setMessage(`Sale suspended${result.id ? ` (cart #${result.id})` : ""}.`);
      setCart([]);
      setCreatedOrder(null);
      setReceipt(null);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="min-h-screen bg-stone-100 px-4 py-6 text-stone-900 sm:px-8">
      <style jsx global>{`
        @media print {
          body * {
            visibility: hidden !important;
          }
          #pos-receipt,
          #pos-receipt * {
            visibility: visible !important;
          }
          #pos-receipt {
            position: absolute;
            inset: 0 auto auto 0;
            width: 100%;
            border: 0;
            margin: 0;
            padding: 24px;
          }
        }
      `}</style>
      <div className="mx-auto max-w-7xl">
        <header className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <Link href="/staff" className="text-sm text-stone-500 hover:text-stone-900">← Dashboard</Link>
            <h1 className="mt-2 text-3xl font-semibold">Point of sale</h1>
            <p className="mt-1 text-sm text-stone-600">Create sales and record cash payments.</p>
          </div>
          <Link href="/staff/suspended" className="rounded-lg border border-stone-300 bg-white px-4 py-2 text-sm">
            Suspended sales
          </Link>
        </header>

        {error && <p role="alert" className="mt-5 rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
        {message && <p role="status" className="mt-5 rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800 print:hidden">{message}</p>}

        {receipt && (
          <section id="pos-receipt" className="mt-6 rounded-xl border border-stone-200 bg-white p-6">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <h2 className="text-2xl font-semibold">Receipt</h2>
                <p className="mt-1 text-sm text-stone-600">
                  Order {receipt.order_number}
                </p>
                <p className="text-sm text-stone-600">
                  {new Date(receipt.created_at).toLocaleString()}
                </p>
              </div>
              <button
                type="button"
                onClick={() => window.print()}
                className="rounded-lg bg-stone-900 px-4 py-2 text-sm font-medium text-white print:hidden"
              >
                Print receipt
              </button>
            </div>

            <div className="mt-5 grid gap-3 border-y border-stone-200 py-4 text-sm sm:grid-cols-2">
              <div>
                <p className="font-medium">{receipt.customer.name}</p>
                <p className="text-stone-600">{receipt.customer.phone}</p>
              </div>
              <div>
                <p>Fulfillment: {receipt.fulfillment.type}</p>
                {receipt.fulfillment.address && (
                  <p className="text-stone-600">{receipt.fulfillment.address}</p>
                )}
                <p className="text-stone-600">Order status: {receipt.status}</p>
              </div>
            </div>

            <div className="mt-4 overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-stone-200 text-stone-500">
                    <th className="py-2 pr-3">Item</th>
                    <th className="px-3 py-2 text-right">Qty</th>
                    <th className="px-3 py-2 text-right">Price</th>
                    <th className="py-2 pl-3 text-right">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {receipt.items.map((item, index) => (
                    <tr key={`${item.sku}-${index}`} className="border-b border-stone-100">
                      <td className="py-3 pr-3">
                        <p className="font-medium">{item.product_name}</p>
                        <p className="text-xs text-stone-500">{item.sku}</p>
                      </td>
                      <td className="px-3 py-3 text-right">{item.quantity}</td>
                      <td className="px-3 py-3 text-right">{money(item.unit_price)}</td>
                      <td className="py-3 pl-3 text-right">{money(item.line_total)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="ml-auto mt-5 max-w-sm space-y-2 text-sm">
              <div className="flex justify-between"><span>Subtotal</span><span>{money(receipt.subtotal)}</span></div>
              <div className="flex justify-between"><span>Discount</span><span>−{money(receipt.discount_amount)}</span></div>
              <div className="flex justify-between"><span>Delivery</span><span>{money(receipt.delivery_fee)}</span></div>
              <div className="flex justify-between border-t border-stone-200 pt-3 text-base font-semibold">
                <span>Total</span><span>{money(receipt.total_amount)}</span>
              </div>
              <div className="flex justify-between"><span>Paid</span><span>{money(receipt.paid)}</span></div>
              <div className="flex justify-between font-semibold">
                <span>Balance due</span><span>{money(receipt.balance_due)}</span>
              </div>
            </div>
          </section>
        )}

        <div className="mt-6 grid items-start gap-6 lg:grid-cols-[1.2fr_0.8fr] print:hidden">
          <section className="rounded-xl border border-stone-200 bg-white p-5">
            <label className="block text-sm font-medium">
              Search products
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Product name or SKU"
                className="mt-2 w-full rounded-lg border border-stone-300 px-3 py-3 outline-none focus:border-amber-700"
              />
            </label>
            <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {filteredProducts.map((product) => (
                <button
                  key={product.id}
                  onClick={() => addProduct(product)}
                  className="rounded-xl border border-stone-200 p-4 text-left transition hover:border-amber-700"
                >
                  <span className="block font-medium">{product.name}</span>
                  <span className="mt-1 block text-xs text-stone-500">{product.sku}</span>
                  <span className="mt-3 block font-semibold">{money(product.selling_price)}</span>
                  <span className="mt-2 block text-xs text-amber-800">+ Add to sale</span>
                </button>
              ))}
              {filteredProducts.length === 0 && (
                <p className="text-sm text-stone-500">No matching products found.</p>
              )}
            </div>
          </section>

          <section className="rounded-xl border border-stone-200 bg-white p-5">
            <h2 className="text-lg font-semibold">Current sale</h2>
            <div className="mt-4 divide-y divide-stone-100">
              {cart.map((line) => (
                <div key={line.product.id} className="flex items-center justify-between gap-3 py-3">
                  <div className="min-w-0">
                    <p className="truncate font-medium">{line.product.name}</p>
                    <p className="mt-1 text-sm text-stone-500">
                      {money(line.product.selling_price)} each
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button aria-label="Decrease quantity" onClick={() => changeQuantity(line.product.id, line.quantity - 1)} className="h-8 w-8 rounded border">−</button>
                    <span className="w-5 text-center">{line.quantity}</span>
                    <button aria-label="Increase quantity" onClick={() => changeQuantity(line.product.id, line.quantity + 1)} className="h-8 w-8 rounded border">+</button>
                  </div>
                </div>
              ))}
              {!cart.length && <p className="py-4 text-sm text-stone-500">Your sale is empty.</p>}
            </div>

            <div className="mt-4 space-y-4 border-t border-stone-200 pt-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="text-sm font-medium">
                  Customer name *
                  <input value={customerName} onChange={(e) => setCustomerName(e.target.value)} className="mt-1 w-full rounded-lg border px-3 py-2" required />
                </label>
                <label className="text-sm font-medium">
                  Phone *
                  <input value={customerPhone} onChange={(e) => setCustomerPhone(e.target.value)} className="mt-1 w-full rounded-lg border px-3 py-2" required />
                </label>
              </div>

              <label className="block text-sm font-medium">
                Fulfillment
                <select value={fulfillment} onChange={(e) => setFulfillment(e.target.value)} className="mt-1 w-full rounded-lg border bg-white px-3 py-2">
                  <option value="PICKUP">Pickup</option>
                  <option value="DELIVERY">Delivery</option>
                </select>
              </label>

              {fulfillment === "DELIVERY" && (
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="text-sm font-medium">
                    Delivery address *
                    <input value={address} onChange={(e) => setAddress(e.target.value)} className="mt-1 w-full rounded-lg border px-3 py-2" />
                  </label>
                  <label className="text-sm font-medium">
                    Delivery fee (KES)
                    <input type="number" min="0" step="0.01" value={deliveryFee} onChange={(e) => setDeliveryFee(e.target.value)} className="mt-1 w-full rounded-lg border px-3 py-2" />
                  </label>
                </div>
              )}

              <label className="block text-sm font-medium">
                Discount (KES)
                <input type="number" min="0" step="0.01" value={discount} onChange={(e) => setDiscount(e.target.value)} className="mt-1 w-full rounded-lg border px-3 py-2" />
              </label>

              <label className="block text-sm font-medium">
                Notes
                <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} className="mt-1 w-full rounded-lg border px-3 py-2" />
              </label>

              <div className="space-y-2 border-t border-stone-200 pt-4 text-sm">
                <div className="flex justify-between"><span>Estimated subtotal</span><span>{money(estimatedSubtotal)}</span></div>
                <div className="flex justify-between"><span>Delivery</span><span>{money(fulfillment === "DELIVERY" ? deliveryFee : 0)}</span></div>
                <div className="flex justify-between"><span>Discount</span><span>−{money(discount)}</span></div>
                <div className="flex justify-between text-lg font-semibold"><span>Estimated total</span><span>{money(Math.max(0, estimatedTotal))}</span></div>
                <p className="text-xs text-stone-500">Final price, stock availability and total are validated by the backend.</p>
              </div>

              {!createdOrder ? (
                <div className="grid gap-3 sm:grid-cols-2">
                  <button disabled={busy || !cart.length} onClick={createSale} className="rounded-lg bg-stone-900 px-4 py-3 font-medium text-white disabled:opacity-50">
                    {busy ? "Processing…" : "Create sale"}
                  </button>
                  <button disabled={busy || !cart.length} onClick={suspendSale} className="rounded-lg border border-stone-300 px-4 py-3 font-medium disabled:opacity-50">
                    Suspend sale
                  </button>
                </div>
              ) : (
                <div className="space-y-3 rounded-lg border border-emerald-200 bg-emerald-50 p-4">
                  <p className="font-semibold">Order {createdOrder.order_number}</p>
                  <label className="block text-sm font-medium">
                    Cash amount received (KES)
                    <input type="number" min="1" step="0.01" value={paymentAmount} onChange={(e) => setPaymentAmount(e.target.value)} className="mt-1 w-full rounded-lg border bg-white px-3 py-2" />
                  </label>
                  <button disabled={busy} onClick={recordCashPayment} className="w-full rounded-lg bg-stone-900 px-4 py-3 font-medium text-white disabled:opacity-50">
                    {busy ? "Recording…" : "Record cash payment"}
                  </button>
                  <button
                    disabled={busy}
                    onClick={() => {
                      const orderNumber = createdOrder.order_number;
                      setCart([]);
                      setCreatedOrder(null);
                      setCustomerName("");
                      setCustomerPhone("");
                      setAddress("");
                      setNotes("");
                      setDiscount("0");
                      setDeliveryFee("0");
                      setPaymentAmount("");
                      setMessage(
                        `Order ${orderNumber} remains open and unpaid. ` +
                        `It has not been cancelled. You can find it in Order management.`,
                      );
                    }}
                    className="w-full rounded-lg border border-stone-300 px-4 py-2 text-sm"
                  >
                    Finish without payment
                  </button>
                </div>
              )}
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}
