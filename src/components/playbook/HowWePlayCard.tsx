"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { PolicyCard } from "@/components/playbook/PolicyCard";
import { StrategyPicker } from "@/components/playbook/StrategyPicker";
import { SeasonBalanceControl } from "@/components/playbook/SeasonBalanceControl";
import { PositionsEditor } from "@/components/playbook/PositionsEditor";
import { toDraft } from "@/lib/playbook/positions";
import { InlineAlert } from "@/components/ui/InlineAlert";
import {
  resetSeasonBalance,
  saveHowWePlay,
  type HowWePlayPatch,
} from "@/app/(app)/teams/[teamId]/settings/howWePlayActions";
import { getSportPlaybook } from "@/lib/playbook";
import { resolveTeamPlaybook } from "@/lib/playbook/team";
import type {
  PolicyOverrides,
  SeasonBalanceSetting,
  TeamPlaybookRow,
  TeamPositionRow,
} from "@/lib/playbook/types";
import type { Sport } from "@/lib/types";

const SPORT_WORD: Record<Sport, string> = {
  afl: "AFL",
  netball: "netball",
  rugby_league: "league",
};

export type HowWePlayRow = Pick<
  TeamPlaybookRow,
  "strategy" | "policy_overrides" | "season_balance" | "season_balance_since"
>;

export type HowWePlayPosition = Pick<
  TeamPositionRow,
  "id" | "label" | "name" | "line" | "sort" | "archived_at"
>;

interface HowWePlayCardProps {
  teamId: string;
  sport: Sport;
  ageGroup: string;
  /** "U12", "11U". */
  ageLabel: string;
  onFieldSize: number;
  /** Most positions a team may name (the age group's max on field). */
  maxOnFieldSize: number;
  periodWord: string;
  /** The team's own named positions (AFL open ages). */
  positions?: HowWePlayPosition[];
  row: HowWePlayRow | null;
  isAdmin: boolean;
  /** Wizard step 2: no season to reset yet. */
  inWizard?: boolean;
}

/**
 * How we play (UX plan §7.8): the age group's policy, how kids rotate,
 * and season balance. Each change saves straight away, like the other
 * cards on the Team tab. Shared by wizard step 2 and Team › How we play.
 */
export function HowWePlayCard({
  teamId,
  sport,
  ageGroup,
  ageLabel,
  onFieldSize,
  maxOnFieldSize,
  periodWord,
  positions = [],
  row: initialRow,
  isAdmin,
  inWizard = false,
}: HowWePlayCardProps) {
  const router = useRouter();
  const [row, setRow] = useState<HowWePlayRow>(
    initialRow ?? { strategy: null, policy_overrides: {}, season_balance: null, season_balance_since: null },
  );
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [isPending, startTransition] = useTransition();

  const resolved = useMemo(
    () => resolveTeamPlaybook({ sport, ageGroup, onFieldSize, row, positions }),
    [sport, ageGroup, onFieldSize, row, positions],
  );
  const agePolicy = getSportPlaybook(sport).agePolicy(ageGroup);
  const disabled = !isAdmin;

  function save(next: HowWePlayRow, patch: HowWePlayPatch) {
    if (!isAdmin) return;
    const previous = row;
    setError(null);
    setRow(next);
    startTransition(async () => {
      const res = await saveHowWePlay(teamId, patch);
      if (!res.success) {
        setRow(previous);
        setError(res.error);
        return;
      }
      setSavedAt(Date.now());
      router.refresh();
    });
  }

  function changeOverrides(overrides: PolicyOverrides) {
    save({ ...row, policy_overrides: overrides }, { policyOverrides: overrides });
  }
  function changeStrategy(id: string) {
    save({ ...row, strategy: id }, { strategy: id });
  }
  function changeBalance(value: SeasonBalanceSetting) {
    save({ ...row, season_balance: value }, { seasonBalance: value });
  }
  function reset() {
    setError(null);
    startTransition(async () => {
      const res = await resetSeasonBalance(teamId);
      if (!res.success) {
        setError(res.error);
        return;
      }
      setRow((r) => ({ ...r, season_balance_since: res.data?.since ?? new Date().toISOString() }));
      setSavedAt(Date.now());
      router.refresh();
    });
  }

  return (
    <div className="space-y-3" aria-busy={isPending}>
      <PolicyCard
        sport={sport}
        title={`${ageLabel} ${SPORT_WORD[sport]}`}
        agePolicy={agePolicy}
        policy={resolved.policy}
        periodWord={periodWord}
        disabled={disabled}
        onChange={changeOverrides}
      />

      <div className="rounded-lg border border-hairline bg-surface p-5 shadow-card">
        <p className="text-sm font-semibold text-ink">How kids rotate</p>
        <p className="mt-0.5 mb-3 text-xs text-ink-dim">
          Siren suggests lineups this way. You can always change a lineup on the day.
        </p>
        <StrategyPicker
          strategies={resolved.strategies}
          value={resolved.strategy.id}
          recommendedId={resolved.recommendedId}
          ageLabel={ageLabel}
          disabled={disabled}
          onChange={changeStrategy}
        />
      </div>

      {resolved.strategy.usesPositions && resolved.positionModel.kind === "custom" && (
        <PositionsEditor
          teamId={teamId}
          initial={resolved.positions.map(toDraft)}
          defaults={resolved.positionModel.defaults.map(toDraft)}
          onFieldSize={onFieldSize}
          maxPositions={maxOnFieldSize}
          disabled={disabled}
        />
      )}

      {resolved.strategy.balanceUnit && (
        <SeasonBalanceControl
          unit={resolved.strategy.balanceUnit}
          value={resolved.seasonBalance}
          since={resolved.seasonBalanceSince}
          disabled={disabled}
          showReset={!inWizard}
          onChange={changeBalance}
          onReset={reset}
        />
      )}

      {error && <InlineAlert>{error}</InlineAlert>}
      <p className="min-h-[1rem] px-1 text-xs text-ink-mute" aria-live="polite">
        {!isAdmin
          ? "Only a coach can change how the team plays."
          : isPending
            ? "Saving…"
            : savedAt
              ? "Saved."
              : ""}
      </p>
    </div>
  );
}
