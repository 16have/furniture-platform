const API_BASE =
  process.env.NEXT_PUBLIC_API_BASE_URL || "http://127.0.0.1:8000/api";

const ACCESS_KEY = "furniture_access_token";
const REFRESH_KEY = "furniture_refresh_token";

export type ApiList<T> = T[] | { results?: T[]; count?: number };

export type StaffProduct = {
  id: number;
  category: number | { id: number; name?: string } | null;
  name: string;
  slug: string;
  sku: string;
  description?: string;
  specifications?: Record<string, unknown>;
  cost_price?: string | number;
  selling_price: string | number;
  reorder_level?: number;
  is_featured?: boolean;
  is_active?: boolean;
  images?: {
    image_url: string;
    is_primary?: boolean;
  }[];
};

export type StaffOrder = {
  id: number;
  order_number: string;
  status: string;
  customer_name?: string;
  customer_phone?: string;
  total_amount?: string | number;
  created_at?: string;
};

export type SuspendedCart = {
  id: number;
  customer_name?: string;
  customer_phone?: string;
  fulfillment_type?: string;
  items?: { product_id?: number; quantity?: number; [key: string]: unknown }[];
  created_at?: string;
};

export function getAccessToken() {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(ACCESS_KEY);
}

export function saveTokens(access: string, refresh: string) {
  localStorage.setItem(ACCESS_KEY, access);
  localStorage.setItem(REFRESH_KEY, refresh);
}

export function clearTokens() {
  localStorage.removeItem(ACCESS_KEY);
  localStorage.removeItem(REFRESH_KEY);
}

export function listFrom<T>(data: ApiList<T>): T[] {
  return Array.isArray(data) ? data : data.results ?? [];
}

export async function staffRequest<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const token = getAccessToken();
  const headers = new Headers(options.headers);

  if (options.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  if (token) headers.set("Authorization", `Bearer ${token}`);

  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers,
    cache: "no-store",
  });

  const body = await response.json().catch(() => null);

  if (response.status === 401) {
    clearTokens();
    if (typeof window !== "undefined") {
      window.location.href = "/staff/login";
    }
  }

  if (!response.ok) {
    const message =
      body?.detail ||
      body?.message ||
      (body && typeof body === "object"
        ? Object.entries(body)
            .map(([key, value]) => `${key}: ${Array.isArray(value) ? value.join(", ") : String(value)}`)
            .join(" | ")
        : null) ||
      `Request failed (${response.status})`;

    throw new Error(message);
  }

  return body as T;
}

export function money(value: string | number | undefined | null) {
  const amount = Number(value ?? 0);
  return new Intl.NumberFormat("en-KE", {
    style: "currency",
    currency: "KES",
    maximumFractionDigits: 2,
  }).format(Number.isFinite(amount) ? amount : 0);
}

export function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Something went wrong.";
}
