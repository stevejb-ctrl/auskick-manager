"use client";

import { useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { SFButton } from "@/components/sf";
import { publicOrigin } from "@/lib/platform";

interface GameDayLinkDialogProps {
  token: string;
  onClose: () => void;
}

/**
 * The game-day link (UX plan glossary: was "runner link" / "gameday
 * link"): lets someone run this game without an account. Opened from
 * the game hub's More sheet; it used to be a standing button in the
 * action row that competed with the primary action.
 */
export function GameDayLinkDialog({ token, onClose }: GameDayLinkDialogProps) {
  const [copied, setCopied] = useState(false);
  // publicOrigin() is brand-aware on web and returns the canonical host
  // inside the Capacitor shell, where capacitor:// would be useless.
  const url = `${publicOrigin()}/run/${token}`;

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }

  return (
    <Modal>
      <h2 className="text-lg font-bold text-ink">Game-day link</h2>
      <p className="mt-1 text-sm text-ink-dim">
        Anyone with this link can run this game — no login needed. Share it
        privately with whoever&apos;s on the sideline.
      </p>
      <div className="mt-4 flex items-center gap-2">
        <input
          readOnly
          aria-label="Game-day link"
          value={url}
          className="min-w-0 flex-1 rounded-md border border-hairline bg-surface-alt px-2 py-2 font-mono text-xs text-ink"
          onFocus={(e) => e.currentTarget.select()}
        />
        <SFButton type="button" size="md" variant="accent" onClick={copy}>
          {copied ? "Copied!" : "Copy"}
        </SFButton>
      </div>
      <div className="mt-4">
        <SFButton type="button" variant="ghost" size="md" full onClick={onClose}>
          Done
        </SFButton>
      </div>
    </Modal>
  );
}
