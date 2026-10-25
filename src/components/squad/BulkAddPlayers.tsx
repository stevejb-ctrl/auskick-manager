"use client";

import { useMemo, useState, useTransition } from "react";
import { addPlayers } from "@/app/(app)/teams/[teamId]/squad/actions";
import { SFButton } from "@/components/sf";
import { Label } from "@/components/ui/Label";
import { parseSquadPaste, type SquadKid } from "@/lib/squadPaste";

interface BulkAddPlayersProps {
  teamId: string;
  /** AFL / league use jersey numbers; netball doesn't. */
  withJersey: boolean;
  /** Places left in the squad, for the over-cap warning. */
  room: number;
  /** Everyone on the squad, active or not: names to warn about, numbers taken. */
  squad: SquadKid[];
}

/**
 * "Paste a list" — add a whole squad from the club spreadsheet or a
 * group-chat message in one go (UX plan 2.2). Shows exactly what will be
 * added before anything is saved.
 */
export function BulkAddPlayers({ teamId, withJersey, room, squad }: BulkAddPlayersProps) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [serverError, setServerError] = useState<string | null>(null);
  const [added, setAdded] = useState<number | null>(null);
  const [isPending, startTransition] = useTransition();
  const parsed = useMemo(() => parseSquadPaste(text, { withJersey, squad }), [text, withJersey, squad]);
  // Lines the coach unticked in the preview (by position in the list).
  // A new paste starts with everyone ticked.
  const [unticked, setUnticked] = useState<Set<number>>(new Set());
  const chosen = parsed.players.filter((_, i) => !unticked.has(i));
  const tooMany = chosen.length > room;

  function handleText(next: string) {
    setText(next);
    setUnticked(new Set());
  }

  function toggle(i: number) {
    setUnticked((prev) => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });
  }

  function handleAdd() {
    setServerError(null);
    startTransition(async () => {
      const res = await addPlayers(teamId, chosen);
      if (!res.success) {
        setServerError(res.error);
        return;
      }
      setAdded(res.added ?? chosen.length);
      handleText("");
      setOpen(false);
    });
  }

  if (!open) {
    return (
      <div className="flex flex-wrap items-center gap-3">
        <SFButton variant="ghost" size="md" onClick={() => setOpen(true)}>
          Paste a list
        </SFButton>
        {added !== null && (
          <p className="text-sm font-medium text-ok" role="status">
            Added {added} {added === 1 ? "player" : "players"}.
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-3 rounded-lg border border-hairline bg-surface p-4 shadow-card">
      <div className="space-y-1">
        <Label htmlFor="squad-paste">Paste your squad — one player per line</Label>
        <textarea
          id="squad-paste"
          rows={6}
          value={text}
          onChange={(e) => handleText(e.target.value)}
          placeholder={withJersey ? "Ava Smith #3\nBen Jones #7\n…" : "Ava Smith\nBen Jones\n…"}
          className="w-full rounded-md border border-hairline bg-surface px-3 py-2 text-sm text-ink shadow-card focus:border-brand-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-600"
        />
        <p className="text-xs text-ink-mute">
          {withJersey
            ? "Numbers can go before or after the name (Ava Smith #3, 3 Ava Smith) or in their own spreadsheet column."
            : "Straight from a spreadsheet or a group-chat message."}
        </p>
      </div>

      {/* Exactly what will be added, each kid ticked: untick anyone who
          isn't one (round 3 edge testing, 24 Oct 2026: a group chat's
          greetings and sign-off went in as kids). */}
      {parsed.players.length > 0 && (
        <fieldset className="min-w-0 space-y-1" aria-live="polite">
          <legend className="text-sm text-ink">
            {chosen.length} of {parsed.players.length} {parsed.players.length === 1 ? "player" : "players"} ticked to add
          </legend>
          <ul className="grid gap-1 sm:grid-cols-2" data-testid="paste-preview">
            {parsed.players.map((p, i) => (
              <li key={`${i}-${p.full_name}`} className="min-w-0">
                <label className="flex min-w-0 items-center gap-2 text-sm text-ink-dim">
                  <input
                    type="checkbox"
                    checked={!unticked.has(i)}
                    onChange={() => toggle(i)}
                    className="h-4 w-4 shrink-0 accent-brand-600"
                  />
                  {/* bdi: an Arabic name doesn't flip its "#10". */}
                  <span className="min-w-0 break-words [overflow-wrap:anywhere]">
                    <bdi>{p.full_name}</bdi>
                    {p.jersey_number != null && <span className="text-ink-mute"> #{p.jersey_number}</span>}
                  </span>
                </label>
              </li>
            ))}
          </ul>
        </fieldset>
      )}
      {parsed.skipped.length > 0 && (
        <details className="text-xs text-ink-mute" data-testid="paste-skipped">
          <summary className="cursor-pointer">
            Skipped {parsed.skipped.length} {parsed.skipped.length === 1 ? "line" : "lines"} that aren&apos;t a player
          </summary>
          <ul className="mt-1 space-y-0.5">
            {parsed.skipped.map((s) => (
              <li key={s.line} className="break-words [overflow-wrap:anywhere]">
                Line {s.line}: <bdi>{s.text}</bdi> ({s.why})
              </li>
            ))}
          </ul>
        </details>
      )}
      {parsed.numbersLeftOff > 0 && (
        <p className="text-xs text-ink-mute">
          Numbers left off: this sport has no jersey numbers.
        </p>
      )}
      {parsed.errors.length > 0 && (
        <ul className="space-y-0.5 text-xs text-warn">
          {parsed.errors.map((e) => (
            <li key={e}>{e}</li>
          ))}
        </ul>
      )}
      {/* Kept, but maybe a mistake: the single add warns the same way. */}
      {parsed.warnings.length > 0 && (
        <ul className="space-y-0.5 text-xs text-ink-dim" data-testid="paste-warnings">
          {parsed.warnings.map((w) => (
            <li key={w}>{w} Add a surname or number so you can tell them apart.</li>
          ))}
        </ul>
      )}
      {tooMany && (
        <p className="text-xs text-danger" role="alert">
          The squad has room for {room} more.
        </p>
      )}
      {serverError && (
        <p className="text-xs text-danger" role="alert">
          {serverError}
        </p>
      )}

      <div className="flex gap-2">
        <SFButton
          variant="accent"
          size="md"
          onClick={handleAdd}
          disabled={chosen.length === 0 || tooMany}
          loading={isPending}
        >
          {chosen.length > 0
            ? `Add ${chosen.length} ${chosen.length === 1 ? "player" : "players"}`
            : "Add players"}
        </SFButton>
        <SFButton variant="ghost" size="md" onClick={() => setOpen(false)} disabled={isPending}>
          Cancel
        </SFButton>
      </div>
    </div>
  );
}
