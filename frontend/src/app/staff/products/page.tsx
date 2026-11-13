"use client";

import Link from "next/link";
import RoleBadge from "@/components/RoleBadge";
import { FormEvent, useCallback, useEffect, useState } from "react";
import {
  errorMessage,
  listFrom,
  money,
  staffRequest,
  StaffProduct,
} from "@/lib/staff-api";

type Category = {
  id: number;
  name: string;
  slug: string;
  is_active?: boolean;
};

type ProductForm = {
  name: string;
  slug: string;
  sku: string;
  category: string;
  description: string;
  selling_price: string;
  cost_price: string;
  reorder_level: string;
  is_featured: boolean;
  is_active: boolean;
};

const emptyForm: ProductForm = {
  name: "",
  slug: "",
  sku: "",
  category: "",
  description: "",
  selling_price: "",
  cost_price: "",
  reorder_level: "0",
  is_featured: false,
  is_active: true,
};

export default function StaffProductsPage() {
  const [products, setProducts] = useState<StaffProduct[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [form, setForm] = useState<ProductForm>(emptyForm);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const loadData = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const [productData, categoryData] = await Promise.all([
        staffRequest<unknown>("/products/?page_size=100"),
        staffRequest<unknown>("/categories/?page_size=100"),
      ]);

      setProducts(listFrom(productData as never) as StaffProduct[]);
      setCategories(listFrom(categoryData as never) as Category[]);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  function update<K extends keyof ProductForm>(
    key: K,
    value: ProductForm[K],
  ) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function resetForm() {
    setForm(emptyForm);
    setEditingId(null);
  }

  function beginEdit(product: StaffProduct) {
    const categoryId =
      typeof product.category === "number"
        ? String(product.category)
        : typeof product.category === "object" &&
            product.category !== null &&
            "id" in product.category
          ? String(product.category.id)
          : "";

    setEditingId(product.id);
    setForm({
      name: product.name || "",
      slug: product.slug || "",
      sku: product.sku || "",
      category: categoryId,
      description: product.description || "",
      selling_price: String(product.selling_price ?? ""),
      cost_price: String(
        (product as StaffProduct & { cost_price?: string | number }).cost_price ?? "",
      ),
      reorder_level: String(
        (product as StaffProduct & { reorder_level?: number }).reorder_level ?? 0,
      ),
      is_featured: Boolean(
        (product as StaffProduct & { is_featured?: boolean }).is_featured,
      ),
      is_active: product.is_active !== false,
    });

    setError("");
    setMessage("");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function saveProduct(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError("");
    setMessage("");

    if (!form.category) {
      setError("Select a category.");
      setSaving(false);
      return;
    }

    const sellingPrice = Number(form.selling_price);
    const costPrice = Number(form.cost_price);
    const reorderLevel = Number(form.reorder_level);

    if (
      !Number.isFinite(sellingPrice) ||
      sellingPrice < 0 ||
      !Number.isFinite(costPrice) ||
      costPrice < 0 ||
      !Number.isInteger(reorderLevel) ||
      reorderLevel < 0
    ) {
      setError("Enter valid non-negative prices and a whole-number reorder level.");
      setSaving(false);
      return;
    }

    const payload = {
      name: form.name.trim(),
      slug: form.slug.trim(),
      sku: form.sku.trim(),
      category: Number(form.category),
      description: form.description.trim(),
      selling_price: form.selling_price,
      cost_price: form.cost_price,
      reorder_level: reorderLevel,
      is_featured: form.is_featured,
      is_active: form.is_active,
    };

    try {
      await staffRequest(
        editingId === null ? "/products/" : `/products/${form.slug.trim()}/`,
        {
          method: editingId === null ? "POST" : "PATCH",
          body: JSON.stringify(payload),
        },
      );

      setMessage(editingId === null ? "Product created." : "Product updated.");
      resetForm();
      await loadData();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  async function deactivateProduct(product: StaffProduct) {
    if (!window.confirm(`Deactivate "${product.name}"? It will no longer appear in the public catalogue.`)) {
      return;
    }

    setError("");
    setMessage("");

    try {
      await staffRequest(`/products/${product.slug}/`, { method: "DELETE" });
      setMessage(`${product.name} deactivated.`);
      await loadData();
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  const visibleProducts = products.filter((product) => {
    const query = search.trim().toLowerCase();
    return (
      !query ||
      `${product.name} ${product.sku} ${product.slug}`.toLowerCase().includes(query)
    );
  });

  return (
    <main className="min-h-screen bg-stone-100 px-4 py-8 text-stone-900 sm:px-8">
      <div className="mx-auto max-w-7xl">
        <Link href="/staff" className="text-sm text-stone-500 hover:text-stone-900">
          ← Dashboard
        </Link>

        <header className="mt-3 flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-amber-800">
              Catalogue administration
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-3">
              <h1 className="text-3xl font-semibold">Products</h1>
              <RoleBadge />
            </div>
            <p className="mt-1 text-sm text-stone-600">
              Manage product details, prices and catalogue visibility.
            </p>
          </div>
          <Link href="/staff/pos" className="rounded-lg border border-stone-300 bg-white px-4 py-3 text-sm">
            Open POS
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

        <section className="mt-6 rounded-xl border border-stone-200 bg-white p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-lg font-semibold">
              {editingId === null ? "Add a product" : "Edit product"}
            </h2>
            {editingId !== null && (
              <button onClick={resetForm} className="text-sm text-stone-600 underline">
                Cancel editing
              </button>
            )}
          </div>

          <form onSubmit={saveProduct} className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <label className="text-sm font-medium">
              Product name *
              <input
                required
                value={form.name}
                onChange={(e) => update("name", e.target.value)}
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
                onChange={(e) => update("slug", e.target.value)}
                className="mt-1 w-full rounded-lg border border-stone-300 px-3 py-2"
              />
            </label>

            <label className="text-sm font-medium">
              SKU *
              <input
                required
                value={form.sku}
                onChange={(e) => update("sku", e.target.value)}
                className="mt-1 w-full rounded-lg border border-stone-300 px-3 py-2"
              />
            </label>

            <label className="text-sm font-medium">
              Category *
              <select
                required
                value={form.category}
                onChange={(e) => update("category", e.target.value)}
                className="mt-1 w-full rounded-lg border border-stone-300 bg-white px-3 py-2"
              >
                <option value="">Select category</option>
                {categories.filter((category) => category.is_active !== false).map((category) => (
                  <option key={category.id} value={category.id}>{category.name}</option>
                ))}
              </select>
            </label>

            <label className="text-sm font-medium">
              Selling price (KES) *
              <input
                required
                type="number"
                min="0"
                step="0.01"
                value={form.selling_price}
                onChange={(e) => update("selling_price", e.target.value)}
                className="mt-1 w-full rounded-lg border border-stone-300 px-3 py-2"
              />
            </label>

            <label className="text-sm font-medium">
              Internal cost price (KES) *
              <input
                required
                type="number"
                min="0"
                step="0.01"
                value={form.cost_price}
                onChange={(e) => update("cost_price", e.target.value)}
                className="mt-1 w-full rounded-lg border border-stone-300 px-3 py-2"
              />
            </label>

            <label className="text-sm font-medium">
              Reorder alert level
              <input
                type="number"
                min="0"
                step="1"
                value={form.reorder_level}
                onChange={(e) => update("reorder_level", e.target.value)}
                className="mt-1 w-full rounded-lg border border-stone-300 px-3 py-2"
              />
            </label>

            <label className="text-sm font-medium sm:col-span-2 lg:col-span-3">
              Description
              <textarea
                rows={3}
                value={form.description}
                onChange={(e) => update("description", e.target.value)}
                className="mt-1 w-full rounded-lg border border-stone-300 px-3 py-2"
              />
            </label>

            <div className="flex flex-wrap gap-6 sm:col-span-2 lg:col-span-3">
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={form.is_featured}
                  onChange={(e) => update("is_featured", e.target.checked)}
                />
                Feature on storefront
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={form.is_active}
                  onChange={(e) => update("is_active", e.target.checked)}
                />
                Active in catalogue
              </label>
            </div>

            <div className="sm:col-span-2 lg:col-span-3">
              <button
                disabled={saving}
                className="rounded-lg bg-stone-900 px-5 py-3 font-medium text-white disabled:opacity-50"
              >
                {saving ? "Saving…" : editingId === null ? "Create product" : "Save changes"}
              </button>
            </div>
          </form>
        </section>

        <section className="mt-6 rounded-xl border border-stone-200 bg-white p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-lg font-semibold">Product catalogue</h2>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search name or SKU"
              className="w-full rounded-lg border border-stone-300 px-3 py-2 sm:max-w-xs"
            />
          </div>

          {loading ? (
            <p className="mt-5 text-sm text-stone-500">Loading products…</p>
          ) : (
            <div className="mt-4 overflow-x-auto">
              <table className="w-full min-w-[650px] text-left text-sm">
                <thead>
                  <tr className="border-b border-stone-200 text-stone-500">
                    <th className="py-3 pr-3 font-medium">Product</th>
                    <th className="py-3 pr-3 font-medium">SKU</th>
                    <th className="py-3 pr-3 font-medium">Selling price</th>
                    <th className="py-3 pr-3 font-medium">Visibility</th>
                    <th className="py-3 font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleProducts.map((product) => (
                    <tr key={product.id} className="border-b border-stone-100">
                      <td className="py-3 pr-3 font-medium">{product.name}</td>
                      <td className="py-3 pr-3 text-stone-600">{product.sku}</td>
                      <td className="py-3 pr-3">{money(product.selling_price)}</td>
                      <td className="py-3 pr-3">
                        {product.is_active === false ? "Inactive" : "Active"}
                      </td>
                      <td className="py-3">
                        <div className="flex gap-3">
                          <button onClick={() => beginEdit(product)} className="font-medium text-amber-800 underline">
                            Edit
                          </button>
                          {product.is_active !== false && (
                            <button onClick={() => deactivateProduct(product)} className="font-medium text-red-700 underline">
                              Deactivate
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                  {visibleProducts.length === 0 && (
                    <tr><td colSpan={5} className="py-6 text-stone-500">No products found.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <p className="mt-4 text-xs text-stone-500">
          Cost prices are intended for authorized staff only. The backend must enforce role permissions independently of this interface.
        </p>
      </div>
    </main>
  );
}
