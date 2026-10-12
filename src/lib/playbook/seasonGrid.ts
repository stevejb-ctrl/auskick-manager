// Stats › Season balance (UX plan §7.5, chunk 4.4): players × units,
// each cell the player's season time there and how far from their
// even share, plus one plain line for the team ("9 of 12 kids within a
// quarter of even"). Replaces "Minutes equity".

import type { Sport } from "@/lib/types";
import type { BalanceUnit } from "@/lib/playbook/types";
import { periodsOwed, playersWithinAPeriod } from "@/lib/playbook/seasonBalance";
import type { UnitTime } from "@/lib/playbook/seasonTime";
import { leaguePositionGroup } from "@/lib/sports/rugby_league/playbook";

export interface SeasonGridCell {
  unit: string;
  ms: number;
  /** Periods owed (+) or over (−), capped at ±2. */
  owed: number;
}

export interface SeasonGridRow {
  playerId: string;
  name: string;
  totalMs: number;
  cells: SeasonGridCell[];
  /** Largest periods owed in any unit (0 when even). */
  biggestGap: number;
}

export interface SeasonGrid {
  units: { key: string; label: string }[];
  rows: SeasonGridRow[];
  within: number;
  total: number;
}

/** What the grid's columns are for a sport and balance unit. */
export function gridUnits(
  sport: Sport,
  unit: BalanceUnit | null,
  /** League named positions: the team's catalogue, one column each. */
  positions: { key: string; label: string }[] = [],
): { unit: BalanceUnit; columns: { key: string; label: string }[] } {
  if (sport === "netball") {
    if (unit === "bib") {
      return {
        unit: "bib",
        columns: ["gs", "ga", "wa", "c", "wd", "gd", "gk"].map((k) => ({ key: k, label: k.toUpperCase() })),
      };
    }
    return {
      unit: "third",
      columns: [
        { key: "attack-third", label: "Att" },
        { key: "centre-third", label: "Cen" },
        { key: "defence-third", label: "Def" },
      ],
    };
  }
  if (sport === "rugby_league") {
    if (unit === "position" && positions.length > 0) {
      // One column per role (two props are one "PR" column).
      const columns = new Map<string, string>();
      for (const p of positions) {
        const group = leaguePositionGroup(p.key);
        if (!columns.has(group)) columns.set(group, p.label);
      }
      return { unit: "position", columns: Array.from(columns, ([key, label]) => ({ key, label })) };
    }
    return {
      unit: "line",
      columns: [
        { key: "forwards", label: "Fwds" },
        { key: "backs", label: "Backs" },
      ],
    };
  }
  return {
    unit: "line",
    columns: [
      { key: "fwd", label: "Fwd" },
      { key: "mid", label: "Cen" },
      { key: "back", label: "Back" },
    ],
  };
}

export function seasonBalanceGrid({
  time,
  players,
  columns,
  periodMs,
}: {
  time: UnitTime;
  players: { id: string; name: string }[];
  columns: { key: string; label: string }[];
  periodMs: number;
}): SeasonGrid {
  const units = columns.map((c) => c.key);
  // Only kids who've played this season (or since the reset) count.
  const playing = players.filter((p) => units.some((u) => (time[p.id]?.[u] ?? 0) > 0));
  const rows = playing.map((p) => {
    const owed = periodsOwed({ byUnit: time[p.id], units, periodMs });
    const cells = units.map((u) => ({ unit: u, ms: time[p.id]?.[u] ?? 0, owed: owed[u] ?? 0 }));
    return {
      playerId: p.id,
      name: p.name,
      totalMs: cells.reduce((s, c) => s + c.ms, 0),
      cells,
      biggestGap: Math.max(0, ...cells.map((c) => c.owed)),
    };
  });
  const { within, total } = playersWithinAPeriod(
    time,
    playing.map((p) => p.id),
    units,
    periodMs,
  );
  return { units: columns, rows, within, total };
}
