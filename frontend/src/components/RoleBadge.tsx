"use client";

import { useMe } from "@/lib/use-me";

const LABELS: Record<string, string> = {
  OWNER: "Owner",
  ADMIN: "Admin",
  CLERK: "Clerk",
};

const STYLES: Record<string, string> = {
  OWNER: "bg-amber-100 text-amber-900",
  ADMIN: "bg-sky-100 text-sky-900",
  CLERK: "bg-stone-200 text-stone-700",
};

export default function RoleBadge() {
  const me = useMe();
  if (!me) return null;

  return (
    <span
      className={`rounded-full px-3 py-1 text-xs font-medium ${
        STYLES[me.role] ?? "bg-stone-200 text-stone-700"
      }`}
    >
      {me.username} &middot; {LABELS[me.role] ?? me.role}
    </span>
  );
}
