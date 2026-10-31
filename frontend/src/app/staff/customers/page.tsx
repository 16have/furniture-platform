"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { errorMessage, listFrom, staffRequest } from "@/lib/staff-api";
import type { ApiList } from "@/lib/staff-api";

type Customer = {
  id: number;
  name: string;
  phone: string;
  email: string;
  notes: string;
  created_at: string;
  updated_at: string;
};

type HistoryOrder = {
  id: number;
  order_number?: string;
  status?: string;
  total_amount?: string | number;
  created_at?: string;
};

type History = {
  customer: Customer;
  orders: HistoryOrder[];
  summary: { order_count: number; completed_payment_total: string };
};

export default function CustomersPage() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const emptyForm = { name: "", phone: "", email: "", notes: "" };
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [history, setHistory] = useState<History | null>(null);
  const [historyLoading, setHistoryLoading] = useState(false);

  const loadCustomers = useCallback(async (query: string) => {
    setLoading(true);
    setError("");
    try {
      const q = query.trim();
      const path = q
        ? `/customers/?page_size=100&search=${encodeURIComponent(q)}`
        : "/customers/?page_size=100";
      const data = await staffRequest<ApiList<Customer>>(path);
      setCustomers(listFrom(data));
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => void loadCustomers(search), 300);
    return () => clearTimeout(timer);
  }, [search, loadCustomers]);

  async function showHistory(c: Customer) {
    setError("");
    setHistory(null);
    setHistoryLoading(true);
    try {
      const data = await staffRequest<History>(`/customers/${c.id}/history/`);
      setHistory(data);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setHistoryLoading(false);
    }
  }

  function startEdit(c: Customer) {
    setEditingId(c.id);
    setForm({
      name: c.name,
      phone: c.phone,
      email: c.email ?? "",
      notes: c.notes ?? "",
    });
    setMessage("");
    setError("");
  }

  function resetForm() {
    setEditingId(null);
    setForm(emptyForm);
  }

  async function saveCustomer() {
    setError("");
    setMessage("");
    if (!form.name.trim() || !form.phone.trim()) {
      setError("Name and phone are required.");
      return;
    }
    setBusy(true);
    try {
      await staffRequest(
        editingId ? `/customers/${editingId}/` : "/customers/",
        {
          method: editingId ? "PATCH" : "POST",
          body: JSON.stringify({
            name: form.name.trim(),
            phone: form.phone.trim(),
            email: form.email.trim(),
            notes: form.notes.trim(),
          }),
        },
      );
      setMessage(editingId ? "Customer updated." : "Customer created.");
      resetForm();
      await loadCustomers(search);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="min-h-screen bg-stone-100 px-4 py-7 text-stone-900 sm:px-8">
      <div className="mx-auto max-w-5xl">
        <Link href="/staff" className="text-sm text-stone-500 hover:text-stone-900">
          ← Staff dashboard
        </Link>
        <h1 className="mt-3 text-3xl font-semibold">Customers</h1>
        <p className="mt-1 text-sm text-stone-600">
          Search the customer directory by name, phone or email.
        </p>

        <section className="mt-5 rounded-xl border border-stone-200 bg-white p-4">
          <h2 className="font-semibold">
            {editingId ? "Edit customer" : "New customer"}
          </h2>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <input
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="Name *"
              className="rounded-lg border border-stone-300 px-3 py-2 text-sm"
            />
            <input
              value={form.phone}
              onChange={(e) => setForm({ ...form, phone: e.target.value })}
              placeholder="Phone *"
              className="rounded-lg border border-stone-300 px-3 py-2 text-sm"
            />
            <input
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              placeholder="Email"
              className="rounded-lg border border-stone-300 px-3 py-2 text-sm"
            />
            <input
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
              placeholder="Notes"
              className="rounded-lg border border-stone-300 px-3 py-2 text-sm"
            />
          </div>
          <div className="mt-3 flex gap-2">
            <button
              disabled={busy}
              onClick={() => void saveCustomer()}
              className="rounded-lg bg-stone-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
            >
              {busy ? "Saving..." : editingId ? "Save changes" : "Create customer"}
            </button>
            {editingId && (
              <button
                disabled={busy}
                onClick={resetForm}
                className="rounded-lg border border-stone-300 px-4 py-2 text-sm"
              >
                Cancel
              </button>
            )}
          </div>
          {message && <p className="mt-3 text-sm text-emerald-700">{message}</p>}
        </section>

        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search customers"
          className="mt-5 w-full rounded-lg border border-stone-300 bg-white px-3 py-2.5 text-sm"
        />

        {error && (
          <p className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            {error}
          </p>
        )}

        {historyLoading && (
          <p className="mt-5 text-sm text-stone-500">Loading history...</p>
        )}
        {history && (
          <section className="mt-5 rounded-xl border border-stone-200 bg-white p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="font-semibold">{history.customer.name}</h2>
                <p className="text-sm text-stone-600">
                  {history.summary.order_count} order(s) · Paid so far: KES{" "}
                  {history.summary.completed_payment_total}
                </p>
              </div>
              <button
                onClick={() => setHistory(null)}
                className="text-xs text-stone-500 underline"
              >
                Close
              </button>
            </div>
            {history.orders.length === 0 ? (
              <p className="mt-3 text-sm text-stone-500">
                No orders linked to this customer. Orders placed before
                customers were linked are not shown here.
              </p>
            ) : (
              <ul className="mt-3 divide-y divide-stone-100 text-sm">
                {history.orders.map((o) => (
                  <li key={o.id} className="flex justify-between gap-3 py-2">
                    <span className="font-medium">{o.order_number ?? "-"}</span>
                    <span className="text-stone-600">{o.status ?? "-"}</span>
                    <span>KES {o.total_amount ?? "-"}</span>
                    <span className="text-stone-500">
                      {o.created_at ? o.created_at.slice(0, 10) : "-"}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}

        <section className="mt-5 rounded-xl border border-stone-200 bg-white">
          {loading && <p className="p-4 text-sm text-stone-500">Loading…</p>}
          {!loading && customers.length === 0 && (
            <p className="p-4 text-sm text-stone-500">No customers found.</p>
          )}
          <ul className="divide-y divide-stone-100">
            {customers.map((c) => (
              <li key={c.id} className="px-4 py-3">
                <p className="font-medium">{c.name}</p>
                <p className="text-sm text-stone-600">
                  {c.phone}
                  {c.email ? ` · ${c.email}` : ""}
                </p>
                <button
                  onClick={() => startEdit(c)}
                  className="mt-1 text-xs font-medium text-amber-800 underline"
                >
                  Edit
                </button>
                <button
                  onClick={() => void showHistory(c)}
                  className="ml-3 mt-1 text-xs font-medium text-stone-700 underline"
                >
                  History
                </button>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </main>
  );
}
