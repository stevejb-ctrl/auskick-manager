"use client";

// ─── ScoresSheet ─────────────────────────────────────────────
// "Scores and fixes": one sheet for the game's scores, every sport, for
// everyone running the game (live v3, Steve 8 Nov 2026). It merged the
// quarter-by-quarter modal (whose own Fix scores was AFL- and
// netball-shaped) and the utility row's Fix scores dialog (team admin and
// game-day link only). Top to bottom:
//
//   - the score so far;
//   - AFL and netball: the quarter-by-quarter table (QuarterScoreTable),
//     from the screen's own numbers, so it's there before the log loads
//     and with no signal;
//   - Fix scores: every score by period, take one off, change who
//     scored, add a missed one (ScoreFixList, the game page's own list).
//
// The log is read when the sheet opens and after each fix
// (loadScoreFix for the team's admins and game managers,
// loadScoreFixFromLink for the game-day link while the game is on).
// The fixes are events (fixFinishedScore / fixScoreFromLink), and the
// page refreshes after each, so the live score follows.
//
// For now it opens from the utility row and, in AFL and netball, from
// under the clock; the score header takes over in a later phase.

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { InlineAlert } from "@/components/ui/InlineAlert";
import { QuarterScoreTable, type QuarterScoreTableProps } from "@/components/live/QuarterScoreTable";
import { ScoreFixList, logPoints, type FixScoresProps } from "@/components/games/FixScoresDialog";
import { loadScoreFix, loadScoreFixFromLink } from "@/app/(app)/teams/[teamId]/games/[gameId]/actions";
import type { LiveAuth } from "@/lib/types";

export interface ScoresSheetProps {
  auth: LiveAuth;
  gameId: string;
  /** AFL and netball: the quarter-by-quarter table, first. */
  quarters?: Omit<QuarterScoreTableProps, "periodLetter" | "periodWord">;
  onClose: () => void;
}

/**
 * The game's score log for its fix list, read on mount and again by
 * `load` (after each fix): the team's admins and game managers, or the
 * game-day link while the game is on.
 */
function useScoreFix(auth: LiveAuth, gameId: string) {
  const [fix, setFix] = useState<FixScoresProps | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, startTransition] = useTransition();

  const load = useCallback(() => {
    setError(null);
    startTransition(async () => {
      const res = await (auth.kind === "token" ? loadScoreFixFromLink(auth.token, gameId) : loadScoreFix(auth.teamId, gameId)).catch(
        () => ({ success: false as const, error: "Couldn't load the scores — try again." }),
      );
      if (!res.success) setError(res.error);
      else setFix(res.data ?? null);
    });
  }, [auth, gameId]);

  useEffect(() => {
    load();
    // Once, on open: each fix reads it again (onFixed).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return { fix, error, isLoading, load };
}

export function ScoresSheet({ auth, gameId, quarters, onClose }: ScoresSheetProps) {
  const { fix, error, isLoading, load } = useScoreFix(auth, gameId);
  const [busy, setBusy] = useState(false);

  return (
    <Modal label="Scores and fixes" size="md" onClose={busy ? undefined : onClose}>
      <div className="flex min-h-0 flex-1 flex-col gap-3">
        <div className="flex-shrink-0">
          <h2 className="text-lg font-semibold text-ink">Scores and fixes</h2>
          {fix ? (
            <p className="mt-0.5 text-sm font-semibold text-ink" data-testid="fix-scores-total">
              {fix.teamName} {logPoints(fix.log, "us")} – {logPoints(fix.log, "them")} {fix.opponentName}
            </p>
          ) : null}
          <p className="mt-0.5 text-xs text-ink-mute">Every score this game. Take one off, or add one you missed.</p>
        </div>

        <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto">
          {quarters && (
            <div>
              <QuarterScoreTable {...quarters} />
              <p className="mt-1 px-1 text-micro text-ink-mute">
                Numbers in (parentheses) are running totals.
                {quarters.sport === "afl" ? " Goals.behinds: 6 points a goal, 1 a behind." : ""}
              </p>
            </div>
          )}

          <section aria-label="Fix scores">
            <p className="text-nano font-bold uppercase tracking-micro text-ink-mute">Fix scores</p>
            {fix ? (
              <ScoreFixList {...fix} showTotal={false} onFixed={load} onBusy={setBusy} />
            ) : error ? null : (
              <p className="mt-2 text-xs text-ink-mute" aria-live="polite">
                {isLoading ? "Loading the scores…" : null}
              </p>
            )}
            {error && (
              <InlineAlert className="mt-2">
                {error}{" "}
                <button type="button" onClick={load} className="font-semibold underline">
                  Try again
                </button>
              </InlineAlert>
            )}
          </section>
        </div>

        <Button className="w-full flex-shrink-0" variant="secondary" onClick={onClose} disabled={busy}>
          Done
        </Button>
      </div>
    </Modal>
  );
}

/**
 * The sheet's fix list on its own, for the break's and full time's score
 * editors (BreakScoreEditor, rugby's break): every score by period, with
 * "Change who scored" and × (Stagehand round 9: those screens could only
 * take a score off and add it again). They have their own add buttons,
 * so no "+ Add a missed score" here.
 */
export function LiveScoreFix({
  auth,
  gameId,
  version,
}: {
  auth: LiveAuth;
  gameId: string;
  /** Changes when the editor's own buttons change the score: the list reads the log again, once it's saved. */
  version?: string;
}) {
  const { fix, error, isLoading, load } = useScoreFix(auth, gameId);
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    // The editor's write is on its way: read once it's had a moment.
    const t = setTimeout(load, 1200);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [version]);
  return (
    <section aria-label="Scores this game" data-testid="live-score-fix">
      <p className="text-nano font-bold uppercase tracking-micro text-ink-mute">Scores this game</p>
      <p className="mt-0.5 text-xs text-ink-dim">Wrong kid? Tap Change to pick who scored.</p>
      {fix ? (
        <ScoreFixList {...fix} showTotal={false} allowAdd={false} onFixed={load} />
      ) : error ? (
        <InlineAlert className="mt-2">
          {error}{" "}
          <button type="button" onClick={load} className="font-semibold underline">
            Try again
          </button>
        </InlineAlert>
      ) : (
        <p className="mt-2 text-xs text-ink-mute" aria-live="polite">
          {isLoading ? "Loading the scores…" : null}
        </p>
      )}
    </section>
  );
}

/**
 * The opener under the clock (AFL and netball), where the Q-by-Q button
 * was: a 44 pt text button, its icon a small table.
 */
export function ScoresButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex min-h-[44px] items-center gap-1 px-3 text-xs font-semibold text-ink-dim transition-colors duration-fast ease-out-quart hover:text-ink"
      aria-label="Scores by quarter"
    >
      <svg aria-hidden="true" viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.6">
        <rect x="2" y="3" width="12" height="10" rx="1.5" />
        <path d="M2 7h12M6 3v10M10 3v10" />
      </svg>
      <span className="bigtext:sr-only">Scores</span>
    </button>
  );
}
