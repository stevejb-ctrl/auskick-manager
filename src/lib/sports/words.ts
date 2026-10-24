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

/** m:ss of game ms, as the clock shows it. */
function clockText(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

/**
 * The end-early confirm's heading, explainer and buttons. It shows how
 * much of the period the clock saw and credits that (`confirm`); the
 * whole period is the explicit second choice (`confirmFull`), for when
 * the game played on while the app's clock sat paused. It used to credit
 * everyone the whole period, silently: a half ended 6 s in gave every kid
 * on the court 20 phantom minutes, with no way back short of Restart
 * (round 3, 24 Oct 2026). At the hooter the time played is the whole
 * period, so there's one choice (`confirmFull` null).
 */
export function endPeriodEarlyCopy(opts: {
  sport: SportId;
  periodLabel: PeriodWord;
  /** The period being ended. */
  period: number;
  clock: EndEarlyClock;
  /** Game ms the clock has seen this period. */
  elapsedMs: number;
  /** The period's full length, in game ms. */
  periodMs: number;
}): { title: string; body: string; confirm: string; confirmFull: string | null } {
  const { surface, endCue } = getSportConfig(opts.sport).words;
  const word = opts.periodLabel;
  const name = `${word.charAt(0).toUpperCase()}${opts.period}`;
  const title = `End ${name} now?`;
  if (opts.clock === "hooter" || opts.elapsedMs >= opts.periodMs) {
    return {
      title,
      body: `Time's up. Ending the ${word} now credits everyone on the ${surface} with the whole ${word}.`,
      confirm: `End ${name}`,
      confirmFull: null,
    };
  }
  const played = clockText(opts.elapsedMs);
  const full = clockText(opts.periodMs);
  const credit = `Ending now credits everyone on the ${surface} with the ${played} played.`;
  const body =
    opts.clock === "paused"
      ? `The clock is paused at ${played} of the ${full} ${word}. ${credit}`
      : `The clock is running: ${played} of the ${full} ${word} played. ${credit} Use this when the ${endCue} beats the app's clock.`;
  return { title, body, confirm: `End ${name}`, confirmFull: `The game played on: credit the full ${full}` };
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
