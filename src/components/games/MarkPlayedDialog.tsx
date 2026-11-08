"use client";

// ─── MarkPlayedDialog ────────────────────────────────────────
// "Mark played" for a game that happened without Siren, with its final
// score (round 3 follow-up, 25 Oct 2026: it could be marked played but
// not scored, so it never counted). Our score and theirs, AFL's in goals
// and behinds; or no score, when nobody kept one (no result, never a
// 0–0 draw). lib/games/playedScore checks it, on the server too.
// The same Modal and button stack as DeleteGameDialog, its neighbour.

import { useState, useTransition } from "react";
import { markGamePlayed } from "@/app/(app)/teams/[teamId]/games/[gameId]/actions";
import { Modal } from "@/components/ui/Modal";
import { InlineAlert } from "@/components/ui/InlineAlert";
import { SFButton } from "@/components/sf";
import { parsePlayedScore, playedScoreInGoalsAndBehinds } from "@/lib/games/playedScore";
import type { Sport } from "@/lib/types";

interface MarkPlayedDialogProps {
  teamId: string;
  gameId: string;
  sport: Sport;
  teamName: string;
  opponent: string;
  onClose: () => void;
  onDone: () => void;
}

function ScoreInput({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label className="flex min-w-0 flex-col gap-1 text-xs font-medium text-ink-dim">
      {label}
      <input
        type="text"
        inputMode="numeric"
        pattern="[0-9]*"
        maxLength={3}
        value={value}
        onChange={(e) => onChange(e.target.value.replace(/[^0-9]/g, ""))}
        className="block h-11 w-full rounded-md border border-hairline bg-surface px-3 text-center font-mono text-lg font-bold tabular-nums text-ink shadow-card focus:border-brand-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-600"
      />
    </label>
  );
}

export function MarkPlayedDialog({ teamId, gameId, sport, teamName, opponent, onClose, onDone }: MarkPlayedDialogProps) {
  const afl = playedScoreInGoalsAndBehinds(sport);
  const [values, setValues] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const set = (key: string) => (v: string) => setValues((prev) => ({ ...prev, [key]: v }));

  function save(withScore: boolean) {
    setError(null);
    let score: unknown = null;
    if (withScore) {
      const parsed = parsePlayedScore(sport, values);
      if ("error" in parsed) {
        setError(parsed.error);
        return;
      }
      score = parsed.score;
    }
    startTransition(async () => {
      const res = await markGamePlayed(teamId, gameId, score);
      if (!res.success) {
        setError(res.error);
        return;
      }
      onClose();
      onDone();
    });
  }

  const side = (who: "us" | "them", name: string) => (
    <fieldset className="min-w-0">
      <legend className="mb-1 truncate text-sm font-semibold text-ink">{name}</legend>
      {afl ? (
        <div className="grid grid-cols-2 gap-2">
          <ScoreInput label={`${name} goals`} value={values[`${who}Goals`] ?? ""} onChange={set(`${who}Goals`)} />
          <ScoreInput label={`${name} behinds`} value={values[`${who}Behinds`] ?? ""} onChange={set(`${who}Behinds`)} />
        </div>
      ) : (
        <ScoreInput label={`${name} score`} value={values[who] ?? ""} onChange={set(who)} />
      )}
    </fieldset>
  );

  return (
    <Modal label="Mark played" onClose={isPending ? undefined : onClose}>
      <h2 className="text-center text-lg font-bold text-ink">Mark played</h2>
      <p className="mt-1 text-center text-sm text-ink-dim">
        It wasn&apos;t run in Siren, so there&apos;s no game time. Add the final score to count it as a result.
      </p>
      <div className="mt-4 grid grid-cols-2 gap-3">
        {side("us", teamName)}
        {side("them", opponent)}
      </div>
      {error && <InlineAlert className="mt-3">{error}</InlineAlert>}
      <div className="mt-5 flex flex-col gap-2">
        <SFButton type="button" variant="primary" size="md" onClick={() => save(true)} loading={isPending}>
          Save score
        </SFButton>
        <SFButton type="button" variant="ghost" size="sm" onClick={() => save(false)} disabled={isPending}>
          No score kept
        </SFButton>
        <SFButton type="button" variant="ghost" size="sm" onClick={onClose} disabled={isPending}>
          Cancel
        </SFButton>
      </div>
    </Modal>
  );
}
