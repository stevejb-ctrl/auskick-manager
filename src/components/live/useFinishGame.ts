"use client";

// ─── Finish game, safe to retry ──────────────────────────────
// Every sport's full-time review ends with "Finish game", which writes
// game_finalised. The action was awaited bare inside a transition, so a
// dropped request on a sideline connection threw into the error
// boundary: the whole live page became "Something went wrong · Failed
// to fetch", and the game wasn't finished (round-2 usability test,
// 24 Oct 2026, netball). Now a failure keeps the review on screen and
// says "Couldn't save — try again." Each attempt sends the same
// idempotency key, so a retry after a save whose reply was lost doesn't
// write a second game_finalised.

import { useRef, useState, useTransition } from "react";
import type { ActionResult } from "@/lib/types";
import { uuid } from "@/lib/live/writeQueue";

export const FINISH_FAILED = "Couldn't save — try again.";

export function useFinishGame(
  /** Writes game_finalised with this idempotency key. */
  save: (idempotencyKey: string) => Promise<ActionResult>,
  /** After it saved: the haptic, then the refresh into the summary. */
  onFinished: () => void,
): { finish: () => void; pending: boolean; error: string | null } {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const keyRef = useRef<string | null>(null);

  function finish() {
    setError(null);
    keyRef.current ??= uuid();
    const key = keyRef.current;
    startTransition(async () => {
      let result: ActionResult;
      try {
        result = await save(key);
      } catch {
        setError(FINISH_FAILED);
        return;
      }
      if (!result.success) {
        setError(result.error || FINISH_FAILED);
        return;
      }
      onFinished();
    });
  }

  return { finish, pending, error };
}
