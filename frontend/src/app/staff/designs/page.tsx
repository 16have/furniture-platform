"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { errorMessage, listFrom, money, staffRequest } from "@/lib/staff-api";
import type { ApiList } from "@/lib/staff-api";

type DesignRequest = {
  id: number;
  reference: string;
  customer_name: string;
  customer_phone: string;
  title: string;
  status: string;
  quantity: number;
  estimated_price: string | number | null;
  estimated_production_days?: number | null;
  customer_email?: string;
  description?: string;
  dimensions?: string;
  materials?: string;
  finish?: string;
  notes?: string;
  reference_image_url?: string;
  internal_production_cost?: string | number | null;
  internal_notes?: string;
  created_at: string;
};

const STATUSES = [
  "REQUESTED",
  "REVIEWING",
  "QUOTED",
  "APPROVED",
  "IN_PRODUCTION",
  "READY",
  "COMPLETED",
  "CANCELLED",
];

function label(value: string) {
  return value.replace(/_/g, " ").toLowerCase().replace(/^./, (c) => c.toUpperCase());
}

function Field({ name, value }: { name: string; value?: string | number | null }) {
  if (value === undefined || value === null || value === "") return null;
  return (
    <div>
      <dt className="text-xs text-stone-500">{name}</dt>
      <dd className="whitespace-pre-wrap">{value}</dd>
    </div>
  );
}

function isHttpUrl(value?: string) {
  return !!value && /^https?:\/\//i.test(value);
}

export default function DesignRequestsPage() {
  const [requests, setRequests] = useState<DesignRequest[]>([]);
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState<DesignRequest | null>(null);

  const load = useCallback(async (statusFilter: string) => {
    setLoading(true);
    setError("");
    try {
      const path = statusFilter
        ? `/design-requests/?page_size=100&status=${encodeURIComponent(statusFilter)}`
        : "/design-requests/?page_size=100";
      const data = await staffRequest<ApiList<DesignRequest>>(path);
      setRequests(listFrom(data));
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load(status);
  }, [status, load]);

  return (
    <main className="min-h-screen bg-stone-100 px-4 py-7 text-stone-900 sm:px-8">
      <div className="mx-auto max-w-5xl">
        <Link href="/staff" className="text-sm text-stone-500 hover:text-stone-900">
          &larr; Staff dashboard
        </Link>
        <h1 className="mt-3 text-3xl font-semibold">Custom design requests</h1>
        <p className="mt-1 text-sm text-stone-600">
          Review requests submitted from the public design form.
        </p>

        <select
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          className="mt-5 rounded-lg border border-stone-300 bg-white px-3 py-2.5 text-sm"
        >
          <option value="">All statuses</option>
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {label(s)}
            </option>
          ))}
        </select>

        {error && (
          <p className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            {error}
          </p>
        )}

        <section className="mt-5 rounded-xl border border-stone-200 bg-white">
          {loading && <p className="p-4 text-sm text-stone-500">Loading...</p>}
          {!loading && requests.length === 0 && (
            <p className="p-4 text-sm text-stone-500">No design requests found.</p>
          )}
          <ul className="divide-y divide-stone-100">
            {requests.map((r) => (
              <li
                key={r.id}
                onClick={() => setSelected(r)}
                className="cursor-pointer px-4 py-3 hover:bg-stone-50"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="font-medium">
                    {r.title} <span className="text-xs text-stone-500">{r.reference}</span>
                  </p>
                  <span className="rounded-full bg-stone-100 px-2 py-0.5 text-xs">
                    {label(r.status)}
                  </span>
                </div>
                <p className="text-sm text-stone-600">
                  {r.customer_name} &middot; {r.customer_phone} &middot; Qty {r.quantity}
                  {r.estimated_price != null ? ` \u00b7 Quote ${money(r.estimated_price)}` : ""}
                </p>
                <p className="text-xs text-stone-500">{r.created_at.slice(0, 10)}</p>
              </li>
            ))}
          </ul>
        </section>

        {selected && (
          <section className="mt-5 rounded-xl border border-stone-200 bg-white p-4">
            <div className="flex items-start justify-between gap-2">
              <div>
                <h2 className="text-lg font-semibold">{selected.title}</h2>
                <p className="text-xs text-stone-500">
                  {selected.reference} &middot; {label(selected.status)}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSelected(null)}
                className="text-sm text-stone-500 hover:text-stone-900"
              >
                Close
              </button>
            </div>

            <dl className="mt-3 grid gap-3 text-sm sm:grid-cols-2">
              <Field name="Customer" value={selected.customer_name} />
              <Field name="Phone" value={selected.customer_phone} />
              <Field name="Email" value={selected.customer_email} />
              <Field name="Quantity" value={selected.quantity} />
              <Field name="Dimensions" value={selected.dimensions} />
              <Field name="Materials" value={selected.materials} />
              <Field name="Finish" value={selected.finish} />
              <Field
                name="Quote"
                value={selected.estimated_price != null ? money(selected.estimated_price) : null}
              />
              <Field name="Production days" value={selected.estimated_production_days} />
              <Field name="Requested on" value={selected.created_at.slice(0, 10)} />
            </dl>

            <dl className="mt-3 grid gap-3 text-sm">
              <Field name="Description" value={selected.description} />
              <Field name="Customer notes" value={selected.notes} />
            </dl>

            {isHttpUrl(selected.reference_image_url) && (
              <a
                href={selected.reference_image_url}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-3 inline-block text-sm text-stone-700 underline"
              >
                Open reference image
              </a>
            )}

            {("internal_production_cost" in selected || "internal_notes" in selected) && (
              <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-3">
                <p className="text-xs font-medium text-amber-800">
                  Internal (owner/admin only)
                </p>
                <dl className="mt-2 grid gap-3 text-sm sm:grid-cols-2">
                  <Field
                    name="Production cost"
                    value={
                      selected.internal_production_cost != null
                        ? money(selected.internal_production_cost)
                        : null
                    }
                  />
                  <Field name="Internal notes" value={selected.internal_notes} />
                </dl>
              </div>
            )}
          </section>
        )}
      </div>
    </main>
  );
}
