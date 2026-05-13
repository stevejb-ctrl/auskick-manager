"use client";

// ─── Full-Time Review ────────────────────────────────────────
// Renders between Q4 quarter_end and the game_finalised event.
// Gives the coach a chance to reconcile / edit scores with the
// opposition before locking in the result. Once they tap
// "Finalise game", the game_finalised event fires, games.status
// flips to "completed", and the GameSummaryCard takes over.
//
// Mirrors the QuarterBreak "Fix scores" panel in spirit but lives
// at FT instead of mid-game, with its own "Finalise" CTA.

import { startTransition, useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useLiveGame } from "@/lib/stores/liveGameStore";
import {
  addRetroScore,
  deleteScore,
  finaliseGame,
  getGameScoreLog,
  type ScoreLogEntry,
} from "@/app/(app)/teams/[teamId]/games/[gameId]/live/actions";
import { Button } from "@/components/ui/Button";
import { QuarterScoreTable } from "@/components/live/QuarterScoreTable";
import type { LiveAuth, Player } from "@/lib/types";

interface FullTimeReviewProps {
  auth: LiveAuth;
  gameId: string;
  trackScoring: boolean;
  players: Player[];
  /** Total ms elapsed at full-time, used as the metadata.elapsed_ms
   *  for the game_finalised event. */
  finalisedElapsedMs: number;
  /** Team / opponent display names for the per-quarter table headers. */
  teamName?: string;
  opponentName?: string;
}

const aflPts = (g: number, b: number) => g * 6 + b;

export function FullTimeReview({
  auth,
  gameId,
  trackScoring,
  players,
  finalisedElapsedMs,
  teamName = "Us",
  opponentName = "Them",
}: FullTimeReviewProps) {
  const router = useRouter();
  const teamScore = useLiveGame((s) => s.teamScore);
  const opponentScore = useLiveGame((s) => s.opponentScore);
  const scoreByQuarter = useLiveGame((s) => s.scoreByQuarter);
  const incTeam = useLiveGame((s) => s.incTeam);
  const incOpponent = useLiveGame((s) => s.incOpponent);
  const undoTeamScore = useLiveGame((s) => s.undoTeamScore);
  const undoOpponentScore = useLiveGame((s) => s.undoOpponentScore);

  const playersById = useMemo(
    () => new Map(players.map((p) => [p.id, p])),
    [players],
  );

  const [scoreLog, setScoreLog] = useState<ScoreLogEntry[] | null>(null);
  const [scoreLogError, setScoreLogError] = useState<string | null>(null);
  const [scoreLogLoading, setScoreLogLoading] = useState(false);
  const [_actionPending, startActionTransition] = useTransition();
  const [finalisePending, startFinaliseTransition] = useTransition();
  const [finaliseError, setFinaliseError] = useState<string | null>(null);
  // Pending-delete confirm. The AFL FullTimeReview owns its own
  // inline delete path (not via ScoreReviewPanel) — Stagehand
  // exploration 2026-05-10 caught that the confirm modal shipped
  // with the other two delete surfaces (ScoreReviewPanel,
  // QuarterBreak inline) was missing here. Same pattern: stage
  // the entry into pendingDelete instead of firing immediately.
  const [pendingDelete, setPendingDelete] = useState<ScoreLogEntry | null>(
    null,
  );

  // Add-score form
  const [addOpen, setAddOpen] = useState(false);
  const [addKind, setAddKind] = useState<
    "goal" | "behind" | "opponent_goal" | "opponent_behind"
  >("goal");
  const [addPlayerId, setAddPlayerId] = useState<string>("");
  const [addQuarter, setAddQuarter] = useState<number>(4);

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
    if (trackScoring) refreshScoreLog();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handleDeleteScore(entry: ScoreLogEntry) {
    setScoreLogError(null);
    const q = entry.quarter ?? 4;
    const isOurs = entry.type === "goal" || entry.type === "behind";
    const kind =
      entry.type === "goal" || entry.type === "opponent_goal"
        ? "goals"
        : "behinds";
    if (isOurs) undoTeamScore(kind, q);
    else undoOpponentScore(kind, q);

    startActionTransition(async () => {
      const result = await deleteScore(auth, gameId, entry.id);
      if (!result.success) {
        if (isOurs) incTeam(kind, q);
        else incOpponent(kind, q);
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

    startActionTransition(async () => {
      const result = await addRetroScore(auth, gameId, {
        kind: addKind,
        playerId: isOurs ? addPlayerId : null,
        intendedQuarter: addQuarter,
      });
      if (!result.success) {
        if (isOurs) undoTeamScore(kind, addQuarter);
        else undoOpponentScore(kind, addQuarter);
        setScoreLogError(result.error);
        return;
      }
      setAddOpen(false);
      setAddPlayerId("");
      await refreshScoreLog();
      startTransition(() => router.refresh());
    });
  }

  function handleFinalise() {
    setFinaliseError(null);
    startFinaliseTransition(async () => {
      const result = await finaliseGame(auth, gameId, finalisedElapsedMs);
      if (!result.success) {
        setFinaliseError(result.error);
        return;
      }
      // Flip the live store's `finalised` flag locally so LiveGame's
      // render branches re-evaluate immediately (isAtFullTime → false,
      // GameSummaryCard mounts). Without this, router.refresh()
      // re-fetches initialState but LiveGame's init effect bails early
      // (`activeGameId === gameId && hydrated`), so the store stays at
      // finalised=false and the summary card never appears.
      useLiveGame.getState().finaliseGame();
      startTransition(() => router.refresh());
    });
  }

  const undoneEventIds = useMemo(() => {
    if (!scoreLog) return new Set<string>();
    const out = new Set<string>();
    for (const e of scoreLog) {
      if (e.type === "score_undo" && e.target_event_id) out.add(e.target_event_id);
    }
    return out;
  }, [scoreLog]);

  const scoreLogByQuarter = useMemo(() => {
    if (!scoreLog) return null;
    const groups: Record<number, ScoreLogEntry[]> = { 1: [], 2: [], 3: [], 4: [] };
    for (const e of scoreLog) {
      if (e.type === "score_undo") continue;
      if (undoneEventIds.has(e.id)) continue;
      const q = e.quarter ?? 1;
      if (!groups[q]) groups[q] = [];
      groups[q].push(e);
    }
    for (const q of Object.keys(groups)) {
      groups[+q].sort((a, b) => b.created_at.localeCompare(a.created_at));
    }
    return groups;
  }, [scoreLog, undoneEventIds]);

  return (
    <div className="space-y-4">
      <div className="rounded-md border border-hairline bg-surface p-4 shadow-card">
        <p className="font-mono text-[11px] font-bold uppercase tracking-micro text-ink-mute">
          Full time
        </p>
        <p className="mt-0.5 text-base font-semibold text-ink">
          Reconcile the score with the other team, then finalise.
        </p>

        {trackScoring && (
          <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
            <div className="rounded-md border border-hairline bg-surface-alt p-3">
              <p className="text-[10px] font-bold uppercase tracking-micro text-ink-mute">
                Us
              </p>
              <p className="mt-1 text-2xl font-bold tabular-nums text-ink">
                {teamScore.goals}.{teamScore.behinds}{" "}
                <span className="text-base font-normal text-ink-mute">
                  ({aflPts(teamScore.goals, teamScore.behinds)})
                </span>
              </p>
            </div>
            <div className="rounded-md border border-hairline bg-surface-alt p-3">
              <p className="text-[10px] font-bold uppercase tracking-micro text-ink-mute">
                Them
              </p>
              <p className="mt-1 text-2xl font-bold tabular-nums text-ink">
                {opponentScore.goals}.{opponentScore.behinds}{" "}
                <span className="text-base font-normal text-ink-mute">
                  ({aflPts(opponentScore.goals, opponentScore.behinds)})
                </span>
              </p>
            </div>
          </div>
        )}

        {/* Per-quarter breakdown — coach reconciles with the
            opposition AFTER full time. Same QuarterScoreTable
            component the Q-break recap + in-game modal use, so
            the data shape is consistent across surfaces.
            quarterEnded=true so Q4 renders its final tally
            instead of "in play". */}
        {trackScoring && (
          <div className="mt-4">
            <QuarterScoreTable
              scoreByQuarter={scoreByQuarter}
              currentQuarter={4}
              quarterEnded={true}
              sport="afl"
              teamName={teamName}
              opponentName={opponentName}
            />
          </div>
        )}

        {trackScoring && (
          <div className="mt-4 border-t border-hairline pt-3">
            <p className="text-xs font-semibold text-ink">Fix scores</p>
            <p className="mt-0.5 text-xs text-ink-mute">
              Tap × to delete a wrong score, or + Add to capture one that was
              missed during the game.
            </p>

            {scoreLogLoading && (
              <p className="mt-2 text-xs text-ink-mute">Loading…</p>
            )}
            {scoreLogError && (
              <p className="mt-2 text-xs text-danger" role="alert">
                {scoreLogError}
              </p>
            )}

            {scoreLogByQuarter && (
              <div className="mt-3 space-y-3">
                {[1, 2, 3, 4].map((q) => {
                  const entries = scoreLogByQuarter[q] ?? [];
                  if (entries.length === 0) return null;
                  return (
                    <div key={q}>
                      <p className="text-[10px] font-bold uppercase tracking-micro text-ink-mute">
                        Q{q}
                      </p>
                      <ul className="mt-1 divide-y divide-hairline rounded-md border border-hairline bg-surface-alt">
                        {entries.map((e) => {
                          const isOurs =
                            e.type === "goal" || e.type === "behind";
                          const isGoal =
                            e.type === "goal" || e.type === "opponent_goal";
                          const playerName = e.player_id
                            ? playersById.get(e.player_id)?.full_name ?? "—"
                            : null;
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
                                      : "bg-warn-soft text-warn"
                                  }`}
                                >
                                  {isGoal ? "G" : "B"}
                                </span>
                                <span className="font-medium text-ink">
                                  {isOurs
                                    ? playerName ?? "Player"
                                    : "Opposition"}
                                </span>
                                {e.retro && (
                                  <span className="rounded-full bg-ink-mute/10 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-micro text-ink-mute">
                                    Added
                                  </span>
                                )}
                              </span>
                              <button
                                type="button"
                                onClick={() => setPendingDelete(e)}
                                disabled={finalisePending}
                                className="rounded-full border border-hairline px-2 py-0.5 text-[11px] font-medium text-ink-mute transition-colors hover:border-danger/30 hover:bg-danger/10 hover:text-danger disabled:opacity-60"
                                aria-label="Delete this score"
                              >
                                ×
                              </button>
                            </li>
                          );
                        })}
                      </ul>
                    </div>
                  );
                })}
                {[1, 2, 3, 4].every(
                  (q) => (scoreLogByQuarter[q] ?? []).length === 0,
                ) && <p className="text-xs text-ink-mute">No scores yet.</p>}
              </div>
            )}

            <div className="mt-3">
              {!addOpen ? (
                <button
                  type="button"
                  onClick={() => setAddOpen(true)}
                  className="rounded-md border border-hairline bg-surface px-3 py-1.5 text-xs font-medium text-ink-dim transition-colors hover:border-brand-500/40 hover:text-brand-700"
                >
                  + Add a missed score
                </button>
              ) : (
                <div className="rounded-md border border-hairline bg-surface p-3 shadow-card">
                  <p className="text-xs font-semibold text-ink">
                    Add missed score
                  </p>
                  <div className="mt-2 grid grid-cols-2 gap-2">
                    <label className="text-[11px] text-ink-mute">
                      Type
                      <select
                        value={addKind}
                        onChange={(e) =>
                          setAddKind(e.target.value as typeof addKind)
                        }
                        className="mt-0.5 block w-full rounded-md border border-hairline bg-surface px-2 py-1 text-xs text-ink"
                      >
                        <option value="goal">Goal (us)</option>
                        <option value="behind">Behind (us)</option>
                        <option value="opponent_goal">Goal (them)</option>
                        <option value="opponent_behind">Behind (them)</option>
                      </select>
                    </label>
                    <label className="text-[11px] text-ink-mute">
                      Quarter
                      <select
                        value={addQuarter}
                        onChange={(e) =>
                          setAddQuarter(parseInt(e.target.value, 10))
                        }
                        className="mt-0.5 block w-full rounded-md border border-hairline bg-surface px-2 py-1 text-xs text-ink"
                      >
                        {[1, 2, 3, 4].map((q) => (
                          <option key={q} value={q}>
                            Q{q}
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
                            {p.jersey_number != null
                              ? `#${p.jersey_number} `
                              : ""}
                            {p.full_name}
                          </option>
                        ))}
                      </select>
                    </label>
                  )}
                  <div className="mt-3 flex gap-2">
                    <Button
                      size="sm"
                      onClick={handleAddScore}
                      disabled={finalisePending}
                    >
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
          </div>
        )}

        {finaliseError && (
          <p className="mt-3 text-sm text-danger" role="alert">
            {finaliseError}
          </p>
        )}

        <div className="mt-4 border-t border-hairline pt-3">
          <Button
            className="w-full"
            size="lg"
            onClick={handleFinalise}
            loading={finalisePending}
          >
            Finalise game
          </Button>
          <p className="mt-2 text-center text-[11px] text-ink-mute">
            Locks the score and shows the summary you can share.
          </p>
        </div>
      </div>

      {/* Delete-score confirmation. Same shape as the other two
          delete surfaces (ScoreReviewPanel, QuarterBreak) — Stagehand
          score-reconciler 2026-05-10 hit unguarded delete here
          because this surface owns its own inline path rather than
          going through ScoreReviewPanel. */}
      {pendingDelete &&
        (() => {
          const e = pendingDelete;
          const isOurs = e.type === "goal" || e.type === "behind";
          const isGoal = e.type === "goal" || e.type === "opponent_goal";
          const kindLabel = isGoal ? "goal" : "behind";
          const playerName = e.player_id
            ? playersById.get(e.player_id)?.full_name ?? "Player"
            : null;
          const subject = isOurs ? playerName ?? "Player" : "Opposition";
          const q = e.quarter ?? 4;
          return (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
              <div
                className="absolute inset-0 bg-ink/40"
                onClick={() => setPendingDelete(null)}
              />
              <div className="relative w-full max-w-sm rounded-lg border border-hairline bg-surface p-5 shadow-modal">
                <p className="text-center text-sm font-semibold text-ink">
                  Delete this score?
                </p>
                <p className="mt-2 text-center text-xs text-ink-mute">
                  {subject}&rsquo;s {kindLabel} in Q{q} will be removed from
                  the scoreline.
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
              </div>
            </div>
          );
        })()}
    </div>
  );
}
