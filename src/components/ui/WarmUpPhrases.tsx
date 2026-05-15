"use client";

import { useEffect, useState } from "react";

// Default warm-up phrase set — drawn from how kids actually warm up
// before a junior AFL match. Friendly, in-domain, slightly winking.
// The trailing ellipsis on each phrase reinforces "this is in
// progress" without needing a spinner annotation.
//
// MUST stay in sync with the same set in
// mobile/ios/App/App/AppDelegate.swift (`warmUpPhrases`). Both
// surfaces — the iOS cold-start splash and the in-app loading.tsx —
// are the same loading moment from the user's perspective, so the
// copy should match exactly. If you change the set here, also
// update the Swift array; regenerate the iOS build via
// `npx cap sync ios`.
const DEFAULT_PHRASES = [
  "Lacing the boots…",
  "Star jumps…",
  "Stretching the hammies…",
  "Practising marks…",
  "Spreading the cones…",
  "High knees…",
  "Pumping up the footy…",
  "Limbering up…",
  "Coach's pre-game chat…",
  "Tossing the coin…",
];

interface WarmUpPhrasesProps {
  /** Override the default set. Useful for sport-specific copy. */
  phrases?: string[];
  /** Milliseconds between phrase swaps. Default 1500ms. */
  intervalMs?: number;
  /** Tailwind classes for the rendered span. */
  className?: string;
}

/**
 * Warm-up phrase cycler shown under the PulseDot loader. Phrases
 * rotate every ~1.5s with a soft crossfade — the perceived-
 * performance hack: a 2s wait with something to read feels
 * shorter than a 2s wait with a single spinner.
 *
 * Phrasing leans into the Auskick metaphor: kids warming up
 * pre-game (lacing boots, star jumps, practising marks). Keeps
 * the loader feeling like part of the app's voice, not a
 * generic "Loading…".
 *
 * Reduced-motion: the crossfade is gated on motion-safe so users
 * with reduced-motion preference get instant phrase swaps. The
 * cycling itself doesn't stop — the phrase text is the value;
 * the fade is decoration.
 */
export function WarmUpPhrases({
  phrases = DEFAULT_PHRASES,
  intervalMs = 1500,
  className = "text-xs font-medium text-ink-dim",
}: WarmUpPhrasesProps) {
  const [idx, setIdx] = useState(0);

  useEffect(() => {
    if (phrases.length <= 1) return;
    const id = window.setInterval(() => {
      setIdx((i) => (i + 1) % phrases.length);
    }, intervalMs);
    return () => window.clearInterval(id);
  }, [phrases.length, intervalMs]);

  // Re-keyed span so React unmounts + remounts on each new
  // index, restarting the `animate-fade-in` keyframe from frame
  // 0. The previous phrase doesn't animate out — for short
  // loaders the hard cut on exit is unnoticeable, and managing
  // two simultaneously-mounted phrases adds complexity for no
  // visual win.
  return (
    <span
      key={idx}
      role="status"
      aria-live="polite"
      className={`motion-safe:animate-fade-in ${className}`}
    >
      {phrases[idx]}
    </span>
  );
}
