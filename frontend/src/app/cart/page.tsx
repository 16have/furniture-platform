"use client";

import Link from "next/link";
import { useEffect } from "react";
import { useCart } from "@/context/CartContext";
import {
  formatKES,
  productImage,
} from "@/lib/api";

export default function CartPage() {
  const {
    items,
    subtotal,
    hydrated,
    unavailableIds,
    refresh,
    setQuantity,
    removeItem,
  } = useCart();

  useEffect(() => {
    if (hydrated) void refresh();
  }, [hydrated, refresh]);

  if (!hydrated) {
    return <section className="container page-shell">Loading your bag…</section>;
  }

  return (
    <section className="container page-shell">
      <div className="breadcrumbs"><Link href="/">Home</Link> / Your bag</div>
      <div className="page-intro">
        <p className="eyebrow">Your selection</p>
        <h1 className="page-title">Your bag</h1>
      </div>

      {!items.length ? (
        <div className="empty-state">
          Your bag is empty. Find something you love in our collection.
          <p><Link href="/products" className="button">Explore furniture</Link></p>
        </div>
      ) : (
        <div className="cart-layout">
          <div className="cart-list">
            {items.map(({ product, quantity }) => {
              const image = productImage(product);

              return (
                <article className="cart-item" key={product.id}>
                  <Link href={`/products/${product.slug}`} className="cart-thumb">
                    {image ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={image} alt={product.name} />
                    ) : null}
                  </Link>

                  <div>
                    <Link href={`/products/${product.slug}`}>
                      <h3>{product.name}</h3>
                    </Link>
                    <p>{formatKES(product.selling_price)} each</p>
                    {unavailableIds.includes(product.id) && (
                      <p className="form-error">
                        This item is no longer available. Please remove it
                        from your bag.
                      </p>
                    )}
                    <div className="quantity-control">
                      <button
                        type="button"
                        onClick={() => setQuantity(product.id, quantity - 1)}
                        aria-label={`Decrease ${product.name} quantity`}
                      >−</button>
                      <span>{quantity}</span>
                      <button
                        type="button"
                        onClick={() => setQuantity(product.id, quantity + 1)}
                        aria-label={`Increase ${product.name} quantity`}
                      >+</button>
                    </div>
                    <br />
                    <button
                      className="remove-button"
                      type="button"
                      onClick={() => removeItem(product.id)}
                    >
                      Remove
                    </button>
                  </div>

                  <strong>{formatKES(Number(product.selling_price) * quantity)}</strong>
                </article>
              );
            })}
          </div>

          <aside className="summary-card">
            <h2>Order summary</h2>
            <div className="summary-line">
              <span>Items subtotal</span>
              <span>{formatKES(subtotal)}</span>
            </div>
            <div className="summary-line">
              <span>Delivery</span>
              <span>Calculated at checkout</span>
            </div>
            <div className="summary-total">
              <span>Subtotal</span>
              <span>{formatKES(subtotal)}</span>
            </div>
            <p className="form-hint">
              This is an estimate. The backend calculates your final order
              total and delivery fee at checkout.
            </p>
            <Link href="/checkout" className="button">Continue to checkout</Link>
            <Link
              href="/products"
              className="button button-secondary"
              style={{ marginTop: 8 }}
            >
              Continue shopping
            </Link>
          </aside>
        </div>
      )}
    </section>
  );
}
