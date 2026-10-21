"use client";

import Link from "next/link";
import { useCart } from "@/context/CartContext";

export default function Header() {
  const { itemCount } = useCart();

  return (
    <header className="site-header">
      <div className="announcement">
        Thoughtful furniture. Made for the way you live.
      </div>

      <div className="header-main container">
        <Link href="/" className="brand" aria-label="Home">
          <span className="brand-mark">H.</span>
          <span>
            <strong>Haven & Grain</strong>
            <small>FURNITURE STUDIO</small>
          </span>
        </Link>

        <nav className="desktop-nav" aria-label="Main navigation">
          <Link href="/#collections">Collections</Link>
          <Link href="/#featured">Featured</Link>
          <Link href="/design-request">Custom furniture</Link>
          <Link href="/track">Track order</Link>
        </nav>

        <div className="header-actions">
          <Link href="/cart" className="cart-link">
            <span aria-hidden="true">Bag</span>
            <span className="cart-count">{itemCount}</span>
          </Link>
        </div>
      </div>

      <nav className="mobile-nav container" aria-label="Mobile navigation">
        <Link href="/#collections">Shop</Link>
        <Link href="/design-request">Custom</Link>
        <Link href="/track">Track order</Link>
        <Link href="/cart">Bag ({itemCount})</Link>
      </nav>
    </header>
  );
}
