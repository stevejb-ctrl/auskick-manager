"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { leaveTeam } from "@/app/(app)/teams/[teamId]/settings/actions";
import { SFButton } from "@/components/sf";
import { Modal } from "@/components/ui/Modal";

interface LeaveTeamButtonProps {
  teamId: string;
  teamName: string;
  size?: "sm" | "md";
  /** Name the team in the accessible label (lists with several buttons). */
  labelWithTeam?: boolean;
}

/**
 * Leave a team, with a confirm. Used in Team › Danger zone and on the
 * account page's team list — parents have no Team tab, so the account
 * page is where they leave.
 */
export function LeaveTeamButton({
  teamId,
  teamName,
  size = "md",
  labelWithTeam = false,
}: LeaveTeamButtonProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function leave() {
    setError(null);
    startTransition(async () => {
      const res = await leaveTeam(teamId);
      if (!res.success) {
        setError(res.error);
        return;
      }
      setOpen(false);
      router.push("/dashboard?list=1");
      router.refresh();
    });
  }

  return (
    <>
      <SFButton variant="danger" size={size} onClick={() => setOpen(true)} aria-label={labelWithTeam ? `Leave ${teamName}` : undefined}>
        Leave team
      </SFButton>
      {open && (
        <Modal>
          <h2 className="text-center text-lg font-bold text-danger">Leave {teamName}?</h2>
          <p className="mt-2 text-sm text-ink-dim">
            You&apos;ll lose access until a coach invites you back.
          </p>
          {error && (
            <p className="mt-3 rounded-md bg-danger/10 px-3 py-2 text-sm text-danger" role="alert">
              {error}
            </p>
          )}
          <div className="mt-5 flex flex-col gap-2">
            <SFButton variant="alarm" size="md" loading={isPending} onClick={leave}>
              Yes, leave the team
            </SFButton>
            <SFButton
              variant="ghost"
              size="sm"
              onClick={() => {
                setOpen(false);
                setError(null);
              }}
              disabled={isPending}
            >
              Cancel
            </SFButton>
          </div>
        </Modal>
      )}
    </>
  );
}
