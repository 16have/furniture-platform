"use client";

import Link from "next/link";
import RoleBadge from "@/components/RoleBadge";
import { useCallback, useEffect, useMemo, useState } from "react";
import { errorMessage, listFrom, staffRequest } from "@/lib/staff-api";

type Supplier = {
  id: number;
  name: string;
  contact_person: string;
  phone: string;
  email: string;
  address: string;
  notes: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

type SupplierForm = Omit<
  Supplier,
  "id" | "created_at" | "updated_at"
>;

const emptyForm: SupplierForm = {
  name: "",
  contact_person: "",
  phone: "",
  email: "",
  address: "",
  notes: "",
  is_active: true,
};

const fieldClass =
  "mt-1 w-full rounded-lg border border-stone-300 bg-white px-3 py-2.5 text-sm outline-none focus:border-amber-700";

export default function SuppliersPage() {
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [form, setForm] = useState<SupplierForm>(emptyForm);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const loadSuppliers = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const data = await staffRequest<unknown>(
        "/inventory/suppliers/?page_size=100",
      );
      setSuppliers(listFrom(data as never) as Supplier[]);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadSuppliers();
  }, [loadSuppliers]);

  const filteredSuppliers = useMemo(() => {
    const query = search.trim().toLowerCase();
    return suppliers.filter((supplier) =>
      `${supplier.name} ${supplier.contact_person} ${supplier.phone} ${supplier.email}`
        .toLowerCase()
        .includes(query),
    );
  }, [suppliers, search]);

  function updateField<K extends keyof SupplierForm>(
    key: K,
    value: SupplierForm[K],
  ) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function editSupplier(supplier: Supplier) {
    setEditingId(supplier.id);
    setForm({
      name: supplier.name,
      contact_person: supplier.contact_person || "",
      phone: supplier.phone || "",
      email: supplier.email || "",
      address: supplier.address || "",
      notes: supplier.notes || "",
      is_active: supplier.is_active,
    });
    setError("");
    setMessage("");
  }

  function resetForm() {
    setEditingId(null);
    setForm(emptyForm);
  }

  async function saveSupplier(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setMessage("");

    if (!form.name.trim()) {
      setError("Supplier name is required.");
      return;
    }

    setBusy(true);
    try {
      await staffRequest(
        editingId
          ? `/inventory/suppliers/${editingId}/`
          : "/inventory/suppliers/",
        {
          method: editingId ? "PATCH" : "POST",
          body: JSON.stringify({
            ...form,
            name: form.name.trim(),
            contact_person: form.contact_person.trim(),
            phone: form.phone.trim(),
            email: form.email.trim(),
            address: form.address.trim(),
            notes: form.notes.trim(),
          }),
        },
      );

      setMessage(editingId ? "Supplier updated." : "Supplier created.");
      resetForm();
      await loadSuppliers();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function toggleActive(supplier: Supplier) {
    const nextActive = !supplier.is_active;
    const confirmed = window.confirm(
      `${nextActive ? "Reactivate" : "Deactivate"} ${supplier.name}?`,
    );
    if (!confirmed) return;

    setError("");
    setMessage("");
    setBusy(true);
    try {
      await staffRequest(`/inventory/suppliers/${supplier.id}/`, {
        method: "PATCH",
        body: JSON.stringify({ is_active: nextActive }),
      });
      setMessage(`${supplier.name} ${nextActive ? "reactivated" : "deactivated"}.`);
      await loadSuppliers();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="min-h-screen bg-stone-100 px-4 py-7 text-stone-900 sm:px-8">
      <div className="mx-auto max-w-7xl">
        <Link href="/staff/inventory" className="text-sm text-stone-500 hover:text-stone-900">
          ← Inventory
        </Link>

        <header className="mt-3">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-amber-800">
            Purchasing
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-3">
            <h1 className="text-3xl font-semibold">Suppliers</h1>
            <RoleBadge />
          </div>
          <p className="mt-1 text-sm text-stone-600">
            Maintain supplier contacts and associate suppliers with stock receipts.
          </p>
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

        <div className="mt-6 grid items-start gap-6 xl:grid-cols-[0.8fr_1.2fr]">
          <form
            onSubmit={saveSupplier}
            className="rounded-xl border border-stone-200 bg-white p-5"
          >
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-lg font-semibold">
                {editingId ? "Edit supplier" : "Add supplier"}
              </h2>
              {editingId !== null && (
                <button
                  type="button"
                  onClick={resetForm}
                  className="text-sm text-stone-500 underline"
                >
                  Cancel edit
                </button>
              )}
            </div>

            <p className="mt-1 text-sm text-stone-500">
              Supplier records are managed by owners and admins.
            </p>

            <label className="mt-5 block text-sm font-medium">
              Supplier name *
              <input
                value={form.name}
                onChange={(e) => updateField("name", e.target.value)}
                className={fieldClass}
                maxLength={200}
                required
              />
            </label>

            <label className="mt-4 block text-sm font-medium">
              Contact person
              <input
                value={form.contact_person}
                onChange={(e) => updateField("contact_person", e.target.value)}
                className={fieldClass}
                maxLength={150}
              />
            </label>

            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <label className="block text-sm font-medium">
                Phone
                <input
                  value={form.phone}
                  onChange={(e) => updateField("phone", e.target.value)}
                  className={fieldClass}
                  maxLength={30}
                />
              </label>
              <label className="block text-sm font-medium">
                Email
                <input
                  type="email"
                  value={form.email}
                  onChange={(e) => updateField("email", e.target.value)}
                  className={fieldClass}
                />
              </label>
            </div>

            <label className="mt-4 block text-sm font-medium">
              Address
              <textarea
                value={form.address}
                onChange={(e) => updateField("address", e.target.value)}
                className={fieldClass}
                rows={2}
              />
            </label>

            <label className="mt-4 block text-sm font-medium">
              Notes
              <textarea
                value={form.notes}
                onChange={(e) => updateField("notes", e.target.value)}
                className={fieldClass}
                rows={3}
                placeholder="Products supplied, payment terms or delivery details"
              />
            </label>

            {editingId !== null && (
              <label className="mt-4 flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={form.is_active}
                  onChange={(e) => updateField("is_active", e.target.checked)}
                />
                Supplier is active
              </label>
            )}

            <button
              type="submit"
              disabled={busy}
              className="mt-5 w-full rounded-lg bg-stone-900 px-4 py-3 text-sm font-medium text-white disabled:opacity-50"
            >
              {busy ? "Saving…" : editingId ? "Save changes" : "Create supplier"}
            </button>
          </form>

          <section className="rounded-xl border border-stone-200 bg-white p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold">Supplier directory</h2>
                <p className="mt-1 text-sm text-stone-500">
                  {suppliers.filter((supplier) => supplier.is_active).length} active · {suppliers.length} total
                </p>
              </div>
              <button
                onClick={() => void loadSuppliers()}
                disabled={loading}
                className="rounded-lg border border-stone-300 px-3 py-2 text-sm disabled:opacity-50"
              >
                Refresh
              </button>
            </div>

            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search name, contact, phone or email…"
              className={`${fieldClass} mb-4`}
            />

            {loading ? (
              <p className="py-6 text-sm text-stone-500">Loading suppliers…</p>
            ) : filteredSuppliers.length === 0 ? (
              <p className="py-6 text-sm text-stone-500">No matching suppliers.</p>
            ) : (
              <div className="divide-y divide-stone-100">
                {filteredSuppliers.map((supplier) => (
                  <article key={supplier.id} className="py-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="font-semibold">{supplier.name}</h3>
                          <span
                            className={`rounded-full px-2 py-1 text-xs ${
                              supplier.is_active
                                ? "bg-emerald-50 text-emerald-800"
                                : "bg-stone-100 text-stone-500"
                            }`}
                          >
                            {supplier.is_active ? "Active" : "Inactive"}
                          </span>
                        </div>
                        {supplier.contact_person && (
                          <p className="mt-2 text-sm text-stone-600">
                            Contact: {supplier.contact_person}
                          </p>
                        )}
                        <p className="mt-1 text-sm text-stone-600">
                          {supplier.phone || "No phone"} · {supplier.email || "No email"}
                        </p>
                        {supplier.address && (
                          <p className="mt-1 whitespace-pre-wrap text-sm text-stone-500">
                            {supplier.address}
                          </p>
                        )}
                        {supplier.notes && (
                          <p className="mt-2 whitespace-pre-wrap text-sm text-stone-500">
                            {supplier.notes}
                          </p>
                        )}
                      </div>
                      <div className="flex shrink-0 gap-2">
                        <button
                          onClick={() => editSupplier(supplier)}
                          className="rounded-lg border border-stone-300 px-3 py-2 text-sm"
                        >
                          Edit
                        </button>
                        <button
                          disabled={busy}
                          onClick={() => void toggleActive(supplier)}
                          className="rounded-lg border border-stone-300 px-3 py-2 text-sm disabled:opacity-50"
                        >
                          {supplier.is_active ? "Deactivate" : "Reactivate"}
                        </button>
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </section>
        </div>
      </div>
    </main>
  );
}
