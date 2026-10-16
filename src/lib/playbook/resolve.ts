// Effective policy = the age group's policy + the team's overrides, only
// where the policy allows it and clamped to the league band (UX plan §7.6).

import type { Sport } from "@/lib/types";
import type { AgePolicy, EffectivePolicy, PolicyOverrides } from "@/lib/playbook/types";

export function resolvePolicy(
  sport: Sport,
  ageGroup: string,
  policy: AgePolicy,
  overrides: PolicyOverrides = {},
): EffectivePolicy {
  const overridden: (keyof PolicyOverrides)[] = [];

  let zonesEnforced = policy.zonesEnforced.default;
  if (policy.zonesEnforced.overridable && overrides.zonesEnforced !== undefined) {
    zonesEnforced = overrides.zonesEnforced;
    if (zonesEnforced !== policy.zonesEnforced.default) overridden.push("zonesEnforced");
  }

  let minGameTimePct = policy.minGameTimePct.default;
  if (policy.minGameTimePct.overridable && overrides.minGameTimePct !== undefined) {
    const [lo, hi] = policy.minGameTimePct.band;
    minGameTimePct = Math.min(hi, Math.max(lo, Math.round(overrides.minGameTimePct)));
    if (minGameTimePct !== policy.minGameTimePct.default) overridden.push("minGameTimePct");
  }

  let minUnbrokenPeriods = policy.minUnbrokenPeriods?.default ?? 0;
  if (policy.minUnbrokenPeriods?.overridable && overrides.minUnbrokenPeriods !== undefined) {
    minUnbrokenPeriods = Math.max(0, Math.round(overrides.minUnbrokenPeriods));
    if (minUnbrokenPeriods !== policy.minUnbrokenPeriods.default) {
      overridden.push("minUnbrokenPeriods");
    }
  }

  return {
    sport,
    ageGroup,
    zonesEnforced,
    minGameTimePct,
    minUnbrokenPeriods,
    vests: policy.vests ?? { fr: false, dh: false },
    tracksScoreDefault: policy.tracksScoreDefault,
    overridden,
  };
}
