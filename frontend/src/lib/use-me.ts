"use client";

import { useEffect, useState } from "react";
import { staffRequest } from "@/lib/staff-api";

export type Me = { username: string; role: string };

// Returns null until the role has loaded (or if the request fails).
export function useMe() {
  const [me, setMe] = useState<Me | null>(null);

  useEffect(() => {
    let alive = true;
    staffRequest<Me>("/auth/me/")
      .then((data) => {
        if (alive) setMe(data);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  return me;
}
