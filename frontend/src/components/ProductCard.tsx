"use client";

import Link from "next/link";
import { useCart } from "@/context/CartContext";
import {
  formatKES,
  productImage,
  type Product,
} from "@/lib/api";

export default function ProductCard({
  product,
}: {
  product: Product;
}) {
  const { addItem } = useCart();
  const image = productImage(product);

  return (
    <article className="product-card">
      <Link
        className="product-image-wrap"
        href={`/products/${product.slug}`}
      >
        {image ? (
          // Product URLs come from the backend catalogue.
          // eslint-disable-next-line @next/next/no-img-element
          <img src={image} alt={product.images?.[0]?.alt_text || product.name} />
        ) : (
          <div className="image-placeholder">
            <span>H.</span>
            <small>Furniture studio</small>
          </div>
        )}

        {product.is_featured && (
          <span className="product-tag">Featured</span>
        )}
      </Link>

      <div className="product-card-body">
        <p className="eyebrow">{product.category?.name || "Furniture"}</p>
        <Link href={`/products/${product.slug}`}>
          <h3>{product.name}</h3>
        </Link>

        <div className="product-card-bottom">
          <strong>{formatKES(product.selling_price)}</strong>
          <button
            className="quick-add"
            type="button"
            onClick={() => addItem(product)}
            aria-label={`Add ${product.name} to cart`}
          >
            +
          </button>
        </div>
      </div>
    </article>
  );
}
