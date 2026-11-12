"use client";

import { useEffect, useRef, useState } from "react";

/**
 * The '+N' ghost that rises off a side's score buttons when its total
 * goes up — '+6' for an AFL goal, '+1' for a behind or a netball goal —
 * confirming which side the tap landed on. Null at mount and on a
 * decrease (an undo).
 */
export function useScoreGhost(total: number) {
  const prev = useRef(total);
  const [ghost, setGhost] = useState<{ text: string; key: number } | null>(null);
  useEffect(() => {
    const delta = total - prev.current;
    prev.current = total;
    if (delta <= 0) return;
    setGhost({ text: `+${delta}`, key: Date.now() });
    const t = window.setTimeout(() => setGhost(null), 800);
    return () => window.clearTimeout(t);
  }, [total]);
  return ghost;
}

/** The ghost's markup: anchored over the button row's leading edge. */
export const SCORE_GHOST =
  "pointer-events-none absolute -top-5 font-mono text-[0.8125rem] font-bold text-brand-600 motion-safe:animate-ghost-rise motion-reduce:animate-ghost-fade";

interface RollingNumberProps {
  value: number | string;
  className?: string;
  /** Start the roll this many ms after the change (the G·B tally trails the total by 40). */
  delayMs?: number;
}

/**
 * A scorebug number that rolls one slot when it changes (design session
 * 17 Oct 2026): the old value slides out the top as the new one rises
 * in from below — reversed for a decrease (an undo). Old and new share
 * one grid cell, clipped with clip-path rather than overflow:hidden so
 * the number keeps its text baseline beside the G·B tally. Reduced
 * motion: a 120ms crossfade instead of the roll.
 */
export function RollingNumber({ value, className = "", delayMs = 0 }: RollingNumberProps) {
  const prevRef = useRef(value);
  const [roll, setRoll] = useState<{ from: number | string; dir: "up" | "down"; key: number } | null>(null);

  useEffect(() => {
    const prev = prevRef.current;
    if (prev === value) return;
    prevRef.current = value;
    const up = typeof value === "number" && typeof prev === "number" ? value > prev : true;
    setRoll({ from: prev, dir: up ? "up" : "down", key: Date.now() });
    const t = window.setTimeout(() => setRoll(null), 240 + delayMs + 40);
    return () => window.clearTimeout(t);
  }, [value, delayMs]);

  if (!roll) return <span className={className}>{value}</span>;

  const style = { animationDelay: `${delayMs}ms` };
  return (
    <span className="inline-grid [clip-path:inset(0)]" key={roll.key}>
      <span
        aria-hidden
        style={style}
        className={`[grid-area:1/1] ${className} motion-reduce:hidden ${
          roll.dir === "up" ? "motion-safe:animate-roll-out-up" : "motion-safe:animate-roll-out-down"
        }`}
      >
        {roll.from}
      </span>
      <span
        style={style}
        className={`[grid-area:1/1] ${className} motion-reduce:animate-xfade-in ${
          roll.dir === "up" ? "motion-safe:animate-roll-in-up" : "motion-safe:animate-roll-in-down"
        }`}
      >
        {value}
      </span>
    </span>
  );
}
