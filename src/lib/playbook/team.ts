// A team's How we play, resolved: the stored row (or none) on top of the
// sport's model and the age group's policy. Pure, so the settings page,
// the wizard, the engines and the kickoff snapshot all agree.

import { effectivePolicy, effectiveStrategy, getSportPlaybook } from "@/lib/playbook";
import { aflPositionName, layoutAflPositions } from "@/lib/sports/afl/playbook";
import type { Sport } from "@/lib/types";
import type {
  EffectivePolicy,
  PlaybookSnapshot,
  PolicyOverrides,
  PositionDef,
  PositionModel,
  SeasonBalanceSetting,
  StrategyDef,
  TeamPlaybookRow,
  TeamPositionRow,
} from "@/lib/playbook/types";

export interface ResolvedPlaybook {
  sport: Sport;
  policy: EffectivePolicy;
  overrides: PolicyOverrides;
  strategies: StrategyDef[];
  strategy: StrategyDef;
  /** The age group's suggested strategy (★ in the picker). */
  recommendedId: string;
  /** The coach's saved strategy, even if the policy no longer offers it. */
  savedStrategy: string | null;
  seasonBalance: SeasonBalanceSetting;
  seasonBalanceSaved: SeasonBalanceSetting | null;
  seasonBalanceSince: string | null;
  positionModel: PositionModel;
  /** Positions in force: the team's own (AFL open ages) or the defaults. */
  positions: PositionDef[];
  /** True when the team has saved its own named positions. */
  customPositions: boolean;
}

export interface ResolveInput {
  sport: Sport;
  ageGroup: string;
  onFieldSize: number;
  row: Pick<
    TeamPlaybookRow,
    "strategy" | "policy_overrides" | "season_balance" | "season_balance_since"
  > | null;
  positions?: Pick<TeamPositionRow, "id" | "label" | "name" | "line" | "sort" | "archived_at">[];
}

/** Season balance when the coach hasn't chosen: on for rotating strategies. */
export function defaultSeasonBalance(strategy: StrategyDef): SeasonBalanceSetting {
  return strategy.balanceUnit && strategy.balanceByDefault ? "balanced" : "off";
}

export function resolveTeamPlaybook({
  sport,
  ageGroup,
  onFieldSize,
  row,
  positions = [],
}: ResolveInput): ResolvedPlaybook {
  const playbook = getSportPlaybook(sport);
  const overrides = (row?.policy_overrides ?? {}) as PolicyOverrides;
  const policy = effectivePolicy(sport, ageGroup, overrides);
  const strategies = playbook.strategies(policy);
  const strategy = effectiveStrategy(sport, policy, row?.strategy);
  const positionModel = playbook.positionModel(policy, onFieldSize);

  const live = positions
    .filter((p) => !p.archived_at)
    .sort((a, b) => a.sort - b.sort);
  // Coach-named positions are AFL's (open ages) and are laid out on
  // AFL's field; no other sport's model is "custom".
  const customPositions = sport === "afl" && positionModel.kind === "custom" && live.length > 0;
  const resolvedPositions = customPositions
    ? layoutAflPositions(
        live.map((p) => ({
          key: p.id,
          label: p.label,
          name: p.name ?? aflPositionName(p.label),
          line: p.line,
        })),
      )
    : positionModel.defaults;

  const saved = row?.season_balance ?? null;
  return {
    sport,
    policy,
    overrides,
    strategies,
    strategy,
    recommendedId: playbook.recommendedStrategy(policy),
    savedStrategy: row?.strategy ?? null,
    // A strategy with nothing to balance (manual, set positions) is off.
    seasonBalance: strategy.balanceUnit ? (saved ?? defaultSeasonBalance(strategy)) : "off",
    seasonBalanceSaved: saved,
    seasonBalanceSince: row?.season_balance_since ?? null,
    positionModel,
    positions: resolvedPositions,
    customPositions,
  };
}

/** The frozen copy written to games.playbook_snapshot at kickoff. */
export function playbookSnapshot(resolved: ResolvedPlaybook, now = new Date()): PlaybookSnapshot {
  return {
    policy: resolved.policy,
    strategy: resolved.strategy.id,
    seasonBalance: resolved.seasonBalance,
    seasonBalanceSince: resolved.seasonBalanceSince,
    positions:
      resolved.positionModel.kind === "none"
        ? []
        : resolved.positions.map((p) => ({ key: p.key, label: p.label, line: p.line })),
    takenAt: now.toISOString(),
  };
}

/**
 * What gets stored in policy_overrides: only values the age policy lets
 * a team change, clamped to the band, and only where they differ from
 * the age group's default — so a later change to a default reaches
 * teams that never touched it.
 */
export function sanitizeOverrides(
  sport: Sport,
  ageGroup: string,
  raw: PolicyOverrides,
): PolicyOverrides {
  const policy = effectivePolicy(sport, ageGroup, raw);
  const out: PolicyOverrides = {};
  for (const key of policy.overridden) {
    (out as Record<string, unknown>)[key] = policy[key];
  }
  return out;
}
