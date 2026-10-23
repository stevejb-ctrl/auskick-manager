// ─── Shared screens' words, from the sport ───────────────────
// Lines of copy that screens every sport shares (the clock menu, the
// end-early confirm, the setup wizard, Help) build here from the
// sport's own config (`SportConfig.words`, its period words, its age
// group). None of them names a sport's siren, field or quarter itself:
// a shared line that did ("When the siren beats the app's clock") was
// wrong in nine sports (ten-sport UX audit, 23 Oct 2026).

import type { AgeGroupConfig, SportConfig, SportId } from "@/lib/sports/types";
import { ALL_SPORTS, getSportConfig } from "@/lib/sports/registry";

type PeriodWord = "quarter" | "half" | "period";

/** The clock menu's "End Q2 now" helper line. */
export function clockEndEarlyHint(sport: SportId): string {
  return `When the ${getSportConfig(sport).words.endCue} beats the app's clock.`;
}

/**
 * Where the game clock stands when the coach ends a period by hand:
 * running, paused, or at the hooter (0:00, where basketball and touch
 * wait for the coach to end it).
 */
export type EndEarlyClock = "running" | "paused" | "hooter";

/**
 * The end-early confirm's heading, explainer and button. Ending credits
 * everyone on the surface the whole period (every sport does), so the
 * explainer says when that's right for the clock as it stands.
 */
export function endPeriodEarlyCopy(opts: {
  sport: SportId;
  periodLabel: PeriodWord;
  /** The period being ended. */
  period: number;
  clock: EndEarlyClock;
}): { title: string; body: string; confirm: string } {
  const { surface, endCue } = getSportConfig(opts.sport).words;
  const word = opts.periodLabel;
  const name = `${word.charAt(0).toUpperCase()}${opts.period}`;
  const credit = `everyone on the ${surface} is credited with the whole ${word}`;
  const body =
    opts.clock === "hooter"
      ? `Time's up. Ending the ${word} now means ${credit}.`
      : opts.clock === "paused"
        ? `The clock is paused, but ${credit}. Use this when the game played on but the clock didn't.`
        : `The clock is still running, and ${credit}. Use this when the ${endCue} beats the app's clock.`;
  return { title: `End ${name} now?`, body, confirm: `End ${name}` };
}

/** The game menu's "Restart game" helper line. */
export function restartGameHint(periodLabel: PeriodWord): string {
  return `Wipes every ${periodLabel}, swap and score.`;
}

/**
 * How big a squad to aim for: a few kids over the age group's on-field
 * number (a quarter more, for injuries and absences), up to its squad
 * cap. AFL Under 10s: 12 on, cap 20, so "15–20 kids".
 */
export function squadSizeHint(ageGroup: AgeGroupConfig): string {
  const cap = ageGroup.maxSquadSize;
  const low = Math.min(cap, Math.ceil(ageGroup.defaultOnFieldSize * 1.25));
  const range = low < cap ? `${low}–${cap}` : `${cap}`;
  return `${range} kids gives you plenty of cover for injuries and missed games.`;
}

/** The lineup footer's count label: "on field", "on court". */
export function onSurfaceLabel(sport: SportId): string {
  return `on ${getSportConfig(sport).words.surface}`;
}

/** The team form's on-field number label: "Players on the court". */
export function playersOnSurfaceLabel(sport: SportId): string {
  return `Players on the ${getSportConfig(sport).words.surface}`;
}

/** Every sport, as a sentence lists them: "AFL, netball, … and Oztag". */
export function sportsInASentence(joiner: "and" | "or" = "and"): string {
  const names = ALL_SPORTS.map((s) => s.words.sportName);
  return `${names.slice(0, -1).join(", ")}, ${joiner} ${names[names.length - 1]}`;
}

/** The sports whose subs wait for the break (no rolling subs, no Sub Due). */
export function subsAtBreaksOnly(): SportConfig[] {
  return ALL_SPORTS.filter((s) => s.substitutionRule === "period-break-only");
}
