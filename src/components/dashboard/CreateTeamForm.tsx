"use client";

import { useState, useTransition } from "react";
import { createTeam } from "@/app/(app)/dashboard/actions";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Label } from "@/components/ui/Label";

export function CreateTeamForm({ userId }: { userId: string }) {
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!name.trim()) {
      setError("Team name is required.");
      return;
    }

    startTransition(async () => {
      const result = await createTeam(userId, name.trim());
      if (!result.success) {
        setError(result.error);
      }
    });
  }

  return (
    <form onSubmit={handleSubmit} className="flex gap-3">
      <div className="flex-1 space-y-1">
        <Label htmlFor="team-name" className="sr-only">
          Team name
        </Label>
        <Input
          id="team-name"
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Kingsway Roos"
          error={error ?? undefined}
          disabled={isPending}
        />
      </div>
      <Button type="submit" loading={isPending} disabled={!name.trim()}>
        Create
      </Button>
    </form>
  );
}
