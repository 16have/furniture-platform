import type { Metadata } from "next";
import { CartProvider } from "@/context/CartContext";
import Header from "@/components/Header";
import "./globals.css";

export const metadata: Metadata = {
  title: "Haven & Grain | Furniture Studio",
  description:
    "Discover thoughtfully designed furniture for living, dining, working and relaxing.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>
        <CartProvider>
          <Header />
          <main>{children}</main>
          <footer className="site-footer">
            <div className="container footer-inner">
              <div>
                <p className="footer-brand">Haven & Grain</p>
                <p>Furniture for living well.</p>
              </div>
              <div className="footer-links">
                <a href="/#collections">Shop furniture</a>
                <a href="/design-request">Custom designs</a>
                <a href="/track">Track your order</a>
              </div>
              <p className="footer-note">
                © {new Date().getFullYear()} Haven & Grain
              </p>
            </div>
          </footer>
        </CartProvider>
      </body>
    </html>
  );
}
