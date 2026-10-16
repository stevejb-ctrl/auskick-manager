"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { deleteTeam } from "@/app/(app)/teams/[teamId]/settings/actions";
import { LeaveTeamButton } from "@/components/team/LeaveTeamButton";
import { SFButton } from "@/components/sf";
import { Input } from "@/components/ui/Input";
import { Label } from "@/components/ui/Label";
import { Modal } from "@/components/ui/Modal";
import { InlineAlert } from "@/components/ui/InlineAlert";

interface DangerZoneProps {
  teamId: string;
  teamName: string;
  isAdmin: boolean;
}

/**
 * Team › Danger zone — leave the team, or (coaches) delete it. Neither
 * existed although Help described "Delete team" (UX plan H7). Deleting
 * asks for the team name so it can't happen by accident.
 */
export function DangerZone({ teamId, teamName, isAdmin }: DangerZoneProps) {
  const router = useRouter();
  const [dialog, setDialog] = useState<"delete" | null>(null);
  const [typed, setTyped] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function close() {
    setDialog(null);
    setTyped("");
    setError(null);
  }

  function run(action: () => Promise<{ success: true } | { success: false; error: string }>) {
    setError(null);
    startTransition(async () => {
      const res = await action();
      if (!res.success) {
        setError(res.error);
        return;
      }
      router.push("/dashboard?list=1");
      router.refresh();
    });
  }

  return (
    <div className="space-y-2 rounded-lg border border-danger/30 bg-surface p-5 shadow-card">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-ink">Leave team</p>
          <p className="text-xs text-ink-mute">Remove yourself from {teamName}.</p>
        </div>
        <LeaveTeamButton teamId={teamId} teamName={teamName} />
      </div>
      {isAdmin && (
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-hairline pt-3">
          <div className="min-w-0">
            <p className="text-sm font-semibold text-ink">Delete team</p>
            <p className="text-xs text-ink-mute">
              Removes the team, its squad, games and stats for everyone.
            </p>
          </div>
          <SFButton variant="danger" size="md" onClick={() => setDialog("delete")}>
            Delete team
          </SFButton>
        </div>
      )}

      {dialog === "delete" && (
        <Modal label={`Delete ${teamName}?`} onClose={isPending ? undefined : close}>
          <h2 className="text-center text-lg font-bold text-danger">Delete {teamName}?</h2>
          <ul className="mt-2 list-disc pl-5 text-xs text-ink-dim">
            <li>The squad, every game, availability and stats are removed.</li>
            <li>Everyone on the team loses access.</li>
            <li>This can&apos;t be undone.</li>
          </ul>
          <div className="mt-4 space-y-1">
            <Label htmlFor="confirm-team-name">Type the team name to confirm</Label>
            <Input
              id="confirm-team-name"
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              autoComplete="off"
            />
          </div>
          {error && (
            <InlineAlert className="mt-3">
              {error}
            </InlineAlert>
          )}
          <div className="mt-5 flex flex-col gap-2">
            <SFButton
              variant="alarm"
              size="md"
              disabled={typed.trim() !== teamName.trim()}
              loading={isPending}
              onClick={() => run(() => deleteTeam(teamId, typed))}
            >
              Delete team
            </SFButton>
            <SFButton variant="ghost" size="sm" onClick={close} disabled={isPending}>
              Cancel
            </SFButton>
          </div>
        </Modal>
      )}
    </div>
  );
}
