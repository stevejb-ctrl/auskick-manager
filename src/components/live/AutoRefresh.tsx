"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/** Re-fetches the current server page every `intervalMs` while visible. */
export function AutoRefresh({ intervalMs }: { intervalMs: number }) {
  const router = useRouter();
  useEffect(() => {
    const id = setInterval(() => {
      if (document.visibilityState === "visible") router.refresh();
    }, intervalMs);
    return () => clearInterval(id);
  }, [router, intervalMs]);
  return null;
}
