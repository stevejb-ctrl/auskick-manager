"use client";

import { useId, type ReactNode } from "react";
import { Modal } from "@/components/ui/Modal";
import { SFButton } from "@/components/sf";
import { InlineAlert } from "@/components/ui/InlineAlert";

// ─── ConfirmDialog ───────────────────────────────────────────
// The app's own "Are you sure?", in place of the browser's confirm()
// (Stagehand round 11: Revoke invite and Remove team song stopped at a
// native box that looked like nothing else in Siren, and that a test
// agent couldn't answer). The grammar of Delete game and Remove member:
// a heading that asks the question, a line on what happens, the action
// named in full on the main button (alarm red when it can't be undone)
// and Cancel under it.
//
// It's the Modal, so it's the v3 sheet on a phone: focus moves in, Tab
// stays inside, Escape and the backdrop cancel, and focus goes back to
// the button that opened it. While the action runs, it can't be
// dismissed and the main button shows it's busy.

interface ConfirmDialogProps {
  /** The question: "Revoke this invite?" Names the dialog too. */
  title: string;
  /** What happens if they go ahead. */
  children?: ReactNode;
  /** The main button, the action in full: "Revoke invite". */
  confirmLabel: string;
  /** The main button while the action runs: "Revoking…". */
  pendingLabel?: string;
  cancelLabel?: string;
  /** Can't be undone: the heading and the main button turn alarm red. */
  destructive?: boolean;
  pending?: boolean;
  /** Shown over the buttons when the action failed. */
  error?: string | null;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDialog({
  title,
  children,
  confirmLabel,
  pendingLabel,
  cancelLabel = "Cancel",
  destructive = false,
  pending = false,
  error = null,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const titleId = useId();
  return (
    <Modal labelledBy={titleId} onClose={pending ? undefined : onCancel}>
      <h2 id={titleId} className={`text-center text-lg font-bold ${destructive ? "text-danger" : "text-ink"}`}>
        {title}
      </h2>
      {children && <div className="mt-2 space-y-2 text-sm text-ink-dim">{children}</div>}
      {error && <InlineAlert className="mt-3">{error}</InlineAlert>}
      <div className="mt-5 flex flex-col gap-2">
        <SFButton
          type="button"
          variant={destructive ? "alarm" : "primary"}
          size="md"
          loading={pending}
          onClick={onConfirm}
        >
          {pending && pendingLabel ? pendingLabel : confirmLabel}
        </SFButton>
        <SFButton type="button" variant="ghost" size="md" onClick={onCancel} disabled={pending}>
          {cancelLabel}
        </SFButton>
      </div>
    </Modal>
  );
}
