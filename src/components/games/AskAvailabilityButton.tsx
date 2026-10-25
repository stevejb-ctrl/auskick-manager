"use client";

import { useEffect, useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { SFButton } from "@/components/sf";
import { CopyableTextBlock } from "@/components/ui/CopyableTextBlock";
import { useCopyToClipboard } from "@/components/ui/useCopyToClipboard";
import { publicOrigin } from "@/lib/platform";
import { availabilityAskText, availabilityPath } from "@/lib/availability/parentLink";

interface AskAvailabilityButtonProps {
  teamName: string;
  opponent: string;
  scheduledAt: string;
  /** games.availability_token (migration 0072). */
  token: string;
  className?: string;
}

/**
 * "Ask parents who's in": the game's availability link and a message to
 * post with it in the group chat, to copy or share. A parent opens the
 * link with no account and marks their child In or Out
 * (/availability/[token]). The setup wizard promised this with nothing
 * behind it (round 2 usability, 24 Oct 2026).
 *
 * Coaches and managers only; it isn't the game-day link, which runs
 * the game.
 */
export function AskAvailabilityButton({
  teamName,
  opponent,
  scheduledAt,
  token,
  className,
}: AskAvailabilityButtonProps) {
  const [open, setOpen] = useState(false);
  const [canShare, setCanShare] = useState(false);
  const { copied, copy } = useCopyToClipboard();
  useEffect(() => setCanShare(typeof navigator !== "undefined" && typeof navigator.share === "function"), []);

  // publicOrigin() is brand-aware on web and the canonical host in the
  // native shell, where capacitor:// would be useless in a group chat.
  const url = `${publicOrigin()}${availabilityPath(token)}`;
  const dayLabel = new Date(scheduledAt).toLocaleDateString(undefined, {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
  const text = availabilityAskText({ teamName, opponent, dayLabel, url });

  async function share() {
    try {
      await navigator.share({ text });
    } catch {
      // Dismissed, or not allowed: Copy is right there.
    }
  }

  return (
    <>
      <SFButton type="button" variant="ghost" className={className} onClick={() => setOpen(true)}>
        Ask parents who&rsquo;s in
      </SFButton>
      {open && (
        <Modal label="Ask parents who's in" onClose={() => setOpen(false)} placement="sheet">
          <h2 className="text-lg font-bold text-ink">Ask parents who&rsquo;s in</h2>
          <p className="mt-1 mb-4 text-sm text-ink-dim">
            Post this in the team&rsquo;s group chat. Parents tap their child&rsquo;s
            name and choose In or Out, with no account, and you see their answers
            on Availability.
          </p>
          <CopyableTextBlock title="Message" text={text} copyLabel="Copy message" caption={null} />
          <div className="mt-4 flex items-center gap-2">
            <input
              readOnly
              aria-label="Availability link"
              value={url}
              className="min-w-0 flex-1 rounded-md border border-hairline bg-surface-alt px-2 py-2 font-mono text-xs text-ink"
              onFocus={(e) => e.currentTarget.select()}
            />
            <SFButton type="button" size="md" variant="ghost" onClick={() => copy(url, null)}>
              {copied ? "Copied!" : "Copy link"}
            </SFButton>
          </div>
          <div className="mt-4 flex flex-col gap-2">
            {canShare && (
              <SFButton type="button" variant="primary" size="md" full onClick={share}>
                Share
              </SFButton>
            )}
            <SFButton type="button" variant="ghost" size="md" full onClick={() => setOpen(false)}>
              Done
            </SFButton>
          </div>
        </Modal>
      )}
    </>
  );
}
