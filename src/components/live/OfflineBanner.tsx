"use client";

import { useOnline } from "@/lib/live/useOnline";

interface OfflineBannerProps {
  /**
   * Custom copy to override the default "You're offline." line.
   * Use to set the right tone per-screen — "Game create needs
   * internet" reads differently from a quarter-break "We'll
   * sync when you're back online".
   */
  message?: string;
}

// Renders nothing when the device is online — zero pixels, zero
// layout impact. Only mounts visible content when useOnline()
// flips to false.
export function OfflineBanner({ message }: OfflineBannerProps) {
  const online = useOnline();
  if (online) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="flex items-start gap-2 rounded-md border border-warn/30 bg-warn-soft px-3 py-2 text-xs text-warn"
    >
      <OfflineDot />
      <p className="leading-relaxed">
        {message ?? "You're offline. Changes won't save until you reconnect."}
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
