"use client";

import { useOnline } from "@/lib/live/useOnline";
import { laneOf, useWriteQueue } from "@/lib/live/writeQueue";

interface OfflineBannerProps {
  /**
   * Custom copy to override the default "You're offline." line.
   * Use to set the right tone per-screen — "Game create needs
   * internet" reads differently from a quarter-break "We'll
   * sync when you're back online".
   */
  message?: string;
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

// Renders nothing when the device is online and every live write has
// saved — zero pixels, zero layout impact.
//
// It counts the live writes still on the phone (round-3 edge testing,
// 24 Oct 2026): "You're offline. Changes won't save until you reconnect"
// read as a promise the old queue broke after ~15 s, and nothing said how
// many taps were waiting. The queue now keeps every one, so the banner
// says how many, and for a write the server keeps refusing it offers
// Retry and Discard (Discard reloads, so the screen shows what's saved).
export function OfflineBanner({ message }: OfflineBannerProps) {
  const online = useOnline();
  const queue = useWriteQueue((s) => s.queue);
  const retryStuck = useWriteQueue((s) => s.retryStuck);
  const discard = useWriteQueue((s) => s.discard);
  const live = queue.filter((op) => laneOf(op.kind) === "game");
  const stuck = live.filter((op) => op.stuck);
  const struggling = live.some((op) => op.attemptCount > 0 || op.lastError);

  if (online && stuck.length > 0) {
    const why = stuck[0].lastError;
    return (
      <div
        role="alert"
        data-testid="offline-banner"
        className="flex flex-wrap items-center gap-2 rounded-md border border-warn/30 bg-warn-soft px-3 py-2 text-xs text-warn"
      >
        <OfflineDot />
        <p className="min-w-0 flex-1 leading-relaxed">
          {plural(stuck.length, "change", "changes")} couldn&apos;t save{why ? ` (${why})` : ""}.
          {live.length > stuck.length ? ` ${plural(live.length - stuck.length, "more waits", "more wait")} behind it.` : ""}
        </p>
        <button
          type="button"
          onClick={() => retryStuck()}
          className="min-h-11 rounded-sm bg-warn px-3 font-semibold text-white"
        >
          Retry
        </button>
        <button
          type="button"
          onClick={() => {
            for (const op of stuck) discard(op.id);
            // The screen still shows what was discarded: start again
            // from what's saved.
            window.location.reload();
          }}
          className="min-h-11 rounded-sm border border-warn/40 px-3 font-semibold text-warn"
        >
          Discard
        </button>
      </div>
    );
  }

  if (online) {
    if (live.length === 0 || !struggling) return null;
    return (
      <div
        role="status"
        aria-live="polite"
        data-testid="offline-banner"
        className="flex items-start gap-2 rounded-md border border-warn/30 bg-warn-soft px-3 py-2 text-xs text-warn"
      >
        <OfflineDot />
        <p className="leading-relaxed">Saving {plural(live.length, "change", "changes")}…</p>
      </div>
    );
  }

  return (
    <div
      role="status"
      aria-live="polite"
      data-testid="offline-banner"
      className="flex items-start gap-2 rounded-md border border-warn/30 bg-warn-soft px-3 py-2 text-xs text-warn"
    >
      <OfflineDot />
      <p className="leading-relaxed">
        {message ??
          (live.length > 0
            ? `You're offline. ${plural(live.length, "tap", "taps")} waiting to save — they'll send when you're back.`
            : "You're offline. Taps save on this phone and send when you're back.")}
      </p>
    </div>
  );
}

function OfflineDot() {
  return (
    <span
      aria-hidden="true"
      className="mt-1 inline-block h-2 w-2 shrink-0 rounded-full bg-warn"
    />
  );
}
