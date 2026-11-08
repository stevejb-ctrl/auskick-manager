"use client";

import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { getSportConfig } from "@/lib/sports/registry";
import { periodEndLine } from "@/lib/sports/break";

// This modal runs AFL's flow only (+G/+B chips, goals and behinds), so
// its words are AFL's own, from AFL's config: the siren, and half-time
// after Q2 (ten-sport UX audit, 23 Oct 2026: it said "final whistle").
const SPORT = "afl";

interface QuarterEndModalProps {
  quarter: number;
  /** Number of periods this age group plays (ageGroup.periodCount). Drives the
   * "final siren" copy instead of a hardcoded 4 (CONFIG-01). The AFL "Q"/
   * "Quarter" label wording below is a conscious exclusion — only the count
   * literal is de-hardcoded; this modal renders the AFL flow only. */
  periodCount: number;
  loading?: boolean;
  /**
   * Home team name + score for the embedded scorebug. Steve
   * 2026-05-13: the late-score affordance used to be a single pair
   * of chips that only attributed to our team — but the same
   * "landed on the siren" scenario plays out for the opposition
   * too. Embed the live scorebug here so the coach has the SAME
   * +G/+B chips they use in-play, for BOTH teams, at the moment
   * the hooter fires.
   */
  teamName: string;
  opponentName: string;
  teamScore: { goals: number; behinds: number };
  opponentScore: { goals: number; behinds: number };
  /** False → hide all +G/+B chips. Matches the in-play scorebug behaviour. */
  trackScoring: boolean;
  /**
   * Tap own-team +G / +B inside the modal. Parent opens the
   * player-attribution picker (SlotFillSheet) — the chip itself
   * doesn't record the score until a scorer is picked.
   */
  onTeamLateScore?: (kind: "goal" | "behind") => void;
  /**
   * Tap opponent +G / +B inside the modal. Parent's handler
   * increments the opposition tally directly (no scorer picker —
   * we don't track opposition players).
   */
  onOpponentLateScore?: (kind: "goal" | "behind") => void;
  onConfirm: () => void;
}

function points(s: { goals: number; behinds: number }) {
  return s.goals * 6 + s.behinds;
}

export function QuarterEndModal({
  quarter,
  periodCount,
  loading,
  teamName,
  opponentName,
  teamScore,
  opponentScore,
  trackScoring,
  onTeamLateScore,
  onOpponentLateScore,
  onConfirm,
}: QuarterEndModalProps) {
  const isLastQuarter = quarter >= periodCount;
  const { endCue } = getSportConfig(SPORT).words;
  // Live v3's siren sheet: a hi-vis rule across its top (it's forced: it
  // waits on the coach), the score on the field green, then "Score on
  // the siren?" with each side's +G / +B, and the one way on, hi-vis.
  const lateButton =
    "inline-flex min-h-[46px] flex-1 items-center justify-center rounded-[12px] bg-transparent font-display text-[1.0625rem] font-extrabold text-ink shadow-[inset_0_0_0_1.5px_rgb(var(--l-hairline))] transition-colors duration-fast ease-out-quart hover:bg-surface-alt disabled:pointer-events-none disabled:opacity-60";
  const side = "min-w-0 rounded-[14px] bg-surface p-[6px] shadow-[inset_0_0_0_1.5px_rgb(var(--l-hairline))]";
  const sideLabel = "mb-[4px] ml-[4px] block truncate font-display text-[0.65625rem] font-extrabold uppercase tracking-[0.1em] text-ink-mute";
  return (
    <Modal className="border-t-[5px] border-hivis" label={`Quarter ${quarter} complete`}>
      <p className="font-display text-micro font-extrabold uppercase tracking-[0.14em] text-ink-mute">The {endCue}</p>
      <h2 className="font-display stretch-75 text-[1.5625rem] font-black uppercase leading-[1.02] text-ink">
        Quarter {quarter} complete
      </h2>
      <p className="mt-1 text-[0.8125rem] text-ink-dim">{periodEndLine(SPORT, "quarter", quarter, periodCount)}</p>

      {trackScoring ? (
        <>
          {/* The score as the siren went: on the field's green. */}
          <div className="mt-3 grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-[6px] rounded-[16px] bg-field px-[12px] py-[10px] text-mark">
            <div className="min-w-0">
              <span className="block truncate font-display text-[0.75rem] font-extrabold uppercase tracking-[0.06em] text-mark/85">{teamName}</span>
              <b className="nums block font-display stretch-62 text-[34px] font-black leading-[0.95] text-sun">{points(teamScore)}</b>
              <span className="nums font-display text-[0.75rem] font-extrabold text-mark/85">
                {teamScore.goals}.{teamScore.behinds}
              </span>
            </div>
            <em className="text-center font-display text-[0.6875rem] font-extrabold uppercase not-italic leading-tight tracking-[0.12em] text-hivis">
              on the
              <br />
              {endCue}
            </em>
            <div className="min-w-0 text-right">
              <span className="block truncate font-display text-[0.75rem] font-extrabold uppercase tracking-[0.06em] text-mark/85">{opponentName}</span>
              <b className="nums block font-display stretch-62 text-[34px] font-black leading-[0.95] text-mark">{points(opponentScore)}</b>
              <span className="nums font-display text-[0.75rem] font-extrabold text-mark/85">
                {opponentScore.goals}.{opponentScore.behinds}
              </span>
            </div>
          </div>

          {(onTeamLateScore || onOpponentLateScore) && (
            <>
              <p className="mx-[2px] mb-[5px] mt-[12px] font-display text-[0.65625rem] font-extrabold uppercase tracking-[0.14em] text-ink-mute">
                Score on the {endCue}?
              </p>
              <div className="grid grid-cols-2 gap-[8px]">
                <div className={side}>
                  <span className={sideLabel}>{teamName}</span>
                  {onTeamLateScore && (
                    <div className="flex gap-[6px]">
                      <button type="button" onClick={() => onTeamLateScore("goal")} disabled={loading} className={lateButton} aria-label={`Goal on the ${endCue}, ${teamName}`}>
                        +G
                      </button>
                      <button type="button" onClick={() => onTeamLateScore("behind")} disabled={loading} className={lateButton} aria-label={`Behind on the ${endCue}, ${teamName}`}>
                        +B
                      </button>
                    </div>
                  )}
                </div>
                <div className={side}>
                  <span className={sideLabel}>{opponentName}</span>
                  {onOpponentLateScore && (
                    <div className="flex gap-[6px]">
                      <button type="button" onClick={() => onOpponentLateScore("goal")} disabled={loading} className={lateButton} aria-label={`Goal on the ${endCue}, ${opponentName}`}>
                        +G
                      </button>
                      <button type="button" onClick={() => onOpponentLateScore("behind")} disabled={loading} className={lateButton} aria-label={`Behind on the ${endCue}, ${opponentName}`}>
                        +B
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </>
          )}
        </>
      ) : (
        <p className="mt-3 rounded-[12px] bg-surface-alt px-[10px] py-[8px] text-[0.8125rem] text-ink-dim">
          Q{quarter} is over. No score kept.
        </p>
      )}

      <div className="mt-4">
        <Button className="w-full !bg-hivis !text-hivis-ink hover:!bg-hivis/90" size="lg" onClick={onConfirm} loading={loading}>
          {isLastQuarter ? "End game" : `Select team for Q${quarter + 1}`}
        </Button>
      </div>
    </Modal>
  );
}
