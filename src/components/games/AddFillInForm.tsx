"use client";

import { useState, useTransition } from "react";
import { addFillIn } from "@/app/(app)/teams/[teamId]/games/[gameId]/actions";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { SFButton } from "@/components/sf";
import type { LiveAuth, MixedGroup } from "@/lib/types";
import { MixedGroupPicker } from "@/components/squad/MixedGroupPicker";
import { parseWholeNumber } from "@/lib/wholeNumber";

interface AddFillInFormProps {
  auth: LiveAuth;
  gameId: string;
  /**
   * AFL teams show a jersey-number input alongside the name; netball
   * teams don't (no jersey numbers in netball). Defaults to true so
   * existing AFL call sites keep their current behaviour. Mirrors the
   * `showJersey` flag the setup wizard already uses on AddPlayerForm.
   */
  showJerseyNumber?: boolean;
  /** A touch or Oztag mixed team: ask who the fill-in counts as under the rule. */
  mixed?: boolean;
}

export function AddFillInForm({
  auth,
  gameId,
  showJerseyNumber = true,
  mixed = false,
}: AddFillInFormProps) {
  const [open, setOpen] = useState(false);
  const [group, setGroup] = useState<MixedGroup | null>(null);
  const [name, setName] = useState("");
  const [jersey, setJersey] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function reset() {
    setName("");
    setJersey("");
    setGroup(null);
    setError(null);
  }

  function submit() {
    const trimmed = name.trim();
    if (!trimmed) {
      setError("Name is required.");
      return;
    }
    const { value: num, error: numError } = parseWholeNumber(jersey, { min: 0, max: 99, what: "Number" });
    if (numError) {
      setError(numError);
      return;
    }
    if (mixed && !group) {
      setError("Mark Girl or Boy for the mixed rule.");
      return;
    }
    setError(null);
    startTransition(async () => {
      const res = await addFillIn(auth, gameId, {
        full_name: trimmed,
        jersey_number: num,
        ...(mixed && group ? { mixed_group: group } : {}),
      });
      if (!res.success) {
        setError(res.error);
        return;
      }
      reset();
      setOpen(false);
    });
  }

  if (!open) {
    // Steve 2026-05-15 (Lisa friction): the previous text-link
    // affordance read as low-contrast metadata, so parent-runners
    // didn't spot it when a sibling was missing from the squad.
    // Lifted to an SFButton ghost so it carries the same visual
    // weight as the "Mark availability" toggles above it.
    return (
      <div className="px-4 py-3">
        <SFButton
          variant="ghost"
          size="sm"
          onClick={() => setOpen(true)}
        >
          + Add fill-in player
        </SFButton>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2 border-t border-hairline bg-surface-alt px-4 py-3">
      <div className="flex flex-wrap items-center gap-2">
        <Input
          type="text"
          value={name}
          onChange={(e) => {
            setName(e.target.value);
            setError(null);
          }}
          placeholder="Fill-in name"
          disabled={isPending}
          autoFocus
          className="min-w-0 flex-1"
        />
        {showJerseyNumber && (
          <Input
            type="text"
            inputMode="numeric"
            autoComplete="off"
            aria-label="Fill-in's number"
            value={jersey}
            onChange={(e) => {
              setJersey(e.target.value);
              setError(null);
            }}
            placeholder="#"
            disabled={isPending}
            className="w-16 tabular-nums"
          />
        )}
        <Button
          type="button"
          onClick={submit}
          loading={isPending}
          size="sm"
        >
          Add
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => {
            reset();
            setOpen(false);
          }}
          disabled={isPending}
        >
          Cancel
        </Button>
      </div>
      {mixed && <MixedGroupPicker value={group} onChange={setGroup} disabled={isPending} />}
      {error && <p className="text-xs text-danger">{error}</p>}
    </div>
  );
}
