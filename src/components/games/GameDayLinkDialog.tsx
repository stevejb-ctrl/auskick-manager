"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Modal } from "@/components/ui/Modal";
import { SFButton } from "@/components/sf";
import { InlineAlert } from "@/components/ui/InlineAlert";
import { publicOrigin } from "@/lib/platform";
import { newGameDayLink } from "@/app/(app)/teams/[teamId]/games/[gameId]/actions";

interface GameDayLinkDialogProps {
  token: string;
  onClose: () => void;
  /**
   * Team admins can replace the link: the old one stops working (it may
   * be in a group chat, or with a helper who's been removed). UX round 2,
   * 24 Oct 2026: there was no way to take a link back.
   */
  replace?: { teamId: string; gameId: string };
}

/**
 * The game-day link (UX plan glossary: was "runner link" / "gameday
 * link"): lets someone run this game without an account. Opened from
 * the game hub's More sheet; it used to be a standing button in the
 * action row that competed with the primary action.
 */
export function GameDayLinkDialog({ token: initialToken, onClose, replace }: GameDayLinkDialogProps) {
  const router = useRouter();
  const [token, setToken] = useState(initialToken);
  const [copied, setCopied] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [replaced, setReplaced] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
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

  function getNewLink() {
    if (!replace) return;
    setError(null);
    startTransition(async () => {
      const result = await newGameDayLink(replace.teamId, replace.gameId);
      if (!result.success) {
        setError(result.error);
        return;
      }
      if (result.data) setToken(result.data.token);
      setConfirming(false);
      setReplaced(true);
      setCopied(false);
      router.refresh();
    });
  }

  if (confirming) {
    return (
      <Modal onClose={() => setConfirming(false)}>
        <h2 className="text-lg font-bold text-ink">Get a new link?</h2>
        <p className="mt-1 text-sm text-ink-dim">
          The old link stops working straight away. Anyone running this game
          with it will need the new one.
        </p>
        {error && (
          <div className="mt-3">
            <InlineAlert kind="danger">{error}</InlineAlert>
          </div>
        )}
        <div className="mt-4 space-y-2">
          <SFButton type="button" variant="danger" size="md" full onClick={getNewLink} disabled={pending}>
            {pending ? "Getting a new link…" : "Get a new link"}
          </SFButton>
          <SFButton type="button" variant="ghost" size="md" full onClick={() => setConfirming(false)} disabled={pending}>
            Keep this link
          </SFButton>
        </div>
      </Modal>
    );
  }

  return (
    <Modal onClose={onClose}>
      <h2 className="text-lg font-bold text-ink">Game-day link</h2>
      <p className="mt-1 text-sm text-ink-dim">
        Anyone with this link can run this game — no login needed. Share it
        privately with whoever&apos;s on the sideline.
      </p>
      {replaced && (
        <p className="mt-2 text-sm font-medium text-brand-700" role="status">
          New link ready. Send it to whoever&apos;s running the game.
        </p>
      )}
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
      <div className="mt-4 space-y-2">
        {replace && (
          <SFButton type="button" variant="ghost" size="md" full onClick={() => setConfirming(true)}>
            Get a new link
          </SFButton>
        )}
        <SFButton type="button" variant="ghost" size="md" full onClick={onClose}>
          Done
        </SFButton>
      </div>
    </Modal>
  );
}
