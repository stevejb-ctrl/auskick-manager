"use client";

import { useMemo, useState, useTransition } from "react";
import { addPlayers } from "@/app/(app)/teams/[teamId]/squad/actions";
import { SFButton } from "@/components/sf";
import { Label } from "@/components/ui/Label";
import { parseSquadPaste } from "@/lib/squadPaste";

interface BulkAddPlayersProps {
  teamId: string;
  /** AFL / league use jersey numbers; netball doesn't. */
  withJersey: boolean;
  /** Places left in the squad, for the over-cap warning. */
  room: number;
}

/**
 * "Paste a list" — add a whole squad from the club spreadsheet or a
 * group-chat message in one go (UX plan 2.2). Shows exactly what will be
 * added before anything is saved.
 */
export function BulkAddPlayers({ teamId, withJersey, room }: BulkAddPlayersProps) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [serverError, setServerError] = useState<string | null>(null);
  const [added, setAdded] = useState<number | null>(null);
  const [isPending, startTransition] = useTransition();
  const parsed = useMemo(() => parseSquadPaste(text, { withJersey }), [text, withJersey]);
  const tooMany = parsed.players.length > room;

  function handleAdd() {
    setServerError(null);
    startTransition(async () => {
      const res = await addPlayers(teamId, parsed.players);
      if (!res.success) {
        setServerError(res.error);
        return;
      }
      setAdded(res.added ?? parsed.players.length);
      setText("");
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
          onChange={(e) => setText(e.target.value)}
          placeholder={withJersey ? "Ava Smith #3\nBen Jones #7\n…" : "Ava Smith\nBen Jones\n…"}
          className="w-full rounded-md border border-hairline bg-surface px-3 py-2 text-sm text-ink shadow-card focus:border-brand-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-600"
        />
        <p className="text-xs text-ink-mute">
          {withJersey
            ? "Numbers can go before or after the name (Ava Smith #3, 3 Ava Smith) or in their own spreadsheet column."
            : "Straight from a spreadsheet or a group-chat message."}
        </p>
      </div>

      {parsed.players.length > 0 && (
        <p className="text-sm text-ink" aria-live="polite">
          {parsed.players.length} {parsed.players.length === 1 ? "player" : "players"}:{" "}
          <span className="text-ink-dim">
            {parsed.players
              .map((p) => (p.jersey_number != null ? `${p.full_name} #${p.jersey_number}` : p.full_name))
              .join(", ")}
          </span>
        </p>
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
          disabled={parsed.players.length === 0 || tooMany}
          loading={isPending}
        >
          {parsed.players.length > 0
            ? `Add ${parsed.players.length} ${parsed.players.length === 1 ? "player" : "players"}`
            : "Add players"}
        </SFButton>
        <SFButton variant="ghost" size="md" onClick={() => setOpen(false)} disabled={isPending}>
          Cancel
        </SFButton>
      </div>
    </div>
  );
}
