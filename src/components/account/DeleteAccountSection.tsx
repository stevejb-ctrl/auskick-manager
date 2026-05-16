"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { restoreAccount } from "@/app/(app)/account/actions";
import { SFButton, SFCard } from "@/components/sf";
import { GRACE_DAYS } from "@/lib/account/constants";
import { DeleteAccountModal } from "./DeleteAccountModal";

interface Team {
  id: string;
  name: string;
}
interface MemberTeam extends Team {
  role: string;
}

interface DeleteAccountSectionProps {
  /**
   * ISO timestamp of the scheduled purge, or null if the account is
   * not currently scheduled for deletion. Drives the two display
   * modes: scheduled (warn banner + Restore button) vs idle (danger
   * card with Delete affordance).
   */
  scheduledFor: string | null;
  soleAdminTeams: Team[];
  memberTeams: MemberTeam[];
}

/**
 * Bottom-of-page danger zone for /account. Two modes:
 *
 *   - Idle: a red-outlined card with copy and a "Delete my account…"
 *     button that opens the type-to-confirm modal.
 *   - Scheduled: a warn banner showing the planned deletion date and a
 *     "Restore account" button. The user can keep using the app
 *     normally during the grace window; this card is just the
 *     in-app handle for changing their mind.
 */
export function DeleteAccountSection({
  scheduledFor,
  soleAdminTeams,
  memberTeams,
}: DeleteAccountSectionProps) {
  const router = useRouter();
  const [modalOpen, setModalOpen] = useState(false);
  const [isRestoring, startRestore] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleRestore() {
    setError(null);
    startRestore(async () => {
      const result = await restoreAccount();
      if (!result.success) {
        setError(result.error);
        return;
      }
      router.refresh();
    });
  }

  if (scheduledFor) {
    const date = new Date(scheduledFor);
    const formatted = date.toLocaleDateString(undefined, {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
    return (
      <SFCard className="border-warn/40 bg-warn-soft">
        <h2 className="text-base font-bold text-warn">
          Account scheduled for deletion
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-warn/90">
          Your account and personal data will be permanently deleted on{" "}
          <strong className="font-semibold">{formatted}</strong>. Until then
          you can keep using Siren Footy and restore your account at any
          time.
        </p>
        {error && (
          <p
            role="alert"
            className="mt-3 rounded-md bg-danger/10 px-3 py-2 text-sm text-danger"
          >
            {error}
          </p>
        )}
        <div className="mt-4">
          <SFButton
            type="button"
            variant="primary"
            onClick={handleRestore}
            loading={isRestoring}
          >
            {isRestoring ? "Restoring…" : "Restore account"}
          </SFButton>
        </div>
      </SFCard>
    );
  }

  return (
    <>
      <SFCard className="border-danger/30">
        <h2 className="text-base font-bold text-ink">Delete account</h2>
        <p className="mt-2 text-sm leading-relaxed text-ink-dim">
          Permanently delete your account and personal data. You&apos;ll
          have {GRACE_DAYS} days to change your mind before the deletion
          is final.
        </p>
        <div className="mt-4">
          <SFButton
            type="button"
            variant="danger"
            onClick={() => setModalOpen(true)}
            data-testid="open-delete-account-modal"
          >
            Delete my account…
          </SFButton>
        </div>
      </SFCard>
      <DeleteAccountModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        soleAdminTeams={soleAdminTeams}
        memberTeams={memberTeams}
      />
    </>
  );
}
