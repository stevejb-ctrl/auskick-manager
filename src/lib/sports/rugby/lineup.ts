// ─── Rugby lineup validation ─────────────────────────────────
// One validator for every rugby sport (league, union): the kids on the
// field (forwards + backs) land inside the age group's own legal
// window, and nobody is in two places. The forward / back split is the
// coach's call, so it isn't checked.

import type { AgeGroupConfig, ValidationIssue, ValidationResult } from "@/lib/sports/types";
// `{ forwards, backs, bench }`: `LeagueLineup` in `@/lib/types`, the
// shape the server actions and the replay share.
import type { LeagueLineup } from "@/lib/types";

export function validateRugbyLineup(
  lineup: unknown,
  ageGroup: AgeGroupConfig,
): ValidationResult {
  const issues: ValidationIssue[] = [];
  const l = lineup as LeagueLineup;

  if (
    !l ||
    typeof l !== "object" ||
    !Array.isArray(l.forwards) ||
    !Array.isArray(l.backs) ||
    !Array.isArray(l.bench)
  ) {
    return {
      ok: false,
      issues: [{ kind: "error", message: "Invalid lineup shape." }],
    };
  }

  // On-field count = forwards + backs. Coach can ignore the
  // position split (everyone in one bucket), but the totals still
  // have to land inside the age-group's legal window.
  const onFieldCount = l.forwards.length + l.backs.length;
  if (onFieldCount > ageGroup.maxOnFieldSize) {
    issues.push({
      kind: "error",
      message: `Too many players on field (${onFieldCount}); max is ${ageGroup.maxOnFieldSize}.`,
      positionId: "player",
    });
  } else if (onFieldCount < ageGroup.minOnFieldSize) {
    issues.push({
      kind: "warn",
      message: `Below the recommended minimum (${ageGroup.minOnFieldSize}); local-league discretion to proceed.`,
      positionId: "player",
    });
  }

  // No player double-booked across forwards / backs / bench (or
  // repeated within a single pool).
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
    } else if (existing === slot) {
      issues.push({
        kind: "error",
        message: `Player listed twice in ${slot}.`,
        playerId: pid,
      });
    }
    seen.set(pid, slot);
  };
  for (const playerId of l.forwards) mark(playerId, "forwards");
  for (const playerId of l.backs) mark(playerId, "backs");
  for (const playerId of l.bench) mark(playerId, "bench");

  return { ok: issues.filter((i) => i.kind === "error").length === 0, issues };
}

