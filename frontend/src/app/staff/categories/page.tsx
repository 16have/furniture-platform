"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useState } from "react";
import { errorMessage, listFrom, staffRequest } from "@/lib/staff-api";

type Category = {
  id: number;
  name: string;
  slug: string;
  description?: string;
  image_url?: string | null;
  display_order?: number;
};

type CategoryForm = {
  name: string;
  slug: string;
  description: string;
  image_url: string;
  display_order: string;
};

const blank: CategoryForm = {
  name: "",
  slug: "",
  description: "",
  image_url: "",
  display_order: "0",
};

export default function StaffCategoriesPage() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [form, setForm] = useState<CategoryForm>(blank);
  const [editingSlug, setEditingSlug] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const loadCategories = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const data = await staffRequest<unknown>("/categories/?page_size=100");
      setCategories(listFrom(data as never) as Category[]);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadCategories();
  }, [loadCategories]);

  function reset() {
    setForm(blank);
    setEditingSlug(null);
  }

  function edit(category: Category) {
    setEditingSlug(category.slug);
    setForm({
      name: category.name || "",
      slug: category.slug || "",
      description: category.description || "",
      image_url: category.image_url || "",
      display_order: String(category.display_order ?? 0),
    });
    setError("");
    setMessage("");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setMessage("");

    const order = Number(form.display_order);
    if (!Number.isInteger(order) || order < 0) {
      setError("Display order must be a non-negative whole number.");
      return;
    }

    setSaving(true);
    try {
      const payload = {
        name: form.name.trim(),
        slug: form.slug.trim(),
        description: form.description.trim(),
        image_url: form.image_url.trim() || null,
        display_order: order,
      };

      await staffRequest(
        editingSlug === null
          ? "/categories/"
          : `/categories/${encodeURIComponent(editingSlug)}/`,
        {
          method: editingSlug === null ? "POST" : "PATCH",
          body: JSON.stringify(payload),
        },
      );

      setMessage(editingSlug === null ? "Category created." : "Category updated.");
      reset();
      await loadCategories();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="min-h-screen bg-stone-100 px-4 py-8 text-stone-900 sm:px-8">
      <div className="mx-auto max-w-6xl">
        <Link href="/staff" className="text-sm text-stone-500 hover:text-stone-900">
          ← Dashboard
        </Link>

        <header className="mt-3">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-amber-800">
            Catalogue administration
          </p>
          <h1 className="mt-2 text-3xl font-semibold">Categories</h1>
          <p className="mt-1 text-sm text-stone-600">
            Organize furniture into customer-facing catalogue sections.
          </p>
        </header>

        {error && <p role="alert" className="mt-5 rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
        {message && <p role="status" className="mt-5 rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800">{message}</p>}

        <section className="mt-6 rounded-xl border border-stone-200 bg-white p-5">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-lg font-semibold">
              {editingSlug === null ? "Add category" : "Edit category"}
            </h2>
            {editingSlug !== null && (
              <button onClick={reset} className="text-sm text-stone-600 underline">
                Cancel
              </button>
            )}
          </div>

          <form onSubmit={submit} className="mt-5 grid gap-4 sm:grid-cols-2">
            <label className="text-sm font-medium">
              Category name *
              <input
                required
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                className="mt-1 w-full rounded-lg border border-stone-300 px-3 py-2"
              />
            </label>

            <label className="text-sm font-medium">
              URL slug *
              <input
                required
                pattern="[a-zA-Z0-9_-]+"
                title="Use letters, numbers, hyphens or underscores."
                value={form.slug}
                onChange={(e) => setForm({ ...form, slug: e.target.value })}
                className="mt-1 w-full rounded-lg border border-stone-300 px-3 py-2"
              />
            </label>

            <label className="text-sm font-medium">
              Category image URL
              <input
                type="url"
                value={form.image_url}
                onChange={(e) => setForm({ ...form, image_url: e.target.value })}
                placeholder="https://..."
                className="mt-1 w-full rounded-lg border border-stone-300 px-3 py-2"
              />
            </label>

            <label className="text-sm font-medium">
              Display order
              <input
                type="number"
                min="0"
                step="1"
                value={form.display_order}
                onChange={(e) => setForm({ ...form, display_order: e.target.value })}
                className="mt-1 w-full rounded-lg border border-stone-300 px-3 py-2"
              />
            </label>

            <label className="text-sm font-medium sm:col-span-2">
              Description
              <textarea
                rows={3}
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                className="mt-1 w-full rounded-lg border border-stone-300 px-3 py-2"
              />
            </label>

            <div className="sm:col-span-2">
              <button
                disabled={saving}
                className="rounded-lg bg-stone-900 px-5 py-3 font-medium text-white disabled:opacity-50"
              >
                {saving ? "Saving…" : editingSlug === null ? "Create category" : "Save changes"}
              </button>
            </div>
          </form>
        </section>

        <section className="mt-6 rounded-xl border border-stone-200 bg-white p-5">
          <h2 className="text-lg font-semibold">Existing categories</h2>
          {loading ? (
            <p className="mt-4 text-sm text-stone-500">Loading categories…</p>
          ) : (
            <div className="mt-4 divide-y divide-stone-100">
              {categories.map((category) => (
                <div key={category.id} className="flex flex-wrap items-center justify-between gap-3 py-4">
                  <div>
                    <p className="font-medium">{category.name}</p>
                    <p className="mt-1 text-sm text-stone-500">
                      /{category.slug} · Display order {category.display_order ?? 0}
                    </p>
                    {category.description && (
                      <p className="mt-1 text-sm text-stone-600">{category.description}</p>
                    )}
                  </div>
                  <button
                    onClick={() => edit(category)}
                    className="rounded-lg border border-stone-300 px-4 py-2 text-sm"
                  >
                    Edit
                  </button>
                </div>
              ))}
              {categories.length === 0 && (
                <p className="py-6 text-sm text-stone-500">No categories found.</p>
              )}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
