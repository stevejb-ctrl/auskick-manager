"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { SegTabs } from "@/components/sf";

export type GamesFilterValue = "all" | "upcoming" | "final";

/**
 * Pill segmented filter for the Games list. Reads/writes a `filter`
 * search param so the list state survives reload and is shareable.
 *
 * Pure URL-state — no client-side data refetch needed; the page's
 * server component re-renders with the new searchParams.
 */
export function GamesFilter() {
  const router = useRouter();
  const params = useSearchParams();
  const value = (params.get("filter") as GamesFilterValue | null) ?? "all";

  const onChange = (next: string) => {
    const sp = new URLSearchParams(params.toString());
    if (next === "all") sp.delete("filter");
    else sp.set("filter", next);
    const qs = sp.toString();
    router.replace(qs ? `?${qs}` : "?", { scroll: false });
  };

  return (
    <SegTabs
      value={value}
      onChange={onChange}
      options={[
        { id: "all", label: "All" },
        { id: "upcoming", label: "Upcoming" },
        { id: "final", label: "Final" },
      ]}
      size="sm"
      full={false}
      ariaLabel="Filter games"
    />
  );
}
