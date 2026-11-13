"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import RoleBadge from "@/components/RoleBadge";
import { downloadFile, errorMessage, money, staffRequest } from "@/lib/staff-api";
import { useMe } from "@/lib/use-me";

type Summary = {
  period: { start_date: string | null; end_date: string | null };
  completed_orders: number;
  sales_revenue_excluding_delivery: string;
  cost_of_goods_sold: string;
  gross_profit_estimate: string;
  operating_expenses: string;
  net_profit_estimate: string;
  completed_payments_collected: string;
  inventory: { stock_cost_value: string; stock_retail_value: string };
  notes: string[];
};

function Stat({
  title,
  value,
  negative,
}: {
  title: string;
  value: string;
  negative?: boolean;
}) {
  return (
    <div className="rounded-xl border border-stone-200 bg-white p-4">
      <p className="text-xs text-stone-500">{title}</p>
      <p className={`mt-1 text-xl font-semibold ${negative ? "text-red-700" : ""}`}>
        {value}
      </p>
    </div>
  );
}

export default function ReportsPage() {
  const me = useMe();
  const allowed = me?.role === "OWNER" || me?.role === "ADMIN";

  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams();
      if (start) params.set("start_date", start);
      if (end) params.set("end_date", end);
      const query = params.toString();
      setSummary(
        await staffRequest<Summary>(`/reports/summary/${query ? `?${query}` : ""}`),
      );
    } catch (err) {
      setSummary(null);
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [start, end]);

  useEffect(() => {
    if (allowed) void load();
  }, [allowed, load]);

  async function exportFile(kind: "sales" | "expenses", format: "csv" | "xlsx") {
    setExporting(true);
    setExportError("");
    try {
      const params = new URLSearchParams({ format });
      if (start) params.set("start_date", start);
      if (end) params.set("end_date", end);
      await downloadFile(
        `/reports/${kind}/?${params.toString()}`,
        `${kind}_report.${format}`,
      );
    } catch (err) {
      setExportError(errorMessage(err));
    } finally {
      setExporting(false);
    }
  }

  const inputClass = "rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm";
  const periodText =
    start || end
      ? `${start || "the beginning"} to ${end || "today"}`
      : "all time";

  return (
    <main className="min-h-screen bg-stone-100 px-4 py-7 text-stone-900 sm:px-8">
      <div className="mx-auto max-w-5xl">
        <Link href="/staff" className="text-sm text-stone-500 hover:text-stone-900">
          &larr; Staff dashboard
        </Link>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <h1 className="text-3xl font-semibold">Reports</h1>
          <RoleBadge />
        </div>
        <p className="mt-1 text-sm text-stone-600">
          Sales, costs and profit estimates for the selected period.
        </p>

        {me && !allowed && (
          <p className="mt-5 rounded-lg border border-stone-200 bg-white p-4 text-sm text-stone-600">
            Reports are available to owners and admins only.
          </p>
        )}

        {allowed && (
          <>
            <div className="mt-5 flex flex-wrap items-center gap-3">
              <label className="flex items-center gap-2 text-sm text-stone-600">
                From
                <input type="date" value={start} onChange={(e) => setStart(e.target.value)} className={inputClass} />
              </label>
              <label className="flex items-center gap-2 text-sm text-stone-600">
                To
                <input type="date" value={end} onChange={(e) => setEnd(e.target.value)} className={inputClass} />
              </label>
              {(start || end) && (
                <button
                  type="button"
                  onClick={() => {
                    setStart("");
                    setEnd("");
                  }}
                  className="text-sm text-stone-500 underline"
                >
                  Clear dates
                </button>
              )}
            </div>
            <p className="mt-2 text-xs text-stone-500">Showing: {periodText}</p>

            <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
              <span className="text-stone-600">Export for this period:</span>
              {(["sales", "expenses"] as const).map((kind) =>
                (["csv", "xlsx"] as const).map((format) => (
                  <button
                    key={`${kind}-${format}`}
                    type="button"
                    disabled={exporting}
                    onClick={() => void exportFile(kind, format)}
                    className="rounded-lg border border-stone-300 bg-white px-3 py-1.5 disabled:opacity-50"
                  >
                    {kind === "sales" ? "Sales" : "Expenses"} ({format === "csv" ? "CSV" : "Excel"})
                  </button>
                )),
              )}
            </div>
            {exportError && (
              <p className="mt-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                {exportError}
              </p>
            )}

            {error && (
              <p className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                {error}
              </p>
            )}
            {loading && <p className="mt-4 text-sm text-stone-500">Loading...</p>}

            {summary && !loading && (
              <>
                <section className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  <Stat title="Completed orders" value={String(summary.completed_orders)} />
                  <Stat title="Sales revenue (excluding delivery)" value={money(summary.sales_revenue_excluding_delivery)} />
                  <Stat title="Cost of goods sold" value={money(summary.cost_of_goods_sold)} />
                  <Stat
                    title="Gross profit (estimate)"
                    value={money(summary.gross_profit_estimate)}
                    negative={Number(summary.gross_profit_estimate) < 0}
                  />
                  <Stat title="Operating expenses" value={money(summary.operating_expenses)} />
                  <Stat
                    title="Net profit (estimate)"
                    value={money(summary.net_profit_estimate)}
                    negative={Number(summary.net_profit_estimate) < 0}
                  />
                  <Stat title="Payments collected" value={money(summary.completed_payments_collected)} />
                  <Stat title="Stock value at cost (today)" value={money(summary.inventory.stock_cost_value)} />
                  <Stat title="Stock value at retail (today)" value={money(summary.inventory.stock_retail_value)} />
                </section>

                {summary.notes.length > 0 && (
                  <section className="mt-6 rounded-xl border border-amber-200 bg-amber-50 p-4">
                    <p className="text-xs font-medium text-amber-800">How these figures are calculated</p>
                    <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-stone-700">
                      {summary.notes.map((note) => (
                        <li key={note}>{note}</li>
                      ))}
                    </ul>
                  </section>
                )}
              </>
            )}
          </>
        )}
      </div>
    </main>
  );
}
