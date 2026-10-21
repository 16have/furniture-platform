"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import ProductCard from "@/components/ProductCard";
import { getCategories, getProducts, type Category, type Product } from "@/lib/api";

export default function HomePage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    Promise.all([getProducts("ordering=-created_at"), getCategories()])
      .then(([productData, categoryData]) => {
        setProducts(productData);
        setCategories(categoryData);
      })
      .catch(() => {
        setError(
          "We couldn't load the catalogue. Check that the Django backend is running and the API URL is configured.",
        );
      })
      .finally(() => setLoading(false));
  }, []);

  const featured = products.filter((product) => product.is_featured);
  const displayedProducts = featured.length ? featured : products;

  return (
    <>
      <section className="hero">
        <div className="hero-copy">
          <p className="eyebrow">Comfort, considered</p>
          <h1>Make room for living.</h1>
          <p>
            Furniture that brings natural warmth, considered design and
            everyday comfort into the spaces you call home.
          </p>
          <Link href="/#collections" className="button">
            Explore the collection <span aria-hidden="true">↗</span>
          </Link>
        </div>
        <div className="hero-image" role="img" aria-label="Warm, contemporary living room" />
      </section>

      <section className="container trust-strip">
        <div className="trust-item">
          <span className="trust-icon">◇</span>
          <div>
            <strong>Considered design</strong>
            <small>Furniture for everyday living</small>
          </div>
        </div>
        <div className="trust-item">
          <span className="trust-icon">⌂</span>
          <div>
            <strong>Made for your space</strong>
            <small>Ask us about custom pieces</small>
          </div>
        </div>
        <div className="trust-item">
          <span className="trust-icon">♡</span>
          <div>
            <strong>Personal service</strong>
            <small>Support from order to delivery</small>
          </div>
        </div>
      </section>

      <section className="section container" id="collections">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Find your style</p>
            <h2>Shop by collection</h2>
            <p>Pieces for the moments and spaces that matter.</p>
          </div>
          <Link href="/products" className="text-link">All furniture ↗</Link>
        </div>

        {categories.length ? (
          <div className="category-grid">
            {categories.slice(0, 3).map((category, index) => (
              <Link
                className="category-card"
                key={category.id}
                href={`/products?category=${encodeURIComponent(category.slug)}`}
              >
                <span>0{index + 1}</span>
                <h3>{category.name}</h3>
                <p>{category.description || "Explore pieces selected for your home."}</p>
              </Link>
            ))}
          </div>
        ) : (
          <div className="category-grid">
            {[
              ["Living", "Comfortable spaces for slow mornings and good company."],
              ["Dining", "Gather around a table made for sharing."],
              ["Bedroom", "Create a calmer place to rest and recharge."],
            ].map(([title, description], index) => (
              <Link
                className="category-card"
                key={title}
                href="/products"
              >
                <span>0{index + 1}</span>
                <h3>{title}</h3>
                <p>{description}</p>
              </Link>
            ))}
          </div>
        )}
      </section>

      <section className="section container" id="featured">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Made to be lived in</p>
            <h2>Pieces to love</h2>
            <p>Discover furniture to make your space feel like yours.</p>
          </div>
          <Link href="/products" className="text-link">Shop all ↗</Link>
        </div>

        {loading ? (
          <div className="loading-grid">Discovering the collection…</div>
        ) : error ? (
          <div className="error-state">{error}</div>
        ) : displayedProducts.length ? (
          <div className="product-grid">
            {displayedProducts.slice(0, 8).map((product) => (
              <ProductCard key={product.id} product={product} />
            ))}
          </div>
        ) : (
          <div className="empty-state">
            Our collection is being prepared. Please check back soon.
          </div>
        )}
      </section>

      <section className="container section">
        <div className="promo-banner">
          <div>
            <p className="eyebrow">Something just for you</p>
            <h2>Have a space in mind? Let's create for it.</h2>
            <p>
              Share your measurements, preferred materials and ideas.
              Our team can review your custom furniture request and prepare
              a quote.
            </p>
          </div>
          <Link href="/design-request" className="button">
            Start a custom request ↗
          </Link>
        </div>
      </section>
    </>
  );
}
