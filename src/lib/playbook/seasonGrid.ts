// Stats › Season balance (UX plan §7.5, chunk 4.4): players × units,
// each cell the player's season time there and how far from their
// even share, plus one plain line for the team ("9 of 12 kids within a
// quarter of even"). Replaces "Minutes equity".

import type { Sport } from "@/lib/types";
import type { BalanceUnit } from "@/lib/playbook/types";
import { periodsOwed, playersWithinAPeriod } from "@/lib/playbook/seasonBalance";
import type { UnitTime } from "@/lib/playbook/seasonTime";
import { isBasketball, isRugby, isSoccer, isTouch, noSportBranch } from "@/lib/sports/registry";
import { soccerFamilyRules } from "@/lib/sports/soccer/family";

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
  /** League named positions or netball bibs: the team's, one column each. */
  positions: { key: string; label: string }[] = [],
): { unit: BalanceUnit; columns: { key: string; label: string }[] } {
  if (sport === "netball") {
    if (unit === "bib") {
      // The age group's own bibs (Set plays five), from How we play.
      const bibs = positions.length > 0 ? positions : ["gs", "ga", "wa", "c", "wd", "gd", "gk"].map((k) => ({ key: k, label: k.toUpperCase() }));
      return { unit: "bib", columns: bibs.map((p) => ({ key: p.key, label: p.label })) };
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
  if (isRugby(sport)) {
    if (unit === "position" && positions.length > 0) {
      return { unit: "position", columns: positions.map((p) => ({ key: p.key, label: p.label })) };
    }
    return {
      unit: "line",
      columns: [
        { key: "forwards", label: "Fwds" },
        { key: "backs", label: "Backs" },
      ],
    };
  }
  if (sport === "afl") {
    return {
      unit: "line",
      columns: [
        { key: "fwd", label: "Fwd" },
        { key: "mid", label: "Cen" },
        { key: "back", label: "Back" },
      ],
    };
  }
  if (isSoccer(sport)) {
    // The lines season balance evens out, in the sport's own words
    // ("ATT" reads "Att"; futsal's "FRONT" reads "Front"). Time in goal
    // isn't one: the keeper strategy shares goal (turns, or the named
    // keepers), so it shows in the game report rather than as a debt here.
    const words = soccerFamilyRules(sport).lineLabels;
    const column = (key: "att" | "mid" | "def") => {
      const short = words[key].short;
      return { key, label: short.charAt(0) + short.slice(1).toLowerCase() };
    };
    return { unit: "line", columns: [column("att"), column("mid"), column("def")] };
  }
  if (isBasketball(sport)) {
    // The position strategies even out 1 to 5; the line strategies
    // guards and forwards. Equal minutes has no unit (balanceUnit null):
    // the grid shows guards and forwards, which it never fills.
    if (unit === "position") {
      return {
        unit: "position",
        columns: [
          { key: "pg", label: "PG" },
          { key: "sg", label: "SG" },
          { key: "sf", label: "SF" },
          { key: "pf", label: "PF" },
          { key: "c", label: "C" },
        ],
      };
    }
    return {
      unit: "line",
      columns: [
        { key: "guard", label: "Guard" },
        { key: "forward", label: "Fwd" },
      ],
    };
  }
  if (isTouch(sport)) {
    // The lanes season balance evens out, centre out. Minutes only has
    // no unit (balanceUnit null): the grid shows the lanes, never filled.
    return {
      unit: "line",
      columns: [
        { key: "middle", label: "Mid" },
        { key: "link", label: "Link" },
        { key: "wing", label: "Wing" },
      ],
    };
  }
  return noSportBranch(sport, "gridUnits");
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
  // Only kids who've played this season (or since the reset) count:
  // anywhere, keeper time included, so a kid who only kept goal shows,
  // with nothing yet in each line (Stagehand round 7, 28 Oct 2026: "12
  // of 12" in a squad of 13, the keeper missing).
  const playing = players.filter((p) => Object.values(time[p.id] ?? {}).some((ms) => ms > 0));
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

/**
 * The kids owed at least a period somewhere this season, most owed first:
 * the one answer a coach opens Stats for (design review, Oct 2026).
 */
export function owedPlayers(grid: SeasonGrid): string[] {
  return grid.rows
    .filter((r) => r.biggestGap >= 1)
    .sort((a, b) => b.biggestGap - a.biggestGap || a.name.localeCompare(b.name))
    .map((r) => r.name);
}
