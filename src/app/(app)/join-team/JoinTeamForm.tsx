"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { joinTeamByCode } from "./actions";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Label } from "@/components/ui/Label";

/**
 * Single-input code-entry form. Submits to `joinTeamByCode`, which
 * is permissive about formatting (handles hyphens, spaces, casing)
 * so the parent doesn't have to type the exact canonical form.
 *
 * On success → redirect to /teams/{id}/games (matches the post-
 * accept-invite landing pattern set up in earlier work, so a fresh
 * parent always lands on the schedule view).
 */
export function JoinTeamForm() {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const trimmed = code.trim();
    if (!trimmed) {
      setError("Please enter your join code.");
      return;
    }
    startTransition(async () => {
      const res = await joinTeamByCode(trimmed);
      if (!res.success) {
        setError(res.error);
        return;
      }
      router.push(`/teams/${res.teamId}/games`);
      router.refresh();
    });
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="space-y-3 rounded-lg border border-hairline bg-surface p-5 shadow-card"
    >
      <div className="space-y-2">
        <Label htmlFor="join-code">Join code</Label>
        <Input
          id="join-code"
          name="join-code"
          type="text"
          autoComplete="off"
          autoCapitalize="characters"
          autoCorrect="off"
          spellCheck={false}
          inputMode="text"
          maxLength={9}
          placeholder="ABCD-EFGH"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          disabled={isPending}
          className="text-center font-mono text-lg tracking-[0.18em]"
          data-testid="join-code-input"
        />
      </div>

      {error && (
        <p className="text-sm text-danger" role="alert">
          {error}
        </p>
      )}

      <Button type="submit" loading={isPending} className="w-full">
        Join team
      </Button>
    </form>
  );
}
