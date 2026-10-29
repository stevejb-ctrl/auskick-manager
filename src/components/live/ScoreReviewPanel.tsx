"use client";

// ─── Score Review Panel ──────────────────────────────────────
// Sport-agnostic per-quarter score summary + Fix-scores editor.
// Used at AFL QuarterBreak / FullTimeReview, netball QuarterBreak /
// FullTimeReview and the soccer family's half-time. Behaves the same
// in each — the differences are whether "behind" rows / inputs render
// (AFL: yes, netball and soccer: no) and the game's own periods (two
// halves read H1, H2). Periods are 1-indexed.

import { startTransition, useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  addRetroScore,
  deleteScore,
  getGameScoreLog,
  type ScoreLogEntry,
} from "@/app/(app)/teams/[teamId]/games/[gameId]/live/actions";
import { useLiveGame } from "@/lib/stores/liveGameStore";
import { Button } from "@/components/ui/Button";
import type { LiveAuth, Player } from "@/lib/types";
import { Modal } from "@/components/ui/Modal";
import { groupScoreLog, scoreEntryWho } from "@/lib/live/scoreLog";

interface ScoreReviewPanelProps {
  auth: LiveAuth;
  gameId: string;
  /** Squad players for the "add a missed score" picker. */
  players: Player[];
  /** AFL: true (goal + behind). Netball: false (goal only). */
  includeBehinds: boolean;
  /** Default quarter for the add-score form — usually `currentQuarter`. */
  defaultQuarter: number;
  /** The game's periods (default 4 quarters). */
  periodCount?: number;
  /** A period's letter: "Q", or "H" for halves. */
  periodLetter?: string;
  /** The add form's period label: "Quarter", or "Half". */
  periodWord?: string;
  /** Pre-fetched events to avoid an extra round-trip. When omitted the
   *  panel fetches its own log on mount. */
  initialLog?: ScoreLogEntry[] | null;
}

export function ScoreReviewPanel({
  auth,
  gameId,
  players,
  includeBehinds,
  defaultQuarter,
  periodCount = 4,
  periodLetter = "Q",
  periodWord = "Quarter",
  initialLog = null,
}: ScoreReviewPanelProps) {
  const router = useRouter();

  const incTeam = useLiveGame((s) => s.incTeam);
  const incOpponent = useLiveGame((s) => s.incOpponent);
  const undoTeamScore = useLiveGame((s) => s.undoTeamScore);
  const undoOpponentScore = useLiveGame((s) => s.undoOpponentScore);
  // The scorer’s own tally moves with the team total — the live store
  // doesn’t re-hydrate on router.refresh(), so without these the full-
  // time summary kept a deleted behind against the kid who “kicked” it.
  const incPlayerScore = useLiveGame((s) => s.incPlayerScore);
  const undoPlayerScore = useLiveGame((s) => s.undoPlayerScore);

  const playersById = useMemo(
    () => new Map(players.map((p) => [p.id, p])),
    [players],
  );

  const [scoreLog, setScoreLog] = useState<ScoreLogEntry[] | null>(initialLog);
  const [scoreLogError, setScoreLogError] = useState<string | null>(null);
  const [scoreLogLoading, setScoreLogLoading] = useState(false);
  const [_pending, startTransitionFn] = useTransition();
  // Pending-delete confirmation. The × button on a score row stages
  // an entry here instead of calling deleteScore directly — the
  // explore agent's score-reconciler mission flagged the no-confirm
  // delete as a critical flaw, since the reconcile context (post-
  // match coach-vs-coach reconciliation) is exactly where a
  // misclick removes a real goal silently.
  const [pendingDelete, setPendingDelete] = useState<ScoreLogEntry | null>(
    null,
  );

  // Add-score form state
  const [addOpen, setAddOpen] = useState(false);
  type ScoreKind = "goal" | "behind" | "opponent_goal" | "opponent_behind";
  const [addKind, setAddKind] = useState<ScoreKind>("goal");
  const [addPlayerId, setAddPlayerId] = useState<string>("");
  const [addQuarter, setAddQuarter] = useState<number>(defaultQuarter);

  async function refreshScoreLog() {
    setScoreLogLoading(true);
    setScoreLogError(null);
    const result = await getGameScoreLog(auth, gameId);
    setScoreLogLoading(false);
    if (!result.success) {
      setScoreLogError(result.error);
      return;
    }
    setScoreLog(result.entries ?? []);
  }

  useEffect(() => {
    if (scoreLog === null) refreshScoreLog();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handleDeleteScore(entry: ScoreLogEntry) {
    setScoreLogError(null);
    const q = entry.quarter ?? defaultQuarter;
    const isOurs = entry.type === "goal" || entry.type === "behind";
    const kind =
      entry.type === "goal" || entry.type === "opponent_goal"
        ? "goals"
        : "behinds";
    const scorer = isOurs ? entry.player_id : null;
    if (isOurs) undoTeamScore(kind, q);
    else undoOpponentScore(kind, q);
    if (scorer) undoPlayerScore(scorer, kind);

    startTransitionFn(async () => {
      const result = await deleteScore(auth, gameId, entry.id);
      if (!result.success) {
        if (isOurs) incTeam(kind, q);
        else incOpponent(kind, q);
        if (scorer) incPlayerScore(scorer, kind);
        setScoreLogError(result.error);
        return;
      }
      await refreshScoreLog();
      startTransition(() => router.refresh());
    });
  }

  function handleAddScore() {
    setScoreLogError(null);
    const isOurs = addKind === "goal" || addKind === "behind";
    if (isOurs && !addPlayerId) {
      setScoreLogError("Pick a player.");
      return;
    }
    const kind =
      addKind === "goal" || addKind === "opponent_goal" ? "goals" : "behinds";
    if (isOurs) incTeam(kind, addQuarter);
    else incOpponent(kind, addQuarter);
    if (isOurs) incPlayerScore(addPlayerId, kind);

    startTransitionFn(async () => {
      const result = await addRetroScore(auth, gameId, {
        kind: addKind,
        playerId: isOurs ? addPlayerId : null,
        intendedQuarter: addQuarter,
      });
      if (!result.success) {
        if (isOurs) undoTeamScore(kind, addQuarter);
        else undoOpponentScore(kind, addQuarter);
        if (isOurs) undoPlayerScore(addPlayerId, kind);
        setScoreLogError(result.error);
        return;
      }
      setAddOpen(false);
      setAddPlayerId("");
      await refreshScoreLog();
      startTransition(() => router.refresh());
    });
  }

  const scoreLogByPeriod = useMemo(
    () => (scoreLog ? groupScoreLog(scoreLog, periodCount) : null),
    [scoreLog, periodCount],
  );
  const who = (e: ScoreLogEntry) => scoreEntryWho(e, (id) => playersById.get(id)?.full_name);

  return (
    <div>
      <p className="text-xs font-semibold text-ink">Fix scores</p>
      <p className="mt-0.5 text-xs text-ink-mute">
        Tap × to delete a wrong score, or + to add a missed one.
      </p>

      {scoreLogLoading && (
        <p className="mt-2 text-xs text-ink-mute">Loading…</p>
      )}
      {scoreLogError && (
        <p className="mt-2 text-xs text-danger" role="alert">
          {scoreLogError}
        </p>
      )}

      {scoreLogByPeriod && (
        <div className="mt-3 space-y-3">
          {scoreLogByPeriod.map(({ period: q, entries }) => {
            if (entries.length === 0) return null;
            return (
              <div key={q}>
                <p className="text-[10px] font-bold uppercase tracking-micro text-ink-mute">
                  {`${periodLetter}${q}`}
                </p>
                <ul className="mt-1 divide-y divide-hairline rounded-md border border-hairline bg-surface-alt">
                  {entries.map((e) => {
                    const isOurs = e.type === "goal" || e.type === "behind";
                    const isGoal =
                      e.type === "goal" || e.type === "opponent_goal";
                    return (
                      <li
                        key={e.id}
                        className="flex items-center justify-between gap-2 px-3 py-2 text-xs"
                      >
                        <span className="flex items-center gap-2">
                          <span
                            className={`inline-flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-bold ${
                              isOurs
                                ? "bg-brand-100 text-brand-700"
                                : "bg-warn-soft text-warn-ink"
                            }`}
                          >
                            {includeBehinds ? (isGoal ? "G" : "B") : "G"}
                          </span>
                          <span className="font-medium text-ink">{who(e)}</span>
                          {e.retro && (
                            <span className="rounded-full bg-ink-mute/10 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-micro text-ink-mute">
                              Added
                            </span>
                          )}
                        </span>
                        {/* A 44 px target round the small ×, named for
                            the score it deletes (it was 25×22 and "Delete
                            this score" on every row; UX round 3, e4). */}
                        <button
                          type="button"
                          onClick={() => setPendingDelete(e)}
                          className="group -my-2 -mr-2 inline-flex h-11 w-11 shrink-0 items-center justify-center motion-safe:active:scale-[0.97]"
                          aria-label={`Delete ${includeBehinds && !isGoal ? "behind" : "goal"}${isOurs ? ` by ${who(e)}` : `, ${who(e)}`}`}
                        >
                          <span className="rounded-full border border-hairline px-2 py-0.5 text-[11px] font-medium text-ink-mute transition-colors group-hover:border-danger/30 group-hover:bg-danger/10 group-hover:text-danger">
                            ×
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>
            );
          })}
          {scoreLogByPeriod.every((g) => g.entries.length === 0) && (
            <p className="text-xs text-ink-mute">No scores yet.</p>
          )}
        </div>
      )}

      <div className="mt-3">
        {!addOpen ? (
          <button
            type="button"
            onClick={() => {
              setAddOpen(true);
              setAddQuarter(defaultQuarter);
            }}
            className="rounded-md border border-hairline bg-surface px-3 py-1.5 text-xs font-medium text-ink-dim transition-colors hover:border-brand-500/40 hover:text-brand-700"
          >
            + Add a missed score
          </button>
        ) : (
          <div className="rounded-md border border-hairline bg-surface p-3 shadow-card">
            <p className="text-xs font-semibold text-ink">Add missed score</p>
            <div className="mt-2 grid grid-cols-2 gap-2">
              <label className="text-[11px] text-ink-mute">
                Type
                <select
                  value={addKind}
                  onChange={(e) =>
                    setAddKind(e.target.value as ScoreKind)
                  }
                  className="mt-0.5 block w-full rounded-md border border-hairline bg-surface px-2 py-1 text-xs text-ink"
                >
                  <option value="goal">Goal (us)</option>
                  {includeBehinds && <option value="behind">Behind (us)</option>}
                  <option value="opponent_goal">Goal (them)</option>
                  {includeBehinds && (
                    <option value="opponent_behind">Behind (them)</option>
                  )}
                </select>
              </label>
              <label className="text-[11px] text-ink-mute">
                {periodWord}
                <select
                  value={addQuarter}
                  onChange={(e) => setAddQuarter(parseInt(e.target.value, 10))}
                  className="mt-0.5 block w-full rounded-md border border-hairline bg-surface px-2 py-1 text-xs text-ink"
                >
                  {Array.from({ length: periodCount }, (_, i) => i + 1).map((q) => (
                    <option key={q} value={q}>
                      {`${periodLetter}${q}`}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            {(addKind === "goal" || addKind === "behind") && (
              <label className="mt-2 block text-[11px] text-ink-mute">
                Player
                <select
                  value={addPlayerId}
                  onChange={(e) => setAddPlayerId(e.target.value)}
                  className="mt-0.5 block w-full rounded-md border border-hairline bg-surface px-2 py-1 text-xs text-ink"
                >
                  <option value="">— pick —</option>
                  {players.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.jersey_number != null ? `#${p.jersey_number} ` : ""}
                      {p.full_name}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <div className="mt-3 flex gap-2">
              <Button size="sm" onClick={handleAddScore}>
                Add
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  setAddOpen(false);
                  setAddPlayerId("");
                }}
              >
                Cancel
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* Delete-score confirmation. Mirrors SwapConfirmDialog's
          shape (centered card, ink/40 backdrop click-cancels) so
          the visual language stays consistent with the existing
          confirm-modal pattern. */}
      {pendingDelete &&
        (() => {
          const e = pendingDelete;
          const isOurs = e.type === "goal" || e.type === "behind";
          const isGoal = e.type === "goal" || e.type === "opponent_goal";
          const kindLabel = includeBehinds
            ? isGoal
              ? "goal"
              : "behind"
            : "goal";
          // "Mia's goal", "The rushed behind", "The goal" (no scorer).
          const subject =
            isOurs && !e.player_id
              ? e.rushed
                ? "The rushed behind"
                : `The ${kindLabel}`
              : `${who(e)}’s ${kindLabel}`;
          const q = e.quarter ?? defaultQuarter;
          return (
            <Modal label="Delete this score?" onClose={() => setPendingDelete(null)}>
                <p className="text-center text-sm font-semibold text-ink">
                  Delete this score?
                </p>
                <p className="mt-2 text-center text-xs text-ink-mute">
                  {subject} in {`${periodLetter}${q}`} will be removed from the
                  scoreline.
                </p>
                <div className="mt-4 flex gap-2">
                  <Button
                    className="flex-1"
                    variant="danger"
                    onClick={() => {
                      const entry = pendingDelete;
                      setPendingDelete(null);
                      if (entry) handleDeleteScore(entry);
                    }}
                  >
                    Delete
                  </Button>
                  <Button
                    className="flex-1"
                    variant="secondary"
                    onClick={() => setPendingDelete(null)}
                  >
                    Cancel
                  </Button>
                </div>
              </Modal>
          );
        })()}
    </div>
  );
}
