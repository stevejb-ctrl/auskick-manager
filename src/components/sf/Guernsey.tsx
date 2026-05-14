"use client";

import { useEffect, useRef, useState } from "react";

interface GuernseyProps {
  /** Player jersey number. */
  num: number | string;
  /** Outer SVG size in px. Default 36. */
  size?: number;
  /** T-shirt fill colour. CSS string. Default ink. */
  color?: string;
  /** Number ink colour. CSS string. Default warm. */
  ink?: string;
  className?: string;
}

/**
 * T-shirt SVG with a player number printed on it. Used in the Bench
 * grid, the on-field tile sub-line, and the goal-kickers leaderboard.
 *
 * Defaults to ink-on-warm so it reads as the team's home strip; pass
 * `color` to tint per zone (forward / centre / back) on the list-viz
 * lineup screen.
 *
 * When the `num` prop changes after first mount, the displayed
 * digit briefly slides + scales in (the `digit-flip` keyframe) so
 * jersey-number edits in Settings → Squad don't read as silent
 * state-swaps. First mount renders the digit statically — only
 * subsequent changes animate. P2-4 in MICRO-INTERACTIONS-PLAN.md.
 *
 * `"use client"` is intentional: this component used to be a pure
 * server-renderable atom, but the number-change animation needs a
 * useRef sentinel + useState bump. The render cost is tiny and
 * Guernsey instances appear in already-client trees (live game
 * field, bench, availability list, etc.) so no SSR regressions.
 */
export function Guernsey({
  num,
  size = 36,
  color = "#1A1E1A", // ink
  ink = "#F7F5F1", // warm
  className = "",
}: GuernseyProps) {
  // 2-digit numbers (10–99) need a slightly smaller font to stay inside
  // the shirt body. Single digits get a chunkier scale so the badge
  // reads at a glance from a metre away on the boundary.
  const numStr = String(num);
  const fontSize = numStr.length >= 2 ? 14 : 17;

  // Re-key the <text> element on number change so React re-mounts
  // it and the CSS animation runs from frame 0. First mount keeps
  // animKey at 0 → the conditional class below skips the animation,
  // so a freshly-rendered Guernsey doesn't auto-flip just because
  // it appeared.
  const [animKey, setAnimKey] = useState(0);
  const prevNumRef = useRef(numStr);
  useEffect(() => {
    if (prevNumRef.current === numStr) return;
    prevNumRef.current = numStr;
    setAnimKey((k) => k + 1);
  }, [numStr]);

  // Stable id per render so multiple guernseys on the same page don't
  // share a clip path. Strips non-alphanum so non-numeric `num`
  // values still produce a valid id.
  const clipId = `guernsey-clip-${numStr.replace(/[^a-z0-9]/gi, "")}`;

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 40 40"
      className={`shrink-0 ${className}`}
      aria-hidden="true"
    >
      <defs>
        <clipPath id={clipId}>
          <path d="M9 9 L14 5 Q20 8 26 5 L31 9 L34 14 L29 17 L29 33 Q20 35 11 33 L11 17 L6 14 Z" />
        </clipPath>
      </defs>
      <path
        d="M9 9 L14 5 Q20 8 26 5 L31 9 L34 14 L29 17 L29 33 Q20 35 11 33 L11 17 L6 14 Z"
        fill={color}
        stroke="rgba(0,0,0,0.15)"
        strokeWidth="0.5"
      />
      <text
        key={animKey}
        x="20"
        y="26"
        textAnchor="middle"
        fontFamily="var(--font-geist-mono), ui-monospace, monospace"
        fontSize={fontSize}
        fontWeight="800"
        fill={ink}
        clipPath={`url(#${clipId})`}
        // transform-origin needs to be the digit's centre (20, 26 in
        // viewBox coords) so the scale-up/down keyframe stays
        // centred on the number rather than the SVG top-left.
        style={{ transformOrigin: "20px 26px", transformBox: "fill-box" }}
        className={
          animKey > 0 ? "motion-safe:animate-digit-flip" : undefined
        }
      >
        {numStr}
      </text>
    </svg>
  );
}
