"use client";

// ─── LiveSync ────────────────────────────────────────────────
// Keeps a live page in step with the other phone on the same game (the
// coach's and a parent's game-day link): every few seconds while the page
// is in view (and at once when the page mounts, comes back into view or
// back online, or a write is refused), it asks the game's sync route for the game's stamp
// (lib/live/liveSyncStamp.ts) and refreshes the page when the server's
// differs from the one the page was rendered with. A refresh brings the
// other phone's events in; each screen merges them as it does its own
// (useOptimisticEvents' reconcile for the replay sports, AFL's store
// re-init, netball's replay). UX round 2 (24 Oct 2026): the phones never
// synced, so the coach missed the runner's scores, quarter starts and
// full time until a reload.
//
// Mounted once per live page (coach's and runner's), above whichever
// screen the game is on: the lineup picker, the live game, a break or
// full time. It also shows the notices of lib/live/liveSync.ts ("Another
// phone already started Q2").
//
// A poll, not Supabase realtime: the runner's phone is signed out, and
// row-level security keeps game_events from it.

import { startTransition, useCallback, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { onLiveSyncRequest, useLiveNotice } from "@/lib/live/liveSync";

/** How often a phone in view checks the game. */
const SYNC_INTERVAL_MS = 3000;
/** How long a notice stays up. */
const NOTICE_MS = 6000;

export function LiveSync({ stamp, syncUrl }: { stamp: string | null; syncUrl: string }) {
  const router = useRouter();
  const stampRef = useRef(stamp);
  stampRef.current = stamp;
  // The stamp a refresh was asked for, and the page's stamp then: one
  // refresh per change, and another only once that one has landed.
  const asked = useRef<{ remote: string; page: string | null } | null>(null);
  const goneRefreshed = useRef(false);
  const inFlight = useRef(false);

  const check = useCallback(async () => {
    if (inFlight.current || document.visibilityState !== "visible") return;
    if (typeof navigator !== "undefined" && navigator.onLine === false) return;
    inFlight.current = true;
    try {
      const res = await fetch(syncUrl, { cache: "no-store", headers: { accept: "application/json" } });
      if (res.status === 404) {
        // The game (or this link) is gone: the page will say so.
        if (!goneRefreshed.current) {
          goneRefreshed.current = true;
          startTransition(() => router.refresh());
        }
        return;
      }
      if (!res.ok) return;
      const body = (await res.json().catch(() => null)) as { stamp?: unknown } | null;
      const remote = typeof body?.stamp === "string" ? body.stamp : null;
      if (remote === null) return;
      if (remote === stampRef.current) {
        asked.current = null;
        return;
      }
      if (asked.current && asked.current.remote === remote && asked.current.page === stampRef.current) return;
      asked.current = { remote, page: stampRef.current };
      startTransition(() => router.refresh());
    } catch {
      // Offline or a blip: the next check tries again.
    } finally {
      inFlight.current = false;
    }
  }, [router, syncUrl]);

  useEffect(() => {
    // At once: the page may be a stale copy (the service worker serves the
    // cached HTML on a slow link) — round 3 saw the pre-kickoff screen of a
    // game already under way.
    void check();
    const id = window.setInterval(() => void check(), SYNC_INTERVAL_MS);
    const onBack = () => {
      if (document.visibilityState === "visible") void check();
    };
    document.addEventListener("visibilitychange", onBack);
    window.addEventListener("focus", onBack);
    window.addEventListener("online", onBack);
    const off = onLiveSyncRequest(() => void check());
    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", onBack);
      window.removeEventListener("focus", onBack);
      window.removeEventListener("online", onBack);
      off();
    };
  }, [check]);

  return <LiveNotice />;
}

/** The line a phone should see as its page catches up with the game. */
function LiveNotice() {
  const notice = useLiveNotice((s) => s.notice);
  const clear = useLiveNotice((s) => s.clear);
  useEffect(() => {
    if (!notice) return;
    const t = window.setTimeout(() => clear(notice.id), NOTICE_MS);
    return () => window.clearTimeout(t);
  }, [notice, clear]);
  if (!notice) return null;
  return (
    <div className="pointer-events-none fixed inset-x-4 top-[calc(env(safe-area-inset-top)+0.75rem)] z-[70] mx-auto flex max-w-md justify-center">
      <div
        role="status"
        aria-live="polite"
        data-testid="live-sync-notice"
        className="pointer-events-auto flex items-start gap-2 rounded-md border border-warn/30 bg-warn-soft py-2 pl-3 pr-1 text-sm font-medium text-warn shadow-pop motion-safe:animate-slide-in-bottom"
      >
        <span aria-hidden className="mt-1.5 inline-block h-2 w-2 shrink-0 rounded-full bg-warn" />
        <span className="py-0.5">{notice.text}</span>
        <button
          type="button"
          onClick={() => clear(notice.id)}
          aria-label="Dismiss"
          className="-my-1 shrink-0 px-2 py-1 font-mono text-base leading-none text-warn/80 hover:text-warn"
        >
          ×
        </button>
      </div>
    </div>
  );
}
