// AFL — How we play (UX plan §7.2–7.3).
//
// Zoned ages (U8–U10 by default) keep today's zone rotation and never
// see positions. From U11 the coach can name positions, pick a strategy
// and set roles. Every age carries the AFL rotation rule: each player
// plays at least 50–75 % of the game, the league choosing the figure.

import { zoneCapsFor } from "@/lib/fairness";
import { getAgeGroupConfig } from "@/lib/sports";
import type {
  AgePolicy,
  EffectivePolicy,
  LineDef,
  PositionDef,
  PositionModel,
  SportPlaybook,
  StrategyDef,
} from "@/lib/playbook/types";

const AFL_RULES = "AFL Junior Rules (May 2024)";
/** Ages the AFL junior rules list zone splits for. */
const ZONED_AGES = new Set(["U8", "U9", "U10"]);

export const AFL_LINES: LineDef[] = [
  { id: "forward", label: "Forward", colorToken: "zone-f" },
  { id: "centre", label: "Centre", colorToken: "zone-c" },
  { id: "back", label: "Back", colorToken: "zone-b" },
];

const NAMES: Record<string, string> = {
  FB: "Full back",
  BP: "Back pocket",
  CHB: "Centre half-back",
  HBF: "Half-back flank",
  W: "Wing",
  C: "Centre",
  R: "Ruck",
  RR: "Ruck rover",
  ROV: "Rover",
  HFF: "Half-forward flank",
  CHF: "Centre half-forward",
  FP: "Forward pocket",
  FF: "Full forward",
};

type Rows = string[][];
/** Formation rows per line, top to bottom (attacking up the page). */
type Formation = Record<"forward" | "centre" | "back", Rows>;

// The default formations Steve confirmed (UX plan §7.3).
const FORMATIONS: Record<number, Formation> = {
  18: {
    forward: [["FP", "FF", "FP"], ["HFF", "CHF", "HFF"]],
    centre: [["W", "C", "W"], ["R", "RR", "ROV"]],
    back: [["HBF", "CHB", "HBF"], ["BP", "FB", "BP"]],
  },
  16: {
    forward: [["FP", "FF", "FP"], ["HFF", "CHF", "HFF"]],
    centre: [["C", "R"], ["RR", "ROV"]],
    back: [["HBF", "CHB", "HBF"], ["BP", "FB", "BP"]],
  },
  15: {
    forward: [["FP", "FF", "FP"], ["HFF", "CHF"]],
    centre: [["W", "C"], ["R", "RR", "ROV"]],
    back: [["CHB", "HBF"], ["BP", "FB", "BP"]],
  },
  12: {
    forward: [["FP", "FF", "FP"], ["CHF"]],
    centre: [["W", "C"], ["R", "RR"]],
    back: [["CHB"], ["BP", "FB", "BP"]],
  },
};

// Other on-field sizes take the most important spots first.
const PRIORITY: Record<keyof Formation, string[]> = {
  forward: ["FF", "CHF", "FP", "FP", "HFF", "HFF"],
  centre: ["C", "R", "RR", "W", "W", "ROV"],
  back: ["FB", "CHB", "BP", "BP", "HBF", "HBF"],
};

function generatedFormation(onFieldSize: number): Formation {
  const caps = zoneCapsFor(onFieldSize, "zones3");
  const rowsOf = (labels: string[]): Rows => {
    const rows: Rows = [];
    for (let i = 0; i < labels.length; i += 3) rows.push(labels.slice(i, i + 3));
    return rows;
  };
  return {
    forward: rowsOf(PRIORITY.forward.slice(0, caps.fwd)),
    centre: rowsOf(PRIORITY.centre.slice(0, caps.mid)),
    back: rowsOf(PRIORITY.back.slice(0, caps.back)),
  };
}

const LINE_BANDS: Record<keyof Formation, [number, number]> = {
  forward: [0.08, 0.3],
  centre: [0.38, 0.62],
  back: [0.7, 0.92],
};

/** Default named positions for an on-field size, with formation coords. */
export function defaultAflPositions(onFieldSize: number): PositionDef[] {
  const formation = FORMATIONS[onFieldSize] ?? generatedFormation(onFieldSize);
  const seen: Record<string, number> = {};
  const out: PositionDef[] = [];
  for (const line of ["forward", "centre", "back"] as const) {
    const rows = formation[line];
    const [top, bottom] = LINE_BANDS[line];
    rows.forEach((row, r) => {
      const y = rows.length === 1 ? (top + bottom) / 2 : top + ((bottom - top) * r) / (rows.length - 1);
      row.forEach((label, c) => {
        seen[label] = (seen[label] ?? 0) + 1;
        const dupes = Object.values(formation).flat(2).filter((l) => l === label).length;
        out.push({
          key: dupes > 1 ? `${label.toLowerCase()}${seen[label]}` : label.toLowerCase(),
          label,
          name: NAMES[label] ?? label,
          line,
          x: (c + 0.5) / row.length,
          y,
        });
      });
    });
  }
  return out;
}

const ZONED_STRATEGIES: StrategyDef[] = [
  {
    id: "suggested",
    label: "Suggested",
    blurb: "Fair time for everyone; every kid plays each zone through the game.",
    usesPositions: false,
    balanceUnit: "zone",
    balanceByDefault: true,
  },
  {
    id: "rotate",
    label: "Rotate lines",
    blurb: "Each break, everyone moves up a line — back to centre to forward.",
    usesPositions: false,
    balanceUnit: "zone",
    balanceByDefault: true,
  },
  {
    id: "keep",
    label: "Keep last quarter",
    blurb: "Same lineup as the quarter before unless you change it.",
    usesPositions: false,
    balanceUnit: "zone",
    balanceByDefault: true,
  },
  {
    id: "manual",
    label: "Set manually",
    blurb: "You place every kid each break.",
    usesPositions: false,
    balanceUnit: "zone",
    balanceByDefault: false,
  },
];

const OPEN_STRATEGIES: StrategyDef[] = [
  {
    id: "free",
    label: "Free rotation",
    blurb: "Equal time, every line across the game, no positions shown.",
    fit: "U11 coaches not ready for positions",
    usesPositions: false,
    balanceUnit: "line",
    balanceByDefault: true,
  },
  {
    id: "preferred-lines",
    label: "Preferred lines",
    blurb: "Kids lean to one or two lines but still get a stint elsewhere.",
    fit: "U11–U12",
    usesPositions: false,
    balanceUnit: "line",
    balanceByDefault: true,
  },
  {
    id: "set-positions",
    label: "Set positions",
    blurb: "Named positions with home and backup spots; like-for-like bench.",
    fit: "U13 and up",
    usesPositions: true,
    balanceUnit: "position",
    balanceByDefault: false,
  },
];

export const aflPlaybook: SportPlaybook = {
  sport: "afl",

  agePolicy(ageGroup: string): AgePolicy {
    const cfg = getAgeGroupConfig("afl", ageGroup);
    return {
      zonesEnforced: { default: ZONED_AGES.has(ageGroup), overridable: true, source: AFL_RULES },
      minGameTimePct: {
        default: 50,
        overridable: true,
        band: [50, 75],
        locked: true,
        source: AFL_RULES,
      },
      tracksScoreDefault: cfg.tracksScoreDefault,
    };
  },

  positionModel(policy: EffectivePolicy, onFieldSize: number): PositionModel {
    if (policy.zonesEnforced) {
      return { kind: "none", lines: AFL_LINES, defaults: [], canRename: false, canAddRemove: false };
    }
    return {
      kind: "custom",
      lines: AFL_LINES,
      defaults: defaultAflPositions(onFieldSize),
      canRename: true,
      canAddRemove: true,
    };
  },

  strategies(policy: EffectivePolicy): StrategyDef[] {
    return policy.zonesEnforced ? ZONED_STRATEGIES : OPEN_STRATEGIES;
  },

  recommendedStrategy(policy: EffectivePolicy): string {
    if (policy.zonesEnforced) return "suggested";
    if (ZONED_AGES.has(policy.ageGroup)) return "free"; // league plays U8–U10 open
    if (policy.ageGroup === "U11" || policy.ageGroup === "U12") return "preferred-lines";
    return "set-positions";
  },

  fallbackStrategy(policy: EffectivePolicy): string {
    // Today's engine: fair rotation through every zone, no positions.
    return policy.zonesEnforced ? "suggested" : "free";
  },
};
