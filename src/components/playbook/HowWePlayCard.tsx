"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { PolicyCard } from "@/components/playbook/PolicyCard";
import { StrategyPicker } from "@/components/playbook/StrategyPicker";
import { SeasonBalanceControl } from "@/components/playbook/SeasonBalanceControl";
import { PositionsEditor } from "@/components/playbook/PositionsEditor";
import { RulesEditor } from "@/components/playbook/RulesEditor";
import { toDraft } from "@/lib/playbook/positions";
import { InlineAlert } from "@/components/ui/InlineAlert";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import {
  addRulePack,
  resetSeasonBalance,
  saveHowWePlay,
  saveRules,
  type HowWePlayPatch,
} from "@/app/(app)/teams/[teamId]/settings/howWePlayActions";
import { lockedRules, ruleCatalogue, ruleWords, sanitizeRules } from "@/lib/playbook/rules";
import { rulePacksFor } from "@/lib/playbook/rulePacks";
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

/**
 * What each vest strategy does, under the control (usability run: "doesn't
 * say what order"), in the age group's period (U8–U9 play quarters).
 */
function vestHelp(strategy: "auto" | "fixed-order" | "coach", periodWord: string): string {
  switch (strategy) {
    case "auto":
      return "Each vest goes to whoever on the field has worn it least.";
    case "fixed-order":
      return "Each vest goes round the squad in jersey-number order: the next kid on the field after whoever wore it last.";
    case "coach":
      return `Siren doesn't hand them out: you pick who wears each vest at the start of each ${periodWord}.`;
  }
}

export type HowWePlayRow = Pick<
  TeamPlaybookRow,
  "strategy" | "policy_overrides" | "season_balance" | "season_balance_since"
> & { rules?: unknown; vest_strategy?: "auto" | "fixed-order" | "coach" | null };

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
  /** The squad, for rules about particular players. */
  players?: { id: string; name: string }[];
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
  players = [],
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
  const words = ruleWords(sport, periodWord, resolved.strategy.usesPositions);
  const [initialRules] = useState(() => sanitizeRules(initialRow?.rules ?? [], null));

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

      {sport === "rugby_league" && (resolved.policy.vests.fr || resolved.policy.vests.dh) && (
        <div className="rounded-lg border border-hairline bg-surface p-5 shadow-card">
          <p className="text-sm font-semibold text-ink">Vests</p>
          <p className="mt-0.5 text-xs text-ink-dim">
            How Siren picks the FR and DH vests each {periodWord}, always within the vest rules.
          </p>
          <SegmentedControl
            className="mt-3"
            label="Vests"
            disabled={disabled}
            value={row.vest_strategy ?? "auto"}
            options={[
              { id: "auto", label: "Auto-fair" },
              { id: "fixed-order", label: "Fixed order" },
              { id: "coach", label: "Coach picks" },
            ]}
            onChange={(v) => save({ ...row, vest_strategy: v }, { vestStrategy: v })}
          />
          <p className="mt-2 text-xs text-ink-dim">
            {vestHelp(row.vest_strategy ?? "auto", periodWord)}
          </p>
        </div>
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

      <RulesEditor
        locked={lockedRules(resolved)}
        catalogue={ruleCatalogue(resolved)}
        words={words}
        players={players}
        initial={initialRules}
        packs={rulePacksFor(sport, ageGroup)}
        disabled={disabled}
        onSave={async (rules) => {
          const res = await saveRules(teamId, rules);
          if (res.success) setSavedAt(Date.now());
          return res;
        }}
        onAddPack={async (packId) => {
          const res = await addRulePack(teamId, packId);
          if (res.success && res.data) {
            const overrides = res.data.policyOverrides;
            setRow((r) => ({ ...r, policy_overrides: overrides }));
            setSavedAt(Date.now());
            router.refresh();
          }
          return res.success ? { success: true, data: res.data ? { rules: res.data.rules } : undefined } : res;
        }}
      />

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
