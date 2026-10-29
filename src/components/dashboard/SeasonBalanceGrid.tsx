"use client";

import { useState } from "react";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { SegTabs } from "@/components/sf/SegTabs";
import type { SeasonGrid } from "@/lib/playbook/seasonGrid";
import { EmptyState } from "./EmptyState";

interface SeasonBalanceGridProps {
  grid: SeasonGrid;
  /** "quarter" / "half" — what one period of owed time is called. */
  periodWord: string;
  /** "Since 3 Aug" when the coach has reset season balance. */
  sinceLabel?: string | null;
}

type Sort = "gap" | "name";

function cellTone(owed: number): string {
  if (owed >= 1) return "bg-warn-soft text-warn-ink font-semibold";
  if (owed <= -1) return "bg-surface-alt text-ink-mute";
  return "text-ink";
}

/**
 * Season balance grid (UX plan §7.9 W8), shared by every sport's stats:
 * players × units, a cell's tint showing a kid owed time there, sortable
 * by biggest gap. One line up top says how even the team is.
 */
export function SeasonBalanceGrid({ grid, periodWord, sinceLabel }: SeasonBalanceGridProps) {
  const [sort, setSort] = useState<Sort>("gap");
  if (grid.rows.length === 0) {
    return (
      <EmptyState
        title="No data yet — will populate once games are played"
        description="Shows how evenly each player's time is spread across the season."
      />
    );
  }
  const rows = [...grid.rows].sort((a, b) =>
    sort === "gap" ? b.biggestGap - a.biggestGap || a.name.localeCompare(b.name) : a.name.localeCompare(b.name),
  );
  const mins = (ms: number) => Math.round(ms / 60000);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-ink" data-testid="season-balance-summary">
          <strong className="tabular-nums">{grid.within}</strong> of{" "}
          <strong className="tabular-nums">{grid.total}</strong> kids within a {periodWord} of even
          {sinceLabel && <span className="text-ink-mute"> · {sinceLabel}</span>}
        </p>
        <div className="w-48">
          <SegmentedControl
            label="Sort"
            options={[
              { id: "gap", label: "Biggest gap" },
              { id: "name", label: "Name" },
            ]}
            value={sort}
            onChange={(v) => setSort(v as Sort)}
          />
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm" aria-label="Season balance">
          <thead>
            <tr className="text-left font-mono text-[10px] uppercase tracking-micro text-ink-mute">
              <th className="py-1.5 pr-2 font-bold">Player</th>
              {grid.units.map((u) => (
                <th key={u.key} className="px-1 py-1.5 text-center font-bold">
                  {u.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-hairline">
            {rows.map((r) => (
              <tr key={r.playerId}>
                <th scope="row" className="max-w-[9rem] truncate py-1.5 pr-2 text-left font-medium text-ink">
                  {r.name}
                </th>
                {r.cells.map((c) => (
                  <td
                    key={c.unit}
                    className={`px-1 py-1.5 text-center tabular-nums ${cellTone(c.owed)}`}
                    title={
                      c.owed >= 1
                        ? `Owed about ${Math.round(c.owed)} ${periodWord}${Math.round(c.owed) === 1 ? "" : "s"}`
                        : undefined
                    }
                  >
                    {mins(c.ms)}
                    {c.owed >= 1 && <span className="sr-only"> (owed)</span>}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-ink-mute">
        Minutes this season. <span className="rounded-xs bg-warn-soft px-1 text-warn-ink">Tinted</span> = owed at
        least a {periodWord} there.
      </p>
    </div>
  );
}

export interface SeasonBalanceSectionProps {
  grid: SeasonGrid;
  periodWord: string;
  /** Shown when the coach has reset season balance. */
  reset?: { since: boolean; sinceLabel: string; wholeHref: string; sinceHref: string };
}

/**
 * Stats › Season balance, as a card every sport's stats page uses
 * (AFL, netball and league), with Whole season / Since reset when the
 * coach has reset season balance (UX plan 4.5).
 */
export function SeasonBalanceSection({ grid, periodWord, reset }: SeasonBalanceSectionProps) {
  return (
    <section
      aria-labelledby="season-balance-title"
      className="overflow-hidden rounded-lg border border-hairline bg-surface shadow-card"
    >
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-hairline px-4 py-3 sm:px-5 sm:py-4">
        <h3 id="season-balance-title" className="text-sm font-semibold text-ink sm:text-base">
          Season balance
        </h3>
        {reset && (
          <SegTabs
            size="sm"
            full={false}
            ariaLabel="Season balance range"
            value={reset.since ? "since" : "whole"}
            options={[
              { id: "whole", label: "Whole season", href: reset.wholeHref },
              { id: "since", label: "Since reset", href: reset.sinceHref },
            ]}
          />
        )}
      </div>
      <div className="p-3 sm:p-5">
        <SeasonBalanceGrid
          grid={grid}
          periodWord={periodWord}
          sinceLabel={reset?.since ? `since ${reset.sinceLabel}` : null}
        />
      </div>
    </section>
  );
}
