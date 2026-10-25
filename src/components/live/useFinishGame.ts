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
//
// It also waits for the game's queued writes and the signal before it
// locks the game (round 3: a missed goal added at full time with no
// signal was lost behind the Finish crash, and the summary said 0-0).
// The coach sees "Waiting for signal to lock the game", and the finish
// goes ahead by itself once everything before it has saved.

import { useEffect, useRef, useState, useTransition } from "react";
import type { ActionResult } from "@/lib/types";
import { laneOf, useWriteQueue, uuid } from "@/lib/live/writeQueue";
import { useOnline } from "@/lib/live/useOnline";

export const FINISH_FAILED = "Couldn't save — try again.";
export const FINISH_WAITING = "Waiting for signal to lock the game.";

export function useFinishGame(
  /** Writes game_finalised with this idempotency key. */
  save: (idempotencyKey: string) => Promise<ActionResult>,
  /** After it saved: the haptic, then the refresh into the summary. */
  onFinished: () => void,
): { finish: () => void; pending: boolean; error: string | null } {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const keyRef = useRef<string | null>(null);
  // Finish tapped while writes were still waiting: goes ahead when they've saved.
  const [waiting, setWaiting] = useState(false);
  const online = useOnline();
  const queued = useWriteQueue((s) => s.queue.some((op) => laneOf(op.kind) === "game"));
  const saveRef = useRef(save);
  saveRef.current = save;
  const onFinishedRef = useRef(onFinished);
  onFinishedRef.current = onFinished;

  function send() {
    setError(null);
    keyRef.current ??= uuid();
    const key = keyRef.current;
    startTransition(async () => {
      let result: ActionResult;
      try {
        result = await saveRef.current(key);
      } catch {
        setError(FINISH_FAILED);
        return;
      }
      if (!result.success) {
        setError(result.error || FINISH_FAILED);
        return;
      }
      onFinishedRef.current();
    });
  }

  useEffect(() => {
    if (!waiting || !online || queued) return;
    setWaiting(false);
    send();
    // send reads the latest save and onFinished from refs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [waiting, online, queued]);

  function finish() {
    if (!online || queued) {
      setError(null);
      setWaiting(true);
      return;
    }
    send();
  }

  return {
    finish,
    pending: pending || waiting,
    error: waiting ? FINISH_WAITING : error,
  };
}
