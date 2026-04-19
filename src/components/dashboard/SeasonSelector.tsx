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
    <div className="flex items-center gap-3">
      <label htmlFor="season-select" className="text-sm font-medium text-gray-700">
        Season
      </label>
      <select
        id="season-select"
        value={selectedYear}
        onChange={handleChange}
        className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm shadow-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
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
