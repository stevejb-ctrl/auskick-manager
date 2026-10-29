"use client";

import { useState, useTransition } from "react";
import { addPlayer } from "@/app/(app)/teams/[teamId]/squad/actions";
import { SFButton } from "@/components/sf";
import { Input } from "@/components/ui/Input";
import { Label } from "@/components/ui/Label";
import { InlineAlert } from "@/components/ui/InlineAlert";
import { MixedGroupPicker } from "@/components/squad/MixedGroupPicker";
import type { MixedGroup } from "@/lib/types";
import { nameKey, type SquadKid } from "@/lib/squadPaste";
import { parseWholeNumber } from "@/lib/wholeNumber";

interface AddPlayerFormProps {
  teamId: string;
  activeCount: number;
  maxPlayers: number;
  /**
   * Everyone on the squad, active or not: a name already there gets a
   * warning (the coach can still add it), and a taken number says whose.
   */
  squad: SquadKid[];
  /**
   * AFL teams use jersey numbers; netball doesn't. When false the input
   * is hidden and `jersey_number: null` is always sent. Defaults true to
   * preserve AFL behaviour.
   */
  showJersey?: boolean;
  /** A touch or Oztag mixed team: ask who the kid counts as under the rule. */
  mixed?: boolean;
}

export function AddPlayerForm({
  teamId,
  activeCount,
  maxPlayers,
  squad,
  showJersey = true,
  mixed = false,
}: AddPlayerFormProps) {
  const [name, setName] = useState("");
  const [group, setGroup] = useState<MixedGroup | null>(null);
  const [jersey, setJersey] = useState("");
  const [nameError, setNameError] = useState<string | undefined>();
  const [jerseyError, setJerseyError] = useState<string | undefined>();
  const [serverError, setServerError] = useState<string | null>(null);
  // The name the duplicate warning was shown for: the next Add adds it.
  const [warnedFor, setWarnedFor] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const isFull = activeCount >= maxPlayers;
  // Round 3 edge testing (24 Oct 2026): a second "Jack Smith" went in
  // without a word, and the two couldn't be told apart anywhere. Warn,
  // and let the coach add them anyway (twins happen).
  const dupe = name.trim() ? squad.find((k) => nameKey(k.full_name) === nameKey(name)) ?? null : null;
  const warned = dupe !== null && warnedFor === nameKey(name);

  function validate() {
    let valid = true;
    setNameError(undefined);
    setJerseyError(undefined);
    setServerError(null);

    if (!name.trim()) {
      setNameError("Name is required.");
      valid = false;
    }

    const parsed = parseWholeNumber(jersey, { min: 1, max: 99, what: "Jersey" });
    if (parsed.error) {
      setJerseyError(parsed.error);
      valid = false;
    } else if (parsed.value !== null) {
      const owner = squad.find((k) => k.jersey_number === parsed.value);
      if (owner) {
        setJerseyError(`#${parsed.value} is ${owner.full_name}'s${owner.is_active ? "" : " (inactive)"}.`);
        valid = false;
      }
    }

    return valid;
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!validate()) return;
    // First tap on a name already there: the warning shows (below) and
    // the button reads "Add anyway". The second adds.
    if (dupe && !warned) {
      setWarnedFor(nameKey(name));
      return;
    }

    startTransition(async () => {
      const jerseyValue = parseWholeNumber(jersey, { min: 1, max: 99, what: "Jersey" }).value;
      const result = await addPlayer(
        teamId,
        name.trim(),
        jerseyValue,
        null,
        mixed ? group : null,
      );
      if (!result.success) {
        setServerError(result.error);
      } else {
        setName("");
        setJersey("");
        setGroup(null);
        setWarnedFor(null);
      }
    });
  }

  if (isFull) {
    return (
      <p className="rounded-lg border border-dashed border-warn/30 bg-warn-soft px-4 py-3 text-sm text-warn-ink">
        Squad is full — deactivate a player to make room.
      </p>
    );
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="space-y-3">
      <div className="flex gap-3">
        <div className="flex-1 space-y-1">
          <Label htmlFor="player-name">Player name</Label>
          <Input
            id="player-name"
            type="text"
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              // Clear as they type, not on the next Add.
              setNameError(undefined);
            }}
            placeholder="e.g. Sam Smith"
            error={nameError}
            disabled={isPending}
          />
        </div>
        {showJersey && (
          <div className="w-28 space-y-1">
            <Label htmlFor="jersey">Jersey #</Label>
            <Input
              id="jersey"
              type="text"
              inputMode="numeric"
              autoComplete="off"
              value={jersey}
              onChange={(e) => {
                setJersey(e.target.value);
                setJerseyError(undefined);
              }}
              placeholder="Optional"
              error={jerseyError}
              disabled={isPending}
            />
          </div>
        )}
      </div>

      {mixed && <MixedGroupPicker value={group} onChange={setGroup} disabled={isPending} />}

      {dupe && warned && (
        <InlineAlert kind="warn">
          There&apos;s already a {dupe.full_name}{dupe.is_active ? "" : " (inactive)"} on the squad. Add a surname or
          initial so you can tell them apart, or add them anyway.
        </InlineAlert>
      )}

      {serverError && (
        <InlineAlert>
          {serverError}
        </InlineAlert>
      )}

      <SFButton type="submit" loading={isPending} size="md">
        {warned ? "Add anyway" : "Add player"}
      </SFButton>
    </form>
  );
}
