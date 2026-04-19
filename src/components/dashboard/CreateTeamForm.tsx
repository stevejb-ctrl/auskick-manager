"use client";

import { useState, useTransition } from "react";
import { createTeam } from "@/app/(app)/dashboard/actions";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Label } from "@/components/ui/Label";
import { AGE_GROUPS, AGE_GROUP_ORDER } from "@/lib/ageGroups";
import type { AgeGroup } from "@/lib/types";

export function CreateTeamForm({ userId }: { userId: string }) {
  const [name, setName] = useState("");
  const [ageGroup, setAgeGroup] = useState<AgeGroup>("U10");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const cfg = AGE_GROUPS[ageGroup];

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!name.trim()) {
      setError("Team name is required.");
      return;
    }

    startTransition(async () => {
      const result = await createTeam(userId, name.trim(), ageGroup);
      if (!result.success) {
        setError(result.error);
      }
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <div className="space-y-1">
        <Label htmlFor="team-name">Team name</Label>
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
      <div className="space-y-1">
        <Label htmlFor="team-age">Age group</Label>
        <select
          id="team-age"
          value={ageGroup}
          onChange={(e) => setAgeGroup(e.target.value as AgeGroup)}
          disabled={isPending}
          className="h-10 w-full rounded-md border border-gray-300 bg-white px-2 text-sm"
        >
          {AGE_GROUP_ORDER.map((ag) => (
            <option key={ag} value={ag}>
              {AGE_GROUPS[ag].label}
            </option>
          ))}
        </select>
      </div>
      <p className="text-xs text-gray-500">{cfg.notes}</p>
      <Button type="submit" loading={isPending} disabled={!name.trim()}>
        Create
      </Button>
    </form>
  );
}
