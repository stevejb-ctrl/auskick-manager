"use client";

// ─── MixedRuleSettings ───────────────────────────────────────
// Team › Season › Mixed team (touch, Oztag): boys and girls play
// together, with at most so many boys on the field and at least so many
// girls and boys (.planning/FOUR-SPORTS-PLAN.md, "Mixed teams"). The
// sport's own rule is the preset (touch 3 / 1 / 1, Oztag 4 / 1 / 0), and
// a coach sets a local one (East Hills: at least 3 girls). Who counts as
// a girl or a boy is asked at the lineup and on the squad, and shows
// nowhere else.
//
// The same card, Toggle and save pattern as the other Season cards.

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { setTeamMixedRule } from "@/app/(app)/teams/[teamId]/settings/actions";
import { SFButton } from "@/components/sf";
import { Label } from "@/components/ui/Label";
import { Toggle } from "@/components/ui/Toggle";
import { InlineAlert } from "@/components/ui/InlineAlert";
import { MIXED_FAIRNESS_NOTE, mixedRuleSummary } from "@/lib/sports/touch/mixed";
import type { MixedRule } from "@/lib/sports/touch/types";

interface MixedRuleSettingsProps {
  teamId: string;
  /** The sport's short name ("Touch", "Oztag"). */
  sportName: string;
  /** The sport's rule: the preset. */
  preset: MixedRule;
  /** The team's rule; null when it isn't mixed. */
  initialRule: MixedRule | null;
  /** The most players the age plays on the field (the numbers' range). */
  maxOnField: number;
  isAdmin?: boolean;
}

const SELECT =
  "h-10 w-full rounded-md border border-hairline bg-surface px-2 text-sm text-ink shadow-card focus:border-brand-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-600 disabled:bg-surface-alt disabled:text-ink-mute";

export function MixedRuleSettings({ teamId, sportName, preset, initialRule, maxOnField, isAdmin = false }: MixedRuleSettingsProps) {
  const router = useRouter();
  const [mixed, setMixed] = useState(initialRule !== null);
  const [rule, setRule] = useState<MixedRule>(initialRule ?? preset);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [isPending, startTransition] = useTransition();
  const range = Array.from({ length: maxOnField + 1 }, (_, i) => i);

  function save(next: MixedRule | null) {
    if (!isAdmin) return;
    setError(null);
    setSaved(false);
    startTransition(async () => {
      const result = await setTeamMixedRule(teamId, next);
      if (!result.success) {
        setError(result.error ?? "Couldn't save.");
        return;
      }
      setSaved(true);
      router.refresh();
    });
  }

  function toggle(next: boolean) {
    setMixed(next);
    save(next ? rule : null);
  }

  const field = (key: keyof MixedRule, label: string) => (
    <div className="space-y-1">
      <Label htmlFor={`mixed-${key}-${teamId}`} className="text-xs">
        {label}
      </Label>
      <select
        id={`mixed-${key}-${teamId}`}
        value={rule[key]}
        onChange={(e) => {
          setRule((r) => ({ ...r, [key]: Number(e.target.value) }));
          setSaved(false);
        }}
        disabled={!isAdmin || isPending}
        className={SELECT}
      >
        {range.map((n) => (
          <option key={n} value={n}>
            {n}
          </option>
        ))}
      </select>
    </div>
  );

  const isPreset = rule.maxBoys === preset.maxBoys && rule.minGirls === preset.minGirls && rule.minBoys === preset.minBoys;

  return (
    <div className="rounded-lg border border-hairline bg-surface p-5 shadow-card" data-testid="mixed-rule-settings">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-ink">Mixed team</p>
          <p className="text-xs text-ink-mute">
            Boys and girls play together, and Siren keeps the mixed rule in every lineup and sub. {MIXED_FAIRNESS_NOTE}
          </p>
        </div>
        <Toggle checked={mixed} onChange={toggle} disabled={isPending || !isAdmin} label="Mixed team" />
      </div>

      {mixed && (
        <div className="mt-4 space-y-3 border-t border-hairline pt-4">
          <p className="text-xs text-ink-dim">
            <strong className="text-ink">{mixedRuleSummary(rule)}</strong>
            {isPreset ? ` (${sportName}'s rule)` : ""}
          </p>
          <div className="grid grid-cols-3 gap-2">
            {field("maxBoys", "Most boys")}
            {field("minGirls", "Fewest girls")}
            {field("minBoys", "Fewest boys")}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <SFButton size="sm" onClick={() => save(rule)} disabled={!isAdmin || isPending}>
              Save rule
            </SFButton>
            {!isPreset && (
              <SFButton
                size="sm"
                variant="ghost"
                onClick={() => {
                  setRule(preset);
                  save(preset);
                }}
                disabled={!isAdmin || isPending}
              >
                Use {sportName}&apos;s rule
              </SFButton>
            )}
          </div>
          <p className="text-micro text-ink-mute">
            Mark each kid Girl or Boy on the squad (or at the lineup). It&apos;s only used for this rule, and shows nowhere
            else.
          </p>
        </div>
      )}
      {saved && !error && <p className="mt-2 text-xs text-brand-700">Saved.</p>}
      {error && <InlineAlert className="mt-2">{error}</InlineAlert>}
    </div>
  );
}
