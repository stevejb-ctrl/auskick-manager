// Netball — How we play (UX plan §7.3).
//
// The bibs are fixed by the rules of play and can't be renamed. What a
// coach chooses is HOW kids rotate through them: by thirds, position by
// position, a fixed position cycle, partners, or set positions. No
// national rule forces rotation; associations can add their own.

import { getAgeGroupConfig, netballSport, primaryThirdFor } from "@/lib/sports";
import type {
  AgePolicy,
  EffectivePolicy,
  LineDef,
  PositionDef,
  PositionModel,
  SportPlaybook,
  StrategyDef,
} from "@/lib/playbook/types";

export const NETBALL_LINES: LineDef[] = [
  { id: "attack-third", label: "Attack", colorToken: "zone-f" },
  { id: "centre-third", label: "Centre", colorToken: "zone-c" },
  { id: "defence-third", label: "Defence", colorToken: "zone-b" },
];

// Court layout, attacking up: the same zigzag the live court draws.
const COURT_XY: Record<string, [number, number]> = {
  gs: [0.3, 0.1],
  ga: [0.7, 0.22],
  wa: [0.3, 0.36],
  c: [0.5, 0.5],
  wd: [0.7, 0.64],
  gd: [0.3, 0.78],
  gk: [0.7, 0.9],
};

export function netballBibs(ageGroup: string): PositionDef[] {
  const cfg = getAgeGroupConfig("netball", ageGroup);
  return cfg.positions.map((id) => {
    const pos = netballSport.allPositions.find((p) => p.id === id);
    const [x, y] = COURT_XY[id] ?? [0.5, 0.5];
    return {
      key: id,
      label: pos?.shortLabel ?? id.toUpperCase(),
      name: pos?.label ?? id,
      line: primaryThirdFor(id) ?? "centre-third",
      x,
      y,
    };
  });
}

const STRATEGIES: StrategyDef[] = [
  {
    id: "by-thirds",
    label: "By thirds",
    blurb: "A quarter in each third across the game; the bib within a third is chosen for fairness.",
    fit: "Go and 11U",
    usesPositions: false,
    balanceUnit: "third",
    balanceByDefault: true,
  },
  {
    id: "position-by-position",
    label: "Position by position",
    blurb: "Every bib filled on its own, aiming for the most different bibs per kid.",
    fit: "Coaches who want every kid to wear all 7 bibs",
    usesPositions: false,
    balanceUnit: "bib",
    balanceByDefault: true,
  },
  {
    id: "position-cycle",
    label: "Position cycle",
    blurb: "Everyone steps one bib along each quarter (GS → GA → WA → C → WD → GD → GK → bench).",
    fit: "Set and Go — easy for parents to follow",
    usesPositions: false,
    balanceUnit: "bib",
    balanceByDefault: true,
  },
  {
    id: "partners",
    label: "Partners",
    blurb: "Kids keep their third and swap with their partner each quarter (GS↔GA, GD↔GK).",
    fit: "12U–13U, starting to specialise",
    usesPositions: false,
    balanceUnit: "bib",
    balanceByDefault: true,
  },
  {
    id: "set-positions",
    label: "Set positions",
    blurb: "Home bib plus backups; the bench rotates like-for-like.",
    fit: "13U and Open",
    usesPositions: true,
    balanceUnit: "bib",
    balanceByDefault: false,
  },
];

export const netballPlaybook: SportPlaybook = {
  sport: "netball",

  agePolicy(ageGroup: string): AgePolicy {
    const cfg = getAgeGroupConfig("netball", ageGroup);
    return {
      zonesEnforced: { default: false, overridable: false },
      minGameTimePct: { default: 50, overridable: true, band: [0, 100], locked: false },
      tracksScoreDefault: cfg.tracksScoreDefault,
    };
  },

  positionModel(policy: EffectivePolicy): PositionModel {
    return {
      kind: "fixed",
      lines: NETBALL_LINES,
      defaults: netballBibs(policy.ageGroup),
      canRename: false,
      canAddRemove: false,
    };
  },

  strategies(): StrategyDef[] {
    return STRATEGIES;
  },

  recommendedStrategy(policy: EffectivePolicy): string {
    switch (policy.ageGroup) {
      case "set":
        return "position-cycle";
      case "12u":
        return "partners";
      case "13u":
      case "open":
        return "set-positions";
      default:
        return "by-thirds";
    }
  },

  fallbackStrategy(): string {
    // Today's engine: rotate through thirds, bib chosen for fairness.
    return "by-thirds";
  },
};
