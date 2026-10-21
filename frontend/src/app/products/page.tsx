"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import ProductCard from "@/components/ProductCard";
import {
  getCategories,
  getProducts,
  type Category,
  type Product,
} from "@/lib/api";

function ProductCatalogue() {
  const searchParams = useSearchParams();
  const initialCategory = searchParams.get("category") || "";
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState(initialCategory);
  const [ordering, setOrdering] = useState("-created_at");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    getCategories()
      .then(setCategories)
      .catch(() => setCategories([]));
  }, []);

  useEffect(() => {
    setLoading(true);
    setError("");

    const params = new URLSearchParams();
    if (search.trim()) params.set("search", search.trim());
    if (category) params.set("category__slug", category);
    params.set("ordering", ordering);
    params.set("page_size", "100");

    getProducts(params.toString())
      .then(setProducts)
      .catch(() => setError("Couldn't load products. Please try again."))
      .finally(() => setLoading(false));
  }, [search, category, ordering]);

  return (
    <section className="container page-shell">
      <div className="breadcrumbs"><a href="/">Home</a> / Shop furniture</div>
      <div className="page-intro">
        <p className="eyebrow">The collection</p>
        <h1 className="page-title">Furniture for your everyday.</h1>
        <p>
          Browse the collection and find the right piece for your home.
          Looking for something different? Ask us about a custom design.
        </p>
      </div>

      <div className="catalog-toolbar">
        <input
          className="field"
          aria-label="Search furniture"
          placeholder="Search by name or description…"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
        <select
          className="select-field"
          aria-label="Filter by category"
          value={category}
          onChange={(event) => setCategory(event.target.value)}
        >
          <option value="">All categories</option>
          {categories.map((item) => (
            <option value={item.slug} key={item.id}>{item.name}</option>
          ))}
        </select>
        <select
          className="select-field"
          aria-label="Sort products"
          value={ordering}
          onChange={(event) => setOrdering(event.target.value)}
        >
          <option value="-created_at">Newest</option>
          <option value="selling_price">Price: low to high</option>
          <option value="-selling_price">Price: high to low</option>
          <option value="name">Name A–Z</option>
        </select>
      </div>

      {loading ? (
        <div className="loading-grid">Loading furniture…</div>
      ) : error ? (
        <div className="error-state">{error}</div>
      ) : products.length ? (
        <>
          <p className="form-hint">{products.length} product(s) shown</p>
          <div className="product-grid" style={{ marginTop: 18 }}>
            {products.map((product) => (
              <ProductCard key={product.id} product={product} />
            ))}
          </div>
        </>
      ) : (
        <div className="empty-state">
          No matching furniture found. Try another search or category.
        </div>
      )}
    </section>
  );
}

export default function ProductsPage() {
  return (
    <Suspense fallback={<section className="container page-shell">Loading catalogue…</section>}>
      <ProductCatalogue />
    </Suspense>
  );
}
