"use client";

import { useRouter, useSearchParams } from "next/navigation";
import type { Season } from "@/lib/dashboard/types";

interface SeasonSelectorProps {
  seasons: Season[];
  selectedYear: number;
}

export function SeasonSelector({ seasons, selectedYear }: SeasonSelectorProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  function handleChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("season", e.target.value);
    router.push(`?${params.toString()}`);
  }

  return (
    <div className="flex items-center gap-2">
      <label
        htmlFor="season-select"
        className="text-[11px] font-semibold uppercase tracking-micro text-ink-mute"
      >
        Season
      </label>
      <select
        id="season-select"
        value={selectedYear}
        onChange={handleChange}
        className="rounded-md border border-hairline bg-surface px-2 py-1 text-sm font-medium text-ink shadow-card focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
      >
        {seasons.map((s) => (
          <option key={s.year} value={s.year}>
            {s.year} ({s.gameCount} {s.gameCount === 1 ? "game" : "games"})
          </option>
        ))}
      </select>
    </div>
  );
}
