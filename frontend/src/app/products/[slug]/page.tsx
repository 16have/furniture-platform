"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { useCart } from "@/context/CartContext";
import {
  formatKES,
  getProduct,
  readableError,
  type Product,
} from "@/lib/api";

export default function ProductDetailPage() {
  const params = useParams<{ slug: string }>();
  const slug = params.slug;
  const { addItem } = useCart();
  const [product, setProduct] = useState<Product | null>(null);
  const [quantity, setQuantity] = useState(1);
  const [selectedImage, setSelectedImage] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!slug) return;

    getProduct(slug)
      .then((data) => {
        setProduct(data);
        setSelectedImage(
          data.images?.find((image) => image.is_primary)?.image_url ||
          data.images?.[0]?.image_url ||
          "",
        );
      })
      .catch((err) => setError(readableError(err)))
      .finally(() => setLoading(false));
  }, [slug]);

  if (loading) {
    return <section className="container page-shell">Loading product…</section>;
  }

  if (!product) {
    return (
      <section className="container page-shell">
        <div className="error-state">
          {error || "This product could not be found."}
          <p><Link href="/products" className="text-link">Back to the collection</Link></p>
        </div>
      </section>
    );
  }

  const specifications = Object.entries(product.specifications || {});

  return (
    <section className="container page-shell">
      <div className="breadcrumbs">
        <Link href="/">Home</Link> / <Link href="/products">Shop</Link> / {product.name}
      </div>

      <div className="product-detail">
        <div>
          <div className="product-detail-image">
            {selectedImage ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={selectedImage} alt={product.name} />
            ) : (
              <div className="image-placeholder"><span>H.</span></div>
            )}
          </div>

          {product.images.length > 1 && (
            <div style={{ display: "flex", gap: 10, marginTop: 12, flexWrap: "wrap" }}>
              {product.images.map((image) => (
                <button
                  key={image.id}
                  type="button"
                  onClick={() => setSelectedImage(image.image_url)}
                  aria-label={`View ${image.alt_text || product.name}`}
                  style={{
                    width: 70,
                    height: 70,
                    padding: 0,
                    border: selectedImage === image.image_url
                      ? "2px solid var(--green)"
                      : "1px solid var(--line)",
                    background: "white",
                    overflow: "hidden",
                  }}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={image.image_url}
                    alt={image.alt_text || product.name}
                    style={{ width: "100%", height: "100%", objectFit: "cover" }}
                  />
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="product-detail-info">
          <p className="eyebrow">{product.category?.name || "Furniture"}</p>
          <h1>{product.name}</h1>
          <p className="product-price">{formatKES(product.selling_price)}</p>
          <p className="product-description">
            {product.description || "A considered piece for your home."}
          </p>

          <p className="form-hint">SKU: {product.sku}</p>

          <div style={{ marginTop: 25 }}>
            <label className="field-label">Quantity</label>
            <div className="quantity-control">
              <button
                type="button"
                onClick={() => setQuantity((value) => Math.max(1, value - 1))}
                aria-label="Decrease quantity"
              >−</button>
              <span>{quantity}</span>
              <button
                type="button"
                onClick={() => setQuantity((value) => Math.min(50, value + 1))}
                aria-label="Increase quantity"
              >+</button>
            </div>
          </div>

          <div className="product-actions">
            <button
              className="button"
              type="button"
              onClick={() => addItem(product, quantity)}
            >
              Add to bag — {formatKES(Number(product.selling_price) * quantity)}
            </button>
            <Link className="button button-secondary" href="/cart">View bag</Link>
          </div>

          {specifications.length > 0 && (
            <div className="spec-list">
              <h3 style={{ fontFamily: "Georgia, serif", fontWeight: 400 }}>
                Product details
              </h3>
              {specifications.map(([key, value]) => (
                <div className="spec-row" key={key}>
                  <span>{key.replaceAll("_", " ")}</span>
                  <span>{typeof value === "object" ? JSON.stringify(value) : String(value)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
