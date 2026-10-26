"use client";

// ─── FixScoresDialog ─────────────────────────────────────────
// A finished game's scores, fixable from the game page's More (round 3
// edge testing, 24 Oct 2026: "Open game screen: fix scores" opened a
// read-only summary, and the only edit was Restart), and a game's in
// play from the live screen (LiveFixScoresButton). Every sport: take a
// score off, change who scored, add a missed one. The list and its
// delete confirm follow the live Fix-scores panel (ScoreReviewPanel),
// which is tied to the live screen's store and AFL's actions; the writes
// are events (fixFinishedScore), so the summary and Stats recompute.

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { fixFinishedScore } from "@/app/(app)/teams/[teamId]/games/[gameId]/actions";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { InlineAlert } from "@/components/ui/InlineAlert";
import type { FinishedScoreRow, ScoreFix, ScoreKind } from "@/lib/games/finishedScores";

export interface FixScoresProps {
  teamId: string;
  gameId: string;
  kinds: ScoreKind[];
  log: FinishedScoreRow[];
  /** The squad and the game's fill-ins, names told apart. */
  players: { id: string; name: string }[];
  periodCount: number;
  /** "Q", "H" or "P". */
  periodLetter: string;
  teamName: string;
  opponentName: string;
}

const NOBODY = "";

export function FixScoresDialog({
  teamId,
  gameId,
  kinds,
  log,
  players,
  periodCount,
  periodLetter,
  teamName,
  opponentName,
  onClose,
  onFixed,
}: FixScoresProps & {
  onClose: () => void;
  /** After each fix (the live screen reads the log again). */
  onFixed?: () => void;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<FinishedScoreRow | null>(null);
  const [changing, setChanging] = useState<{ id: string; playerId: string } | null>(null);
  const [adding, setAdding] = useState(false);
  const [addType, setAddType] = useState(kinds[0]?.type ?? "");
  const [addPeriod, setAddPeriod] = useState(periodCount);
  const [addPlayer, setAddPlayer] = useState(NOBODY);

  const nameOf = new Map(players.map((p) => [p.id, p.name]));
  const who = (r: FinishedScoreRow) => (r.side === "them" ? opponentName : r.playerId ? nameOf.get(r.playerId) ?? "Unknown" : "No scorer");
  const points = (side: "us" | "them") => log.filter((r) => r.side === side).reduce((n, r) => n + r.kind.points, 0);
  const addKind = kinds.find((k) => k.type === addType);
  // Every period a score is in, even past the team's count now (its
  // halves or quarters may have changed since this game).
  const periods = Array.from({ length: Math.max(periodCount, ...log.map((r) => r.period)) }, (_, i) => i + 1);
  const periodName = (p: number) => (periodCount === 1 ? "Game" : `${periodLetter}${p}`);

  function run(fix: ScoreFix, done: () => void) {
    setError(null);
    startTransition(async () => {
      const res = await fixFinishedScore(teamId, gameId, fix);
      if (!res.success) {
        setError(res.error);
        return;
      }
      done();
      router.refresh();
      onFixed?.();
    });
  }

  return (
    <Modal label="Fix scores" size="md" onClose={isPending ? undefined : onClose}>
      <h2 className="text-lg font-semibold text-ink">Fix scores</h2>
      <p className="mt-0.5 text-xs text-ink-mute">
        Take off a wrong score, change who scored, or add one that was missed. Stats follow.
      </p>
      <p className="mt-3 text-sm font-semibold text-ink" data-testid="fix-scores-total">
        {teamName} {points("us")} – {points("them")} {opponentName}
      </p>

      <div className="mt-3 max-h-[45vh] space-y-3 overflow-y-auto">
        {log.length === 0 && <p className="text-xs text-ink-mute">No scores yet.</p>}
        {periods.map((p) => {
          const rows = log.filter((r) => r.period === p);
          if (rows.length === 0) return null;
          return (
            <div key={p}>
              <p className="text-[10px] font-bold uppercase tracking-micro text-ink-mute">{periodName(p)}</p>
              <ul className="mt-1 divide-y divide-hairline rounded-md border border-hairline bg-surface-alt">
                {rows.map((r) => (
                  <li key={r.id} className="px-3 py-2 text-xs" data-testid="fix-score-row">
                    <div className="flex items-center justify-between gap-2">
                      <span className="flex min-w-0 items-center gap-2">
                        <span
                          className={`inline-flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full px-1 text-[10px] font-bold ${
                            r.side === "us" ? "bg-brand-100 text-brand-700" : "bg-warn-soft text-warn"
                          }`}
                        >
                          {r.kind.short.replace(/^\+/, "")}
                        </span>
                        <span className="min-w-0 break-words font-medium text-ink">
                          {who(r)} <span className="font-normal text-ink-mute">· {r.kind.label}</span>
                        </span>
                      </span>
                      <span className="flex shrink-0 gap-1">
                        {r.side === "us" && (
                          <button
                            type="button"
                            onClick={() => setChanging({ id: r.id, playerId: r.playerId ?? NOBODY })}
                            className="rounded-full border border-hairline px-2 py-0.5 text-[11px] font-medium text-ink-dim hover:bg-surface"
                            aria-label={`Change who scored: ${who(r)}, ${r.kind.label} in ${periodName(p)}`}
                          >
                            Change
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => setDeleting(r)}
                          className="rounded-full border border-hairline px-2 py-0.5 text-[11px] font-medium text-ink-mute hover:border-danger/30 hover:bg-danger/10 hover:text-danger"
                          aria-label={`Take off ${who(r)}'s ${r.kind.label.toLowerCase()} in ${periodName(p)}`}
                        >
                          ×
                        </button>
                      </span>
                    </div>
                    {changing?.id === r.id && (
                      <div className="mt-2 flex flex-wrap items-end gap-2">
                        <label className="min-w-0 flex-1 text-[11px] text-ink-mute">
                          Who scored
                          <select
                            value={changing.playerId}
                            onChange={(e) => setChanging({ id: r.id, playerId: e.target.value })}
                            className="mt-0.5 block w-full rounded-md border border-hairline bg-surface px-2 py-1 text-xs text-ink"
                          >
                            <option value={NOBODY}>— pick —</option>
                            {players.map((pl) => (
                              <option key={pl.id} value={pl.id}>
                                {pl.name}
                              </option>
                            ))}
                          </select>
                        </label>
                        <Button
                          size="sm"
                          loading={isPending}
                          disabled={!changing.playerId || changing.playerId === r.playerId}
                          onClick={() =>
                            run({ op: "reassign", eventId: r.id, playerId: changing.playerId }, () => setChanging(null))
                          }
                        >
                          Save
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => setChanging(null)} disabled={isPending}>
                          Cancel
                        </Button>
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </div>

      <div className="mt-3">
        {!adding ? (
          <button
            type="button"
            onClick={() => setAdding(true)}
            className="rounded-md border border-hairline bg-surface px-3 py-1.5 text-xs font-medium text-ink-dim hover:border-brand-500/40 hover:text-brand-700"
          >
            + Add a missed score
          </button>
        ) : (
          <div className="rounded-md border border-hairline bg-surface p-3 shadow-card">
            <p className="text-xs font-semibold text-ink">Add a missed score</p>
            <div className="mt-2 grid grid-cols-2 gap-2">
              <label className="text-[11px] text-ink-mute">
                Score
                <select
                  value={addType}
                  onChange={(e) => setAddType(e.target.value)}
                  className="mt-0.5 block w-full rounded-md border border-hairline bg-surface px-2 py-1 text-xs text-ink"
                >
                  {(["us", "them"] as const).map((side) => (
                    <optgroup key={side} label={side === "us" ? teamName : opponentName}>
                      {kinds
                        .filter((k) => k.side === side)
                        .map((k) => (
                          <option key={k.type} value={k.type}>
                            {k.label} ({side === "us" ? teamName : opponentName})
                          </option>
                        ))}
                    </optgroup>
                  ))}
                </select>
              </label>
              <label className="text-[11px] text-ink-mute">
                {periodCount === 1 ? "When" : "Period"}
                <select
                  value={addPeriod}
                  onChange={(e) => setAddPeriod(parseInt(e.target.value, 10))}
                  className="mt-0.5 block w-full rounded-md border border-hairline bg-surface px-2 py-1 text-xs text-ink"
                >
                  {periods.map((p) => (
                    <option key={p} value={p}>
                      {periodName(p)}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            {addKind?.scorer && (
              <label className="mt-2 block text-[11px] text-ink-mute">
                Who scored
                <select
                  value={addPlayer}
                  onChange={(e) => setAddPlayer(e.target.value)}
                  className="mt-0.5 block w-full rounded-md border border-hairline bg-surface px-2 py-1 text-xs text-ink"
                >
                  <option value={NOBODY}>Not sure who</option>
                  {players.map((pl) => (
                    <option key={pl.id} value={pl.id}>
                      {pl.name}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <div className="mt-3 flex gap-2">
              <Button
                size="sm"
                loading={isPending}
                disabled={!addKind}
                onClick={() =>
                  run(
                    { op: "add", type: addType, playerId: addKind?.scorer && addPlayer ? addPlayer : null, period: addPeriod },
                    () => {
                      setAdding(false);
                      setAddPlayer(NOBODY);
                    },
                  )
                }
              >
                Add
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setAdding(false)} disabled={isPending}>
                Cancel
              </Button>
            </div>
          </div>
        )}
      </div>

      {error && <InlineAlert className="mt-3">{error}</InlineAlert>}

      <div className="mt-4 flex justify-end">
        <Button variant="secondary" size="sm" onClick={onClose} disabled={isPending}>
          Done
        </Button>
      </div>

      {deleting && (
        <Modal label="Take off this score?" onClose={() => setDeleting(null)}>
          <p className="text-center text-sm font-semibold text-ink">Take off this score?</p>
          <p className="mt-2 text-center text-xs text-ink-mute">
            {who(deleting)}&apos;s {deleting.kind.label.toLowerCase()} in {periodName(deleting.period)} comes off the
            scoreline and Stats.
          </p>
          <div className="mt-4 flex gap-2">
            <Button
              className="flex-1"
              variant="danger"
              loading={isPending}
              onClick={() => {
                const row = deleting;
                run({ op: "delete", eventId: row.id }, () => setDeleting(null));
              }}
            >
              Take it off
            </Button>
            <Button className="flex-1" variant="secondary" onClick={() => setDeleting(null)} disabled={isPending}>
              Cancel
            </Button>
          </div>
        </Modal>
      )}
    </Modal>
  );
}
