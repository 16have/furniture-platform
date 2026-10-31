"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { apiUrl, type Product } from "@/lib/api";

export type CartItem = {
  product: Product;
  quantity: number;
};

type CartContextValue = {
  items: CartItem[];
  itemCount: number;
  subtotal: number;
  hydrated: boolean;
  unavailableIds: number[];
  refresh: () => Promise<void>;
  addItem: (product: Product, quantity?: number) => void;
  setQuantity: (productId: number, quantity: number) => void;
  removeItem: (productId: number) => void;
  clearCart: () => void;
};

const CartContext = createContext<CartContextValue | null>(null);
const STORAGE_KEY = "furniture-store-cart-v1";

function isValidItem(item: unknown): item is CartItem {
  if (typeof item !== "object" || item === null) return false;
  const { product, quantity } = item as Partial<CartItem>;
  return (
    typeof product === "object" &&
    product !== null &&
    Number.isInteger(product.id) &&
    product.id > 0 &&
    typeof product.slug === "string" &&
    Number.isFinite(Number(product.selling_price)) &&
    Number.isInteger(quantity) &&
    (quantity ?? 0) > 0
  );
}

export function CartProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<CartItem[]>([]);
  const [hydrated, setHydrated] = useState(false);
  const [unavailableIds, setUnavailableIds] = useState<number[]>([]);
  const itemsRef = useRef<CartItem[]>([]);
  itemsRef.current = items;

  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed)) setItems(parsed.filter(isValidItem));
      }
    } catch {
      localStorage.removeItem(STORAGE_KEY);
    } finally {
      setHydrated(true);
    }
  }, []);

  useEffect(() => {
    if (hydrated) {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
      } catch {
        // Storage may be full or blocked; the cart still works in memory.
      }
    }
  }, [items, hydrated]);

  const refresh = useCallback(async () => {
    const current = itemsRef.current;
    if (!current.length) {
      setUnavailableIds([]);
      return;
    }

    type Result =
      | { id: number; state: "ok"; product: Product }
      | { id: number; state: "gone" }
      | { id: number; state: "unknown" };

    const results: Result[] = await Promise.all(
      current.map(async ({ product }): Promise<Result> => {
        try {
          const response = await fetch(
            apiUrl(`/products/${encodeURIComponent(product.slug)}/`),
            { cache: "no-store" },
          );
          if (response.status === 404) return { id: product.id, state: "gone" };
          if (!response.ok) return { id: product.id, state: "unknown" };
          return {
            id: product.id,
            state: "ok",
            product: (await response.json()) as Product,
          };
        } catch {
          return { id: product.id, state: "unknown" };
        }
      }),
    );

    const fresh = new Map<number, Product>();
    const gone: number[] = [];
    for (const result of results) {
      if (result.state === "ok") fresh.set(result.id, result.product);
      if (result.state === "gone") gone.push(result.id);
    }

    setUnavailableIds(gone);
    setItems((cart) =>
      cart.map((item) => {
        const updated = fresh.get(item.product.id);
        return updated ? { ...item, product: updated } : item;
      }),
    );
  }, []);

  const addItem = useCallback((product: Product, quantity = 1) => {
    setItems((current) => {
      const existing = current.find(
        (item) => item.product.id === product.id,
      );

      if (existing) {
        return current.map((item) =>
          item.product.id === product.id
            ? { ...item, quantity: item.quantity + quantity }
            : item,
        );
      }

      return [...current, { product, quantity }];
    });
  }, []);

  const setQuantity = useCallback(
    (productId: number, quantity: number) => {
      if (quantity <= 0) {
        setItems((current) =>
          current.filter((item) => item.product.id !== productId),
        );
        return;
      }

      setItems((current) =>
        current.map((item) =>
          item.product.id === productId
            ? { ...item, quantity }
            : item,
        ),
      );
    },
    [],
  );

  const removeItem = useCallback((productId: number) => {
    setItems((current) =>
      current.filter((item) => item.product.id !== productId),
    );
  }, []);

  const clearCart = useCallback(() => setItems([]), []);

  const value = useMemo(
    () => ({
      items,
      itemCount: items.reduce((total, item) => total + item.quantity, 0),
      subtotal: items.reduce(
        (total, item) =>
          total + Number(item.product.selling_price) * item.quantity,
        0,
      ),
      hydrated,
      unavailableIds,
      refresh,
      addItem,
      setQuantity,
      removeItem,
      clearCart,
    }),
    [
      items,
      hydrated,
      unavailableIds,
      refresh,
      addItem,
      setQuantity,
      removeItem,
      clearCart,
    ],
  );

  return (
    <CartContext.Provider value={value}>
      {children}
    </CartContext.Provider>
  );
}

export function useCart() {
  const context = useContext(CartContext);
  if (!context) {
    throw new Error("useCart must be used inside CartProvider.");
  }
  return context;
}
