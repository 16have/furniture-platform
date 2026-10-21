const API_BASE =
  (process.env.NEXT_PUBLIC_API_BASE_URL || "http://127.0.0.1:8000/api")
    .replace(/\/+$/, "");

export type Category = {
  id: number;
  name: string;
  slug: string;
  description: string;
  image_url: string;
  display_order: number;
};

export type ProductImage = {
  id: number;
  image_url: string;
  alt_text: string;
  is_primary: boolean;
  display_order: number;
};

export type Product = {
  id: number;
  name: string;
  slug: string;
  sku: string;
  category: Category;
  description: string;
  specifications: Record<string, unknown>;
  selling_price: string | number;
  is_featured: boolean;
  images: ProductImage[];
  created_at: string;
};

export type ApiList<T> = {
  count?: number;
  next?: string | null;
  previous?: string | null;
  results?: T[];
};

export async function apiRequest<T>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      ...(init.body ? { "Content-Type": "application/json" } : {}),
      ...init.headers,
    },
    cache: "no-store",
  });

  const text = await response.text();
  let data: unknown = null;

  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }

  if (!response.ok) {
    const detail =
      typeof data === "object" && data !== null
        ? JSON.stringify(data)
        : String(data || `Request failed (${response.status})`);

    throw new Error(detail);
  }

  return data as T;
}

export function apiUrl(path: string) {
  return `${API_BASE}${path}`;
}

export async function getProducts(params = "") {
  const query = params ? `?${params}` : "";
  const data = await apiRequest<Product[] | ApiList<Product>>(
    `/products/${query}`,
  );

  return Array.isArray(data) ? data : data.results ?? [];
}

export async function getProduct(slug: string) {
  return apiRequest<Product>(`/products/${encodeURIComponent(slug)}/`);
}

export async function getCategories() {
  const data = await apiRequest<Category[] | ApiList<Category>>(
    "/categories/",
  );

  return Array.isArray(data) ? data : data.results ?? [];
}

export function formatKES(value: string | number) {
  return new Intl.NumberFormat("en-KE", {
    style: "currency",
    currency: "KES",
    maximumFractionDigits: 2,
  }).format(Number(value));
}

export function productImage(product: Product) {
  const primary = product.images?.find((image) => image.is_primary);
  return primary?.image_url || product.images?.[0]?.image_url || "";
}

export function readableError(error: unknown) {
  if (error instanceof Error) {
    try {
      const parsed = JSON.parse(error.message);
      if (typeof parsed === "object" && parsed !== null) {
        return Object.entries(parsed)
          .map(([key, value]) => {
            const message = Array.isArray(value)
              ? value.join(", ")
              : String(value);
            return `${key}: ${message}`;
          })
          .join(" · ");
      }
    } catch {
      // Keep the original message when it is not JSON.
    }

    return error.message;
  }

  return "Something went wrong. Please try again.";
}
