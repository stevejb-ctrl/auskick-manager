import type { CSSProperties } from "react";

// The Siren brand mark pulse, reusable as a loading indicator.
//
// Visually identical to the dot in SirenWordmark (`.siren-dot--pulsing`)
// but standalone — no wordmark, just the alarm-orange dot with the
// box-shadow halo that grows + fades. Reuses the `siren-pulse`
// keyframes already in globals.css so it brand-matches the in-app
// wordmark and the iOS splash halo.
//
// Use cases:
//   - <Button loading> spinner (see Button.tsx)
//   - Suspense fallback / route transition (see app/(app)/loading.tsx)
//   - Anywhere a small "something's happening" cue is needed
//
// Three scales tuned for typical contexts:
//   - sm  (10px dot)   inline in buttons / form rows
//   - md  (16px dot)   small section loaders
//   - lg  (28px dot)   full-page route-transition loaders
type Size = "sm" | "md" | "lg";

interface PulseDotProps {
  size?: Size;
  className?: string;
  /** Accessible label announced to screen readers. */
  label?: string;
}

const SCALE: Record<Size, { dot: number; pulseR: number }> = {
  // pulseR is the halo's max extent past the dot's edge — tuned to
  // match the SirenWordmark size scale's pulse-to-dot ratio.
  sm: { dot: 10, pulseR: 10 },
  md: { dot: 16, pulseR: 16 },
  lg: { dot: 28, pulseR: 28 },
};

export function PulseDot({
  size = "md",
  className = "",
  label = "Loading",
}: PulseDotProps) {
  const s = SCALE[size];

  // `--siren-pulse-r` is consumed by the `siren-pulse` keyframe in
  // globals.css to size the halo per-instance. CSS variable on inline
  // style is the cleanest way to pass it through without a Tailwind
  // arbitrary-value class per size.
  const style: CSSProperties = {
    width: s.dot,
    height: s.dot,
    background: "var(--siren-mark, #D9442D)",
    borderRadius: "50%",
    display: "inline-block",
    flexShrink: 0,
    ["--siren-pulse-r" as string]: `${s.pulseR}px`,
  } as CSSProperties;

  return (
    <span
      role="status"
      aria-label={label}
      className={`siren-dot--pulsing ${className}`}
      style={style}
    />
  );
}
