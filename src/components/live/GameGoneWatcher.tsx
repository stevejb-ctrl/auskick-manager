"use client";

// ─── GameGoneWatcher ─────────────────────────────────────────
// An open live screen notices its game was deleted. Round 3 edge testing
// (24 Oct 2026): deleting a live game from another tab left this one's
// clock and "Select team for Q2" running until a reload; a game-day link
// on a parent's phone would have kept recording into nothing. It asks
// every few seconds, and on coming back to the tab, and when the game is
// gone it covers the screen with where to go instead.

import { useEffect, useRef, useState } from "react";
import { gameStillExists } from "@/app/(app)/teams/[teamId]/games/[gameId]/actions";
import { Modal } from "@/components/ui/Modal";
import { SFButton } from "@/components/sf";
import type { LiveAuth } from "@/lib/types";

const CHECK_EVERY_MS = 10_000;

export function GameGoneWatcher({ auth, gameId, exitHref }: { auth: LiveAuth; gameId: string; exitHref: string }) {
  const [gone, setGone] = useState(false);
  const checking = useRef(false);

  useEffect(() => {
    let stopped = false;
    async function check() {
      if (checking.current || stopped || document.visibilityState === "hidden") return;
      if (typeof navigator !== "undefined" && navigator.onLine === false) return;
      checking.current = true;
      try {
        const { exists } = await gameStillExists(auth, gameId);
        if (!stopped && !exists) setGone(true);
      } catch {
        // Offline or a hiccup: not proof the game's gone.
      } finally {
        checking.current = false;
      }
    }
    const timer = setInterval(check, CHECK_EVERY_MS);
    const onVisible = () => {
      if (document.visibilityState === "visible") void check();
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);
    return () => {
      stopped = true;
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
    };
    // auth is a fresh object each render; its contents don't change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gameId]);

  if (!gone) return null;
  return (
    <Modal label="This game was deleted">
      <h2 className="text-center text-lg font-bold text-ink">
        {auth.kind === "token" ? "This game's link no longer works" : "This game was deleted"}
      </h2>
      <p className="mt-2 text-center text-sm text-ink-dim">
        {auth.kind === "token"
          ? "The coach deleted the game or replaced its game-day link. Nothing more will save here."
          : "It was deleted on another screen. Nothing more will save here."}
      </p>
      <div className="mt-5">
        <SFButton href={exitHref} variant="primary" size="md" full>
          {auth.kind === "token" ? "Close" : "Back to games"}
        </SFButton>
      </div>
    </Modal>
  );
}
