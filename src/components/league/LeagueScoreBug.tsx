"use client";

// ─── LeagueScoreBug ──────────────────────────────────────────
// Rugby-league scoreboard contents rendered inside the shared
// LiveStickyScoreBar. Mirrors AFL `GameHeader` (broadcast scorebug)
// layout precisely:
//
//   Left  : team name + total points (big) + small T·C breakdown
//           + +T / +C action chips (own-team scoring)
//   Centre: dark clock pill — period chip on top, clock readout
//           big and bold below.
//   Right : opponent mirror — +T / +C, total points, T·C.
//
// Own-team +T / +C are wired by the parent to open a player picker
// for the scorer / kicker; the chips themselves don't mutate state
// until the coach picks a player. Mirrors AFL's onTeam(kind) shape.

interface LeagueScoreBugProps {
  teamName: string;
  opponentName: string;
  teamScore: { tries: number; conversions: number; points: number };
  opponentScore: { tries: number; conversions: number; points: number };
  periodLabel: string;
  periodLabelPlural: string;
  currentPeriod: number;
  periodCount: number;
  clockReadout: string;
  quarterEnded: boolean;
  /** Own-team +T tap — opens a scorer picker. */
  onTeamTry?: () => void;
  /** Own-team +C tap — opens a kicker picker / conversion dialog. */
  onTeamConversion?: () => void;
  /** Opponent +T tap — records an opp try directly. */
  onOpponentTry?: () => void;
  /** Opponent +C tap — records an opp conversion directly. */
  onOpponentConversion?: () => void;
  /** Whether conversion buttons should render (false for U6/U7). */
  kickingAllowed: boolean;
  /** Track-scoring gate — hides every chip when false (U6 / U7 / scoring off). */
  trackScoring: boolean;
  /** Action in flight — disables tap targets. */
  pending: boolean;
  /** Whether the clock is currently running. Drives the ⏸/▶ icon. */
  running?: boolean;
  /** Tap on the dark clock pill — toggle pause/resume. */
  onClockTap?: () => void;
  /** End-period-early — surfaces below the clock when paused (AFL parity). */
  onEndPeriodEarly?: () => void;
}

// Mirrors AFL's `SCORE_CHIP` token shape so the buttons read the
// same in both sports. Brief active flash on tap so the chip
// confirms the tap before the player picker mounts.
const SCORE_CHIP
  = "rounded-md bg-surface-alt px-3 py-2 font-mono text-sm font-semibold text-ink-dim "
  + "transition-colors duration-fast ease-out-quart "
  + "hover:bg-hairline hover:text-ink "
  + "active:bg-brand-200 active:text-brand-700 "
  + "disabled:pointer-events-none disabled:opacity-60";

export function LeagueScoreBug({
  teamName,
  opponentName,
  teamScore,
  opponentScore,
  periodLabel,
  periodLabelPlural,
  currentPeriod,
  periodCount,
  clockReadout,
  quarterEnded,
  onTeamTry,
  onTeamConversion,
  onOpponentTry,
  onOpponentConversion,
  kickingAllowed,
  trackScoring,
  pending,
  running = true,
  onClockTap,
  onEndPeriodEarly,
}: LeagueScoreBugProps) {
  const periodNoun = periodLabel.toUpperCase();
  const periodLabelLine
    = `${periodNoun} ${currentPeriod || 1}${quarterEnded ? " · over" : ""}`;
  return (
    <div className="grid grid-cols-[1fr_auto_1fr] items-start gap-2 px-4 py-3">
      {/* Left: home team */}
      <div className="min-w-0">
        <p className="truncate font-mono text-[10px] font-bold uppercase tracking-micro text-ink-dim">
          {teamName}
        </p>
        <p className="nums mt-0.5 flex items-baseline gap-1.5 font-mono leading-none text-ink">
          <span className="text-[36px] font-bold tracking-tightest">
            {teamScore.points}
          </span>
          <span className="text-sm font-semibold text-ink-dim">
            {teamScore.tries}T
            <span className="text-ink-mute">·</span>
            {teamScore.conversions}C
          </span>
        </p>
        {trackScoring && (onTeamTry || onTeamConversion) && (
          <div className="mt-1 flex gap-2">
            {onTeamTry && (
              <button
                type="button"
                onClick={onTeamTry}
                disabled={pending}
                className={SCORE_CHIP}
                aria-label="Record a try for our team"
              >
                +T
              </button>
            )}
            {kickingAllowed && onTeamConversion && (
              <button
                type="button"
                onClick={onTeamConversion}
                disabled={pending}
                className={SCORE_CHIP}
                aria-label="Record a conversion for our team"
              >
                +C
              </button>
            )}
          </div>
        )}
      </div>

      {/* Centre: dark clock pill — tappable to pause/resume.
          Mirrors AFL `GameHeader`'s centre column exactly: pill
          shows the period label + ⏸/▶ state icon on top, big
          time readout below. When paused, an "End half early"
          chip drops in beneath the pill. */}
      <div className="flex flex-col items-center gap-1 self-center">
        <button
          type="button"
          onClick={onClockTap}
          disabled={!onClockTap || quarterEnded}
          className="flex flex-col items-center justify-center rounded-md bg-ink px-3 py-1.5 text-warm shadow-pop transition-colors duration-fast ease-out-quart hover:bg-ink/90 disabled:opacity-80"
          aria-label={
            onClockTap
              ? running
                ? "Pause clock"
                : "Resume clock"
              : `${periodLabelLine}, ${clockReadout}`
          }
        >
          <span className="flex items-center gap-1 font-mono text-[10px] font-bold uppercase leading-none tracking-micro text-warm/70">
            <span>{periodLabelLine}</span>
            {onClockTap && !quarterEnded && (
              <span aria-hidden>{running ? "⏸" : "▶"}</span>
            )}
          </span>
          <span
            className="nums mt-0.5 font-mono text-[22px] font-bold leading-none tracking-tightest text-warm"
            aria-live="polite"
          >
            {clockReadout}
          </span>
        </button>
        {/* End-period-early — paused-only "rescue" affordance,
            same shape AFL uses. Stays out of the way during normal
            play; appears under the clock when the coach has
            paused. */}
        {onEndPeriodEarly && !running && !quarterEnded && (
          <button
            type="button"
            onClick={onEndPeriodEarly}
            disabled={pending}
            className="rounded-full border border-warn/40 bg-warn-soft px-2 py-0.5 font-mono text-[9px] font-semibold uppercase tracking-micro text-warn transition-colors duration-fast ease-out-quart hover:border-warn hover:bg-warn/15 disabled:opacity-60"
          >
            End {periodLabel.toLowerCase()} early
          </button>
        )}
        {(!onEndPeriodEarly || running || quarterEnded) && (
          <p className="font-mono text-[9px] font-semibold uppercase tracking-micro text-ink-dim">
            of {periodCount} {periodLabelPlural}
          </p>
        )}
      </div>

      {/* Right: opponent (mirror) */}
      <div className="min-w-0 text-right">
        <p className="truncate font-mono text-[10px] font-bold uppercase tracking-micro text-ink-dim">
          {opponentName}
        </p>
        <p className="nums mt-0.5 flex items-baseline justify-end gap-1.5 font-mono leading-none text-ink">
          <span className="text-sm font-semibold text-ink-dim">
            {opponentScore.tries}T
            <span className="text-ink-mute">·</span>
            {opponentScore.conversions}C
          </span>
          <span className="text-[36px] font-bold tracking-tightest">
            {opponentScore.points}
          </span>
        </p>
        {trackScoring && (onOpponentTry || onOpponentConversion) && (
          <div className="mt-1 flex justify-end gap-2">
            {onOpponentTry && (
              <button
                type="button"
                onClick={onOpponentTry}
                disabled={pending}
                className={SCORE_CHIP}
                aria-label="Record opponent try"
              >
                +T
              </button>
            )}
            {kickingAllowed && onOpponentConversion && (
              <button
                type="button"
                onClick={onOpponentConversion}
                disabled={pending}
                className={SCORE_CHIP}
                aria-label="Record opponent conversion"
              >
                +C
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
