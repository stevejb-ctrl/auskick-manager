"use client";

import { useState } from "react";
import { Toggle } from "@/components/ui/Toggle";
import type { AgePolicy, EffectivePolicy, PolicyOverrides } from "@/lib/playbook/types";
import { isBasketball, isRugby, isSoccer, isTouch } from "@/lib/sports/registry";
import { soccerFamilyAgeGroup, soccerFamilyRules } from "@/lib/sports/soccer/family";
import { touchAgeGroup } from "@/lib/sports/touch/family";
import type { Sport } from "@/lib/types";

interface PolicyCardProps {
  sport: Sport;
  /** "U12 AFL", "11U netball". */
  title: string;
  agePolicy: AgePolicy;
  policy: EffectivePolicy;
  /** "quarter" / "half" for the unbroken-periods line. */
  periodWord: string;
  disabled?: boolean;
  onChange: (next: PolicyOverrides) => void;
}

/**
 * What the age group requires (UX plan §7.8 W1), each line with its
 * source. "Our league is different" opens the overrides a league may
 * set: zones on or off (AFL) and the game-time floor within the band.
 * Shared by wizard step 2 and Team › How we play, for every sport.
 */
export function PolicyCard({
  sport,
  title,
  agePolicy,
  policy,
  periodWord,
  disabled = false,
  onChange,
}: PolicyCardProps) {
  const [open, setOpen] = useState(policy.overridden.length > 0);
  const zonesOverridable = sport === "afl" && agePolicy.zonesEnforced.overridable;
  const pctOverridable = agePolicy.minGameTimePct.overridable;
  const [lo, hi] = agePolicy.minGameTimePct.band;
  const pctOptions: number[] = [];
  for (let p = lo; p <= hi; p += 5) pctOptions.push(p);

  const overrides = (): PolicyOverrides => ({
    ...(policy.overridden.includes("zonesEnforced") ? { zonesEnforced: policy.zonesEnforced } : {}),
    ...(policy.overridden.includes("minGameTimePct") ? { minGameTimePct: policy.minGameTimePct } : {}),
  });

  const lines: { text: string; source?: string; changed?: boolean }[] = [];
  if (sport === "afl") {
    lines.push(
      policy.zonesEnforced
        ? {
            text: "Kids play in zones and rotate through back, centre and forward",
            source: agePolicy.zonesEnforced.source,
            changed: policy.overridden.includes("zonesEnforced"),
          }
        : {
            text: "No zones at this age: lines and positions are up to you",
            source: agePolicy.zonesEnforced.source,
            changed: policy.overridden.includes("zonesEnforced"),
          },
    );
  }
  if (sport === "netball") {
    lines.push({ text: "Positions follow the rules of play; you choose how kids rotate" });
  }
  if (isSoccer(sport)) {
    // The sport's own format, line words and the body that sets them.
    const age = soccerFamilyAgeGroup(sport, policy.ageGroup);
    const { lineLabels: words, ruleSource } = soccerFamilyRules(sport);
    lines.push({
      text:
        age.keeper === "none"
          ? `${age.defaultOnFieldSize} a side with no keeper and no lines: kids just play`
          : `${age.defaultOnFieldSize} a side with a keeper; everyone rotates through ${words.def.phrase}, ${words.mid.phrase} and ${words.att.phrase}`,
      source: ruleSource.format?.ages.includes(age.id) ? ruleSource.format.source : undefined,
    });
  }
  if (isBasketball(sport)) {
    lines.push({ text: "Five on court; positions are optional, and you choose how kids rotate" });
  }
  if (isTouch(sport)) {
    const age = touchAgeGroup(sport, policy.ageGroup);
    lines.push({ text: `${age.defaultOnFieldSize} a side, rolling subs; lanes (middle, link, wing) are optional, and you choose how kids rotate` });
    // The NSW Junior State Championships' fair-play line is Siren's engine.
    if (sport === "oztag") {
      lines.push({ text: "Equal game time: 50 %, give or take 10 %", source: "NSW Junior State Championships" });
    }
  }
  lines.push({
    text: `Everyone plays at least ${policy.minGameTimePct}% of the game`,
    source: agePolicy.minGameTimePct.source,
    changed: policy.overridden.includes("minGameTimePct"),
  });
  if (isRugby(sport) && policy.minUnbrokenPeriods > 0) {
    lines.push({
      text: `Each player plays ${policy.minUnbrokenPeriods} full ${periodWord}${
        policy.minUnbrokenPeriods === 1 ? "" : "s"
      } without a break`,
      source: agePolicy.minUnbrokenPeriods?.source,
    });
  }
  if (isRugby(sport) && (policy.vests.fr || policy.vests.dh)) {
    const vests = [policy.vests.fr && "FR", policy.vests.dh && "DH"].filter(Boolean).join(" and ");
    lines.push({ text: `${vests} vests are worn by a different player each ${periodWord}` });
  }

  return (
    <div className="rounded-lg border border-hairline bg-surface p-5 shadow-card">
      <p className="text-sm font-semibold text-ink">{title}</p>
      <ul className="mt-2 space-y-1.5" aria-label="Age group rules">
        {lines.map((l) => (
          <li key={l.text} className="flex gap-2 text-sm text-ink-dim">
            <span aria-hidden className="text-ok">
              ✓
            </span>
            <span className="min-w-0">
              {l.text}
              {l.changed && <span className="ml-1 text-xs font-semibold text-brand-600">(your league)</span>}
              {l.source && !l.changed && (
                <span className="block text-micro text-ink-mute">{l.source}</span>
              )}
            </span>
          </li>
        ))}
      </ul>

      {(zonesOverridable || pctOverridable) && (
        <div className="mt-3 border-t border-hairline pt-3">
          <button
            type="button"
            aria-expanded={open}
            onClick={() => setOpen((v) => !v)}
            className="min-h-[44px] text-sm font-semibold text-brand-600 hover:text-brand-700"
          >
            Our league is different {open ? "▴" : "›"}
          </button>
          {open && (
            <div className="mt-2 space-y-4">
              {zonesOverridable && (
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-ink">Play in zones</p>
                    <p className="text-xs text-ink-mute">
                      {policy.zonesEnforced
                        ? "Turn off if your league doesn't zone this age. Named positions open up."
                        : "Turn on if your league still zones this age. Positions are hidden, not lost."}
                    </p>
                  </div>
                  <Toggle
                    checked={policy.zonesEnforced}
                    disabled={disabled}
                    label="Play in zones"
                    onChange={(next) => onChange({ ...overrides(), zonesEnforced: next })}
                  />
                </div>
              )}
              {pctOverridable && (
                <label className="flex items-center justify-between gap-4">
                  <span className="min-w-0">
                    <span className="block text-sm font-medium text-ink">Minimum game time</span>
                    <span className="block text-xs text-ink-mute">
                      Leagues set {lo}–{hi}%.
                    </span>
                  </span>
                  <select
                    aria-label="Minimum game time"
                    className="min-h-[44px] rounded-md border border-hairline bg-surface px-3 text-sm text-ink disabled:opacity-60"
                    value={policy.minGameTimePct}
                    disabled={disabled}
                    onChange={(e) =>
                      onChange({ ...overrides(), minGameTimePct: Number(e.target.value) })
                    }
                  >
                    {pctOptions.map((p) => (
                      <option key={p} value={p}>
                        {p}%
                      </option>
                    ))}
                  </select>
                </label>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
