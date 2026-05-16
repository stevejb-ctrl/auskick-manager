"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { requestDeleteAccount } from "@/app/(app)/account/actions";
import { SFButton } from "@/components/sf";
import {
  DELETE_CONFIRMATION_WORD,
  GRACE_DAYS,
} from "@/lib/account/constants";

interface Team {
  id: string;
  name: string;
}

interface MemberTeam extends Team {
  role: string;
}

interface DeleteAccountModalProps {
  open: boolean;
  onClose: () => void;
  /**
   * Teams the user is the sole admin of — these will be deleted along
   * with the account when the grace period expires. Listed prominently
   * in the modal so the user can promote another admin first if they
   * want to keep the team alive.
   */
  soleAdminTeams: Team[];
  /** Teams the user is on but isn't the sole admin — they'll just be removed. */
  memberTeams: MemberTeam[];
}

/**
 * Type-to-confirm account-deletion modal. Required by Apple App Store
 * guideline 5.1.1(v); the typed confirmation pattern is the App-Review-
 * friendly default (less ambiguous than two-tap, less abrasive than
 * "type your email").
 *
 * The destructive button stays disabled until the input matches the
 * literal "delete" (case-insensitive, trimmed). Server-side action
 * re-checks the confirmation so a direct call can't bypass the gate.
 */
export function DeleteAccountModal({
  open,
  onClose,
  soleAdminTeams,
  memberTeams,
}: DeleteAccountModalProps) {
  const router = useRouter();
  const [confirmation, setConfirmation] = useState("");
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  // Reset state every time the modal opens so a re-open doesn't show
  // the previous typed value or a stale error.
  useEffect(() => {
    if (open) {
      setConfirmation("");
      setError(null);
    }
  }, [open]);

  // Escape closes the modal. Bound at the document level so the user
  // doesn't need to focus the modal first (mobile Safari is fussy).
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && !isPending) onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, isPending, onClose]);

  if (!open) return null;

  const isConfirmed =
    confirmation.trim().toLowerCase() === DELETE_CONFIRMATION_WORD;

  function handleSubmit() {
    if (!isConfirmed || isPending) return;
    setError(null);
    startTransition(async () => {
      const result = await requestDeleteAccount(confirmation);
      if (!result.success) {
        setError(result.error);
        return;
      }
      onClose();
      // Refresh so the (app) layout banner + this section flip to
      // "scheduled" state without a manual reload.
      router.refresh();
    });
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-ink/60 p-0 sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="delete-account-title"
      onClick={(e) => {
        // Click on backdrop closes (but not during pending — would lose work).
        if (e.target === e.currentTarget && !isPending) onClose();
      }}
    >
      <div className="w-full max-w-md rounded-t-2xl border border-hairline bg-surface p-5 shadow-modal sm:rounded-2xl sm:p-7">
        <h2
          id="delete-account-title"
          className="text-xl font-bold tracking-tightest text-ink"
        >
          Delete your account?
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-ink-dim">
          Your account will be scheduled for deletion in{" "}
          <strong className="text-ink">{GRACE_DAYS} days</strong>. You can
          keep using Siren Footy in the meantime and restore your account
          any time before then.
        </p>

        {(soleAdminTeams.length > 0 || memberTeams.length > 0) && (
          <div className="mt-4 space-y-3 rounded-md border border-danger/20 bg-danger/5 p-3">
            {soleAdminTeams.length > 0 && (
              <div>
                <p className="text-xs font-bold text-danger">
                  These teams will be deleted with your account:
                </p>
                <ul className="mt-1 list-disc pl-5 text-xs text-danger/90">
                  {soleAdminTeams.map((t) => (
                    <li key={t.id}>{t.name}</li>
                  ))}
                </ul>
                <p className="mt-2 text-[11px] text-danger/70">
                  You&apos;re the only admin on{" "}
                  {soleAdminTeams.length === 1 ? "this team" : "these teams"}.
                  Promote another admin first to keep{" "}
                  {soleAdminTeams.length === 1 ? "it" : "them"} alive.
                </p>
              </div>
            )}
            {memberTeams.length > 0 && (
              <div>
                <p className="text-xs font-bold text-ink-dim">
                  You&apos;ll be removed from these teams:
                </p>
                <ul className="mt-1 list-disc pl-5 text-xs text-ink-mute">
                  {memberTeams.map((t) => (
                    <li key={t.id}>{t.name}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}

        <label className="mt-5 block">
          <span className="font-mono text-[11px] font-semibold uppercase tracking-micro text-ink-dim">
            Type{" "}
            <code className="rounded bg-surface-alt px-1.5 py-0.5 font-mono text-[11px] text-ink">
              {DELETE_CONFIRMATION_WORD}
            </code>{" "}
            to confirm
          </span>
          <input
            type="text"
            autoComplete="off"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            value={confirmation}
            onChange={(e) => setConfirmation(e.target.value)}
            placeholder={DELETE_CONFIRMATION_WORD}
            disabled={isPending}
            aria-label={`Type ${DELETE_CONFIRMATION_WORD} to confirm`}
            className="mt-1.5 w-full rounded-md border border-hairline bg-surface px-3 py-2 text-sm text-ink placeholder:text-ink-mute focus:border-danger focus:outline-none focus:ring-2 focus:ring-danger/30 disabled:opacity-60"
          />
        </label>

        {error && (
          <p
            role="alert"
            className="mt-3 rounded-md bg-danger/10 px-3 py-2 text-sm text-danger"
          >
            {error}
          </p>
        )}

        <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <SFButton
            type="button"
            variant="ghost"
            onClick={onClose}
            disabled={isPending}
          >
            Cancel
          </SFButton>
          <SFButton
            type="button"
            variant="alarm"
            onClick={handleSubmit}
            loading={isPending}
            disabled={!isConfirmed || isPending}
          >
            {isPending ? "Scheduling…" : "Schedule deletion"}
          </SFButton>
        </div>
      </div>
    </div>
  );
}
