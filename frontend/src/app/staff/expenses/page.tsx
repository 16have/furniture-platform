"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useState } from "react";
import RoleBadge from "@/components/RoleBadge";
import { errorMessage, money, staffRequest } from "@/lib/staff-api";
import type { ApiList } from "@/lib/staff-api";
import { useMe } from "@/lib/use-me";

type Expense = {
  id: number;
  category: string;
  description: string;
  amount: string;
  expense_date: string;
  reference: string;
  notes: string;
  recorded_by_username: string | null;
};

const CATEGORIES = [
  "MAINTENANCE",
  "REPAIR",
  "TRANSPORT",
  "UTILITIES",
  "RENT",
  "SUPPLIES",
  "OTHER",
];

function label(value: string) {
  return value.replace(/_/g, " ").toLowerCase().replace(/^./, (c) => c.toUpperCase());
}

function today() {
  return new Date().toLocaleDateString("en-CA");
}

export default function ExpensesPage() {
  const me = useMe();
  const allowed = me?.role === "OWNER" || me?.role === "ADMIN";

  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [count, setCount] = useState(0);
  const [category, setCategory] = useState("");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [editingId, setEditingId] = useState<number | null>(null);
  const [fCategory, setFCategory] = useState("OTHER");
  const [fDescription, setFDescription] = useState("");
  const [fAmount, setFAmount] = useState("");
  const [fDate, setFDate] = useState(today());
  const [fReference, setFReference] = useState("");
  const [fNotes, setFNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams({ page_size: "100" });
      if (category) params.set("category", category);
      if (start) params.set("start_date", start);
      if (end) params.set("end_date", end);
      const data = await staffRequest<ApiList<Expense>>(`/expenses/?${params.toString()}`);
      const rows = Array.isArray(data) ? data : data.results ?? [];
      setExpenses(rows);
      setCount(Array.isArray(data) ? rows.length : data.count ?? rows.length);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [category, start, end]);

  useEffect(() => {
    if (allowed) void load();
  }, [allowed, load]);

  function resetForm() {
    setEditingId(null);
    setFCategory("OTHER");
    setFDescription("");
    setFAmount("");
    setFDate(today());
    setFReference("");
    setFNotes("");
    setFormError("");
  }

  function startEdit(e: Expense) {
    setEditingId(e.id);
    setFCategory(e.category);
    setFDescription(e.description);
    setFAmount(e.amount);
    setFDate(e.expense_date);
    setFReference(e.reference);
    setFNotes(e.notes);
    setFormError("");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setFormError("");
    try {
      const body = {
        category: fCategory,
        description: fDescription.trim(),
        amount: fAmount,
        expense_date: fDate,
        reference: fReference.trim(),
        notes: fNotes.trim(),
      };
      if (editingId) {
        await staffRequest(`/expenses/${editingId}/`, {
          method: "PATCH",
          body: JSON.stringify(body),
        });
      } else {
        await staffRequest("/expenses/", {
          method: "POST",
          body: JSON.stringify(body),
        });
      }
      resetForm();
      await load();
    } catch (err) {
      setFormError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  const shownTotal = expenses.reduce((sum, e) => sum + Number(e.amount || 0), 0);
  const inputClass = "rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm";

  return (
    <main className="min-h-screen bg-stone-100 px-4 py-7 text-stone-900 sm:px-8">
      <div className="mx-auto max-w-5xl">
        <Link href="/staff" className="text-sm text-stone-500 hover:text-stone-900">
          &larr; Staff dashboard
        </Link>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <h1 className="text-3xl font-semibold">Expenses</h1>
          <RoleBadge />
        </div>
        <p className="mt-1 text-sm text-stone-600">
          Record and review operating expenses.
        </p>

        {me && !allowed && (
          <p className="mt-5 rounded-lg border border-stone-200 bg-white p-4 text-sm text-stone-600">
            Expenses are available to owners and admins only.
          </p>
        )}

        {allowed && (
          <>
            <form
              onSubmit={submit}
              className="mt-5 grid gap-3 rounded-xl border border-stone-200 bg-white p-4 sm:grid-cols-2"
            >
              <h2 className="text-lg font-semibold sm:col-span-2">
                {editingId ? "Edit expense" : "Record an expense"}
              </h2>
              <select value={fCategory} onChange={(e) => setFCategory(e.target.value)} className={inputClass}>
                {CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {label(c)}
                  </option>
                ))}
              </select>
              <input
                type="date"
                required
                value={fDate}
                onChange={(e) => setFDate(e.target.value)}
                className={inputClass}
              />
              <input
                required
                maxLength={250}
                value={fDescription}
                onChange={(e) => setFDescription(e.target.value)}
                placeholder="Description"
                className={inputClass}
              />
              <input
                required
                type="number"
                min="0.01"
                step="0.01"
                value={fAmount}
                onChange={(e) => setFAmount(e.target.value)}
                placeholder="Amount (KES)"
                className={inputClass}
              />
              <input
                maxLength={100}
                value={fReference}
                onChange={(e) => setFReference(e.target.value)}
                placeholder="Reference (optional)"
                className={inputClass}
              />
              <input
                value={fNotes}
                onChange={(e) => setFNotes(e.target.value)}
                placeholder="Notes (optional)"
                className={inputClass}
              />

              {formError && (
                <p className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700 sm:col-span-2">
                  {formError}
                </p>
              )}

              <div className="flex gap-3 sm:col-span-2">
                <button
                  type="submit"
                  disabled={saving}
                  className="rounded-lg bg-stone-900 px-4 py-2 text-sm text-white disabled:opacity-50"
                >
                  {saving ? "Saving..." : editingId ? "Save changes" : "Add expense"}
                </button>
                {editingId && (
                  <button
                    type="button"
                    onClick={resetForm}
                    className="rounded-lg border border-stone-300 px-4 py-2 text-sm"
                  >
                    Cancel edit
                  </button>
                )}
              </div>
            </form>

            <div className="mt-6 flex flex-wrap items-center gap-3">
              <select value={category} onChange={(e) => setCategory(e.target.value)} className={inputClass}>
                <option value="">All categories</option>
                {CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {label(c)}
                  </option>
                ))}
              </select>
              <label className="flex items-center gap-2 text-sm text-stone-600">
                From
                <input type="date" value={start} onChange={(e) => setStart(e.target.value)} className={inputClass} />
              </label>
              <label className="flex items-center gap-2 text-sm text-stone-600">
                To
                <input type="date" value={end} onChange={(e) => setEnd(e.target.value)} className={inputClass} />
              </label>
              {(category || start || end) && (
                <button
                  type="button"
                  onClick={() => {
                    setCategory("");
                    setStart("");
                    setEnd("");
                  }}
                  className="text-sm text-stone-500 underline"
                >
                  Clear filters
                </button>
              )}
            </div>

            {error && (
              <p className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                {error}
              </p>
            )}

            <section className="mt-4 rounded-xl border border-stone-200 bg-white">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-stone-100 px-4 py-3 text-sm">
                <span className="text-stone-600">
                  {count} expense{count === 1 ? "" : "s"}
                  {count > expenses.length ? ` (showing the latest ${expenses.length})` : ""}
                </span>
                <span className="font-medium">
                  Total shown: {money(shownTotal)}
                </span>
              </div>
              {loading && <p className="p-4 text-sm text-stone-500">Loading...</p>}
              {!loading && expenses.length === 0 && (
                <p className="p-4 text-sm text-stone-500">No expenses found.</p>
              )}
              <ul className="divide-y divide-stone-100">
                {expenses.map((e) => (
                  <li key={e.id} className="flex flex-wrap items-start justify-between gap-3 px-4 py-3">
                    <div>
                      <p className="font-medium">{e.description}</p>
                      <p className="text-sm text-stone-600">
                        {label(e.category)} &middot; {e.expense_date}
                        {e.reference ? ` \u00b7 Ref ${e.reference}` : ""}
                        {e.recorded_by_username ? ` \u00b7 by ${e.recorded_by_username}` : ""}
                      </p>
                      {e.notes && <p className="text-xs text-stone-500">{e.notes}</p>}
                    </div>
                    <div className="text-right">
                      <p className="font-medium">{money(e.amount)}</p>
                      <button
                        type="button"
                        onClick={() => startEdit(e)}
                        className="mt-1 text-sm text-stone-600 underline"
                      >
                        Edit
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          </>
        )}
      </div>
    </main>
  );
}
