"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { errorMessage, saveTokens } from "@/lib/staff-api";

export default function StaffLoginPage() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");

    try {
      const response = await fetch(
        `${process.env.NEXT_PUBLIC_API_BASE_URL || "http://127.0.0.1:8000/api"}/token/`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ username, password }),
        },
      );

      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data.detail || "Login failed. Check your username and password.");
      }

      saveTokens(data.access, data.refresh);
      router.replace("/staff");
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="min-h-screen bg-stone-100 px-5 py-12 text-stone-900">
      <div className="mx-auto max-w-md rounded-2xl border border-stone-200 bg-white p-8 shadow-sm">
        <a href="/" className="text-sm text-stone-500 hover:text-stone-900">
          ← Back to storefront
        </a>
        <p className="mt-8 text-xs font-semibold uppercase tracking-[0.2em] text-amber-800">
          Haven &amp; Grain
        </p>
        <h1 className="mt-2 text-3xl font-semibold">Staff sign in</h1>
        <p className="mt-2 text-sm text-stone-600">
          Sign in with your staff account to manage sales and operations.
        </p>

        <form onSubmit={handleSubmit} className="mt-8 space-y-5">
          <label className="block text-sm font-medium">
            Username
            <input
              className="mt-2 w-full rounded-lg border border-stone-300 px-3 py-3 outline-none focus:border-amber-700"
              autoComplete="username"
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              required
            />
          </label>
          <label className="block text-sm font-medium">
            Password
            <input
              className="mt-2 w-full rounded-lg border border-stone-300 px-3 py-3 outline-none focus:border-amber-700"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
            />
          </label>

          {error && (
            <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">
              {error}
            </p>
          )}

          <button
            disabled={busy}
            className="w-full rounded-lg bg-stone-900 px-4 py-3 font-medium text-white hover:bg-stone-700 disabled:opacity-50"
          >
            {busy ? "Signing in…" : "Sign in"}
          </button>
        </form>
      </div>
    </main>
  );
}
