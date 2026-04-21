"use client";

import { useEffect, useState, type ReactNode } from "react";
import { PulseRing } from "@/components/brand/PulseRing";

interface KickoffPulseWrapperProps {
  /** ISO timestamp of the scheduled kickoff. Null = no window. */
  scheduledAt: string | null;
  /**
   * How far around `scheduledAt` counts as "in the kickoff window".
   * Default ±30 min — wide enough for early arrivals and late kickoffs.
   */
  windowMinutes?: number;
  /** Corner radius to match the wrapped button. Default `md`. */
  radius?: "md" | "lg" | "full";
  children: ReactNode;
}

/**
 * Wraps a call-to-action button (typically "Start game") with a slow
 * alarm-orange pulse when the current time is inside the kickoff
 * window. Draws the coach's eye to the action they almost certainly
 * opened the page to take.
 *
 * Re-checks every 30 sec so the pulse appears/disappears as the window
 * opens and closes, without forcing a page reload.
 */
export function KickoffPulseWrapper({
  scheduledAt,
  windowMinutes = 30,
  radius = "md",
  children,
}: KickoffPulseWrapperProps) {
  const [inWindow, setInWindow] = useState(false);

  useEffect(() => {
    if (!scheduledAt) {
      setInWindow(false);
      return;
    }
    const target = new Date(scheduledAt).getTime();
    if (Number.isNaN(target)) return;

    const check = () => {
      const diff = Math.abs(Date.now() - target);
      setInWindow(diff <= windowMinutes * 60_000);
    };
    check();
    const id = window.setInterval(check, 30_000);
    return () => window.clearInterval(id);
  }, [scheduledAt, windowMinutes]);

  return (
    <span className="relative inline-flex text-alarm">
      {inWindow && <PulseRing variant="slow" radius={radius} />}
      <span className="relative inline-flex">{children}</span>
    </span>
  );
}
