// ─── Netball sport registration ──────────────────────────────
// Sources:
//   - Netball Australia NetSetGO + Modified (Sets/Go/11u/12u/13u) rules.
//   - World Netball rules-of-play (position-zone eligibility).
//
// Key differences from AFL:
//   - 7 positions, each restricted to specific court zones ("rules of play").
//   - 3 thirds on court + 2 goal circles (sub-zones). Positions eligible
//     for a third include the goal circle within it.
//   - Goals-only scoring (1 point per goal).
//   - Substitutions ONLY at period breaks (quarter/half) — no rolling subs.
//   - 4 quarters, length varies by age group (NetSetGO uses shorter
//     quarters and more modifications).

import type {
  SportConfig,
  ZoneDef,
  PositionDef,
  ScoreTypeDef,
  AgeGroupConfig,
  ValidationResult,
  ValidationIssue,
} from "@/lib/sports/types";

// ─── Court zones ─────────────────────────────────────────────
// The court is split into thirds lengthwise. The attack-third and
// defence-third each contain a semicircular "goal circle" — a
// sub-zone where only GS/GA (attack) or GK/GD (defence) may enter.
const NETBALL_ZONES: ZoneDef[] = [
  { id: "attack-third", label: "Attack Third", shortLabel: "Atk" },
  { id: "attack-circle", label: "Attack Goal Circle", shortLabel: "A ⓖ" },
  { id: "centre-third", label: "Centre Third", shortLabel: "Ctr" },
  { id: "defence-third", label: "Defence Third", shortLabel: "Def" },
  { id: "defence-circle", label: "Defence Goal Circle", shortLabel: "D ⓖ" },
];

// ─── Positions (with rules-of-play eligibility) ──────────────
// GS: only attack third + attack goal circle.
// GA: attack third (incl. goal circle) + centre third.
// WA: attack third (excl. circle) + centre third.
// C:  all three thirds (excl. both goal circles).
// WD: centre third + defence third (excl. circle).
// GD: defence third (incl. goal circle) + centre third.
// GK: only defence third + defence goal circle.
const NETBALL_POSITIONS: PositionDef[] = [
  {
    id: "gs",
    label: "Goal Shooter",
    shortLabel: "GS",
    allowedZones: ["attack-third", "attack-circle"],
  },
  {
    id: "ga",
    label: "Goal Attack",
    shortLabel: "GA",
    allowedZones: ["attack-third", "attack-circle", "centre-third"],
  },
  {
    id: "wa",
    label: "Wing Attack",
    shortLabel: "WA",
    allowedZones: ["attack-third", "centre-third"],
  },
  {
    id: "c",
    label: "Centre",
    shortLabel: "C",
    allowedZones: ["attack-third", "centre-third", "defence-third"],
  },
  {
    id: "wd",
    label: "Wing Defence",
    shortLabel: "WD",
    allowedZones: ["centre-third", "defence-third"],
  },
  {
    id: "gd",
    label: "Goal Defence",
    shortLabel: "GD",
    allowedZones: ["centre-third", "defence-third", "defence-circle"],
  },
  {
    id: "gk",
    label: "Goal Keeper",
    shortLabel: "GK",
    allowedZones: ["defence-third", "defence-circle"],
  },
];

// ─── Score types ─────────────────────────────────────────────
// Netball is goals-only, 1 point per goal. Only GS and GA can score;
// the score UI still lets coaches attribute a goal to a shooter.
const NETBALL_SCORE_TYPES: ScoreTypeDef[] = [
  { id: "goal", label: "Goal", shortLabel: "+1", points: 1 },
  { id: "opponent_goal", label: "Opponent Goal", shortLabel: "+1", points: 1, opponent: true },
];

// ─── Age groups (NetSetGO + Modified rules) ──────────────────
// NetSetGO: Set (5-7), Go (8-10) — skills-focused, modified or
// training-only format. Modified Netball: 11u, 12u, 13u — full
// 7-a-side but shorter quarters and some rule modifications.
// Open (14+): standard 7-a-side, 15-minute quarters.
const NETBALL_AGE_GROUPS: AgeGroupConfig[] = [
  {
    id: "set",
    label: "Set (5–7)",
    positions: ["gs", "ga", "c", "gd", "gk"],
    zones: ["attack-third", "attack-circle", "centre-third", "defence-third", "defence-circle"],
    defaultOnFieldSize: 5,
    minOnFieldSize: 4,
    maxOnFieldSize: 5,
    maxSquadSize: 14,
    periodCount: 4,
    periodSeconds: 6 * 60,
    subIntervalSeconds: 6 * 60,
    tracksScoreDefault: false,
    notes: "NetSetGO Set: 5-a-side, skill-focused, no scores kept.",
  },
  {
    id: "go",
    label: "Go (8–10)",
    positions: ["gs", "ga", "wa", "c", "wd", "gd", "gk"],
    zones: ["attack-third", "attack-circle", "centre-third", "defence-third", "defence-circle"],
    defaultOnFieldSize: 7,
    minOnFieldSize: 5,
    maxOnFieldSize: 7,
    maxSquadSize: 16,
    periodCount: 4,
    periodSeconds: 8 * 60,
    subIntervalSeconds: 8 * 60,
    tracksScoreDefault: false,
    notes: "NetSetGO Go: 7-a-side, introduction to all 7 positions.",
  },
  {
    id: "11u",
    label: "11 & Under",
    positions: ["gs", "ga", "wa", "c", "wd", "gd", "gk"],
    zones: ["attack-third", "attack-circle", "centre-third", "defence-third", "defence-circle"],
    defaultOnFieldSize: 7,
    minOnFieldSize: 5,
    maxOnFieldSize: 7,
    maxSquadSize: 16,
    periodCount: 4,
    periodSeconds: 8 * 60,
    subIntervalSeconds: 8 * 60,
    tracksScoreDefault: true,
    notes: "Modified netball: 7-a-side, 8-min quarters.",
  },
  {
    id: "12u",
    label: "12 & Under",
    positions: ["gs", "ga", "wa", "c", "wd", "gd", "gk"],
    zones: ["attack-third", "attack-circle", "centre-third", "defence-third", "defence-circle"],
    defaultOnFieldSize: 7,
    minOnFieldSize: 5,
    maxOnFieldSize: 7,
    maxSquadSize: 16,
    periodCount: 4,
    periodSeconds: 10 * 60,
    subIntervalSeconds: 10 * 60,
    tracksScoreDefault: true,
    notes: "Modified netball: 7-a-side, 10-min quarters.",
  },
  {
    id: "13u",
    label: "13 & Under",
    positions: ["gs", "ga", "wa", "c", "wd", "gd", "gk"],
    zones: ["attack-third", "attack-circle", "centre-third", "defence-third", "defence-circle"],
    defaultOnFieldSize: 7,
    minOnFieldSize: 5,
    maxOnFieldSize: 7,
    maxSquadSize: 16,
    periodCount: 4,
    periodSeconds: 12 * 60,
    subIntervalSeconds: 12 * 60,
    tracksScoreDefault: true,
    notes: "Modified netball: 7-a-side, 12-min quarters.",
  },
  {
    id: "open",
    label: "Open (14+)",
    positions: ["gs", "ga", "wa", "c", "wd", "gd", "gk"],
    zones: ["attack-third", "attack-circle", "centre-third", "defence-third", "defence-circle"],
    defaultOnFieldSize: 7,
    minOnFieldSize: 5,
    maxOnFieldSize: 7,
    maxSquadSize: 16,
    periodCount: 4,
    periodSeconds: 15 * 60,
    subIntervalSeconds: 15 * 60,
    tracksScoreDefault: true,
    notes: "Standard netball: 7-a-side, 15-min quarters.",
  },
];

// ─── Lineup shape used by validateLineup ─────────────────────
// This is the Phase-1 generic map shape. The AFL config's
// `validateLineup` (if added later) would read the same shape.
interface GenericLineup {
  positions: Record<string, string[]>;
  bench: string[];
}

function validateNetballLineup(
  lineup: unknown,
  ageGroup: AgeGroupConfig,
): ValidationResult {
  const issues: ValidationIssue[] = [];
  const l = lineup as GenericLineup;

  if (!l || typeof l !== "object" || !l.positions) {
    return {
      ok: false,
      issues: [{ kind: "error", message: "Invalid lineup shape." }],
    };
  }

  // Each active position in this age group must have exactly one player.
  for (const pid of ageGroup.positions) {
    const occupants = l.positions[pid] ?? [];
    if (occupants.length === 0) {
      issues.push({
        kind: "error",
        message: `${positionLabel(pid)} is empty.`,
        positionId: pid,
      });
    } else if (occupants.length > 1) {
      issues.push({
        kind: "error",
        message: `${positionLabel(pid)} has more than one player.`,
        positionId: pid,
      });
    }
  }

  // No position outside the age group's set.
  for (const pid of Object.keys(l.positions)) {
    if (!ageGroup.positions.includes(pid) && (l.positions[pid]?.length ?? 0) > 0) {
      issues.push({
        kind: "error",
        message: `Position ${pid} is not used at this age group.`,
        positionId: pid,
      });
    }
  }

  // No player double-booked across positions/bench.
  const seen = new Map<string, string>();
  const mark = (pid: string, slot: string) => {
    if (!pid) return;
    const existing = seen.get(pid);
    if (existing && existing !== slot) {
      issues.push({
        kind: "error",
        message: `Player is in both ${existing} and ${slot}.`,
        playerId: pid,
      });
    }
    seen.set(pid, slot);
  };
  for (const pid of ageGroup.positions) {
    for (const playerId of l.positions[pid] ?? []) {
      mark(playerId, positionLabel(pid));
    }
  }
  for (const playerId of l.bench ?? []) {
    mark(playerId, "bench");
  }

  return { ok: issues.length === 0, issues };
}

function positionLabel(id: string): string {
  return NETBALL_POSITIONS.find((p) => p.id === id)?.shortLabel ?? id;
}

// Utility: returns true if placing `positionId` into `zoneId` respects
// netball rules of play. Used by the lineup-picker UI to grey out
// ineligible combinations.
export function isPositionAllowedInZone(positionId: string, zoneId: string): boolean {
  const pos = NETBALL_POSITIONS.find((p) => p.id === positionId);
  if (!pos?.allowedZones) return true;
  return pos.allowedZones.includes(zoneId);
}

// Utility: the primary (non-goal-circle) third for a position. Used by
// the Court component to decide where to render a position's token.
export function primaryThirdFor(positionId: string): string | null {
  switch (positionId) {
    case "gs":
      return "attack-third";
    case "ga":
      return "attack-third";
    case "wa":
      return "attack-third";
    case "c":
      return "centre-third";
    case "wd":
      return "defence-third";
    case "gd":
      return "defence-third";
    case "gk":
      return "defence-third";
    default:
      return null;
  }
}

export const netballSport: SportConfig = {
  id: "netball",
  name: "Netball",
  shortName: "Netball",
  brand: {
    id: "netball",
    host: "sirennetball.com.au",
    name: "Siren Netball",
    tagline: "Junior netball coaching — fair rotations across GS through GK, quarter-break subs, live score in your pocket.",
    defaultSport: "netball",
    palette: "netball",
  },
  zones: NETBALL_ZONES,
  allPositions: NETBALL_POSITIONS,
  scoreTypes: NETBALL_SCORE_TYPES,
  ageGroups: NETBALL_AGE_GROUPS,
  substitutionRule: "period-break-only",
  periodLabel: "quarter",
  periodLabelPlural: "quarters",
  fairnessModel: "position-count-per-game",
  validateLineup: validateNetballLineup,
};
