// Rugby league — How we play (UX plan §7.3).
//
// NRL Modified Games: Mini Footy (U6–U9) is forwards and backs only;
// Mod League (U10–U12) can add standard named positions from a fixed
// catalogue (no renaming). The policy pieces that matter are the First
// Receiver / Dummy Half vests and §6 unbroken periods, both from the
// age config. Vests are duties, not positions. The engine's How we
// play is shared with union (rugby/playbook.ts); these are league's
// own laws and positions.

import type { PositionDef, StrategyDef } from "@/lib/playbook/types";
import { sidedPositions } from "@/lib/playbook/sides";
import { RUGBY_LINES, rugbyPlaybook } from "@/lib/sports/rugby/playbook";

const NRL_LAWS = "NRL Junior League Laws";
// Named positions: Mod League and the international-laws grades.
const NAMED_POSITION_AGES = new Set(["U10", "U11", "U12", "U13", "U14", "U15", "U16", "U17"]);

export const LEAGUE_LINES = RUGBY_LINES;

const NAMES: Record<string, string> = {
  PR: "Prop",
  HK: "Hooker",
  "2R": "Second row",
  LK: "Lock",
  FB: "Fullback",
  WG: "Wing",
  CE: "Centre",
  "5/8": "Five-eighth",
  HB: "Halfback",
};
// Filled in this order as the on-field size grows (13 = a full side).
const FORWARD_ORDER = ["PR", "HK", "PR", "2R", "2R", "LK"];
const BACK_ORDER = ["FB", "HB", "5/8", "CE", "CE", "WG", "WG"];

/** Catalogue positions for an on-field size and forward count. */
export function leagueCatalogue(onFieldSize: number, forwardCount: number): PositionDef[] {
  const forwards = FORWARD_ORDER.slice(0, Math.min(forwardCount, FORWARD_ORDER.length));
  const backs = BACK_ORDER.slice(0, Math.max(0, onFieldSize - forwards.length));
  const seen: Record<string, number> = {};
  const keyOf = (label: string, list: string[]) => {
    seen[label] = (seen[label] ?? 0) + 1;
    const base = label === "5/8" ? "fe" : label.toLowerCase();
    return list.filter((l) => l === label).length > 1 ? `${base}${seen[label]}` : base;
  };
  const place = (labels: string[], line: string, top: number, bottom: number): PositionDef[] => {
    const rows: string[][] = [];
    for (let i = 0; i < labels.length; i += 3) rows.push(labels.slice(i, i + 3));
    return rows.flatMap((row, r) =>
      row.map((label, c) => ({
        key: keyOf(label, labels),
        label,
        name: NAMES[label] ?? label,
        line,
        x: (c + 0.5) / row.length,
        y: rows.length === 1 ? (top + bottom) / 2 : top + ((bottom - top) * r) / (rows.length - 1),
      })),
    );
  };
  // Every position its own name: PR → LPR / RPR, as AFL's pockets.
  return sidedPositions([...place(forwards, "forwards", 0.12, 0.38), ...place(backs, "backs", 0.58, 0.9)]);
}

const NAMED_POSITIONS: StrategyDef = {
  id: "named-positions",
  label: "Named positions",
  blurb: "Kids get home positions from the standard list (prop, hooker, halfback…).",
  fit: "Mod League (U10–U12) and up",
  usesPositions: true,
  balanceUnit: "position",
  balanceByDefault: true,
};

export const leaguePlaybook = rugbyPlaybook("rugby_league", {
  lawSource: NRL_LAWS,
  namedPositionAges: NAMED_POSITION_AGES,
  catalogue: leagueCatalogue,
  namedPositions: NAMED_POSITIONS,
});
