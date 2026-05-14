// Pure math for the count-up animation in PulsingNumber.tsx.
// Lives outside the .tsx component so it's importable from vitest
// (which runs in a Node environment without JSX transforms).
//
// P0-6 in .planning/MICRO-INTERACTIONS-PLAN.md — the count-up
// reads as "the number has arrived" via cubic-out easing. Linear
// easing would read as "still arriving" and feels less confident.

// Cubic-out easing: fast start, slow end. Matches Material 3's
// standard easing intent for value updates.
export function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - t, 3);
}

/**
 * Compute the displayed integer at progress `t` (0..1) of a count-up
 * from `from` to `to`. Clamps t and rounds the result so the
 * displayed integer never overshoots or fractionates between frames.
 */
export function countUpAt(from: number, to: number, t: number): number {
  const clamped = Math.max(0, Math.min(1, t));
  const eased = easeOutCubic(clamped);
  return Math.round(from + (to - from) * eased);
}
