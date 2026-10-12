"use client";

import type { ReactNode } from "react";
import type { PositionDef } from "@/lib/playbook/types";

const LINE_LABELS: { id: string; label: string }[] = [
  { id: "fwd", label: "FORWARD" },
  { id: "mid", label: "CENTRE" },
  { id: "back", label: "BACK" },
];

interface PositionsFieldProps {
  /** Positions with formation coordinates (0–1, attacking up the page). */
  positions: PositionDef[];
  renderPosition: (position: PositionDef) => ReactNode;
  ariaLabel: string;
}

/**
 * The AFL oval with named positions placed by formation coordinates
 * (UX plan §7.6 FieldFormation). Same pitch styling as the live
 * `Field` — oval boundary, centre circle, line labels down both sides —
 * so the positions editor reads as the field the coach plays on.
 */
export function PositionsField({ positions, renderPosition, ariaLabel }: PositionsFieldProps) {
  return (
    <div
      role="group"
      aria-label={ariaLabel}
      className="relative aspect-[3/4] w-full overflow-hidden bg-field shadow-card"
      style={{ borderRadius: "50% / 15%" }}
    >
      <div
        className="pointer-events-none absolute inset-x-5 inset-y-3 border border-white/10"
        style={{ borderRadius: "50%" }}
        aria-hidden
      />
      <div
        className="pointer-events-none absolute left-1/2 top-1/2 h-16 w-16 -translate-x-1/2 -translate-y-1/2 rounded-full border border-white/15"
        aria-hidden
      />
      <div className="pointer-events-none absolute inset-x-0 top-[34%] h-px bg-white/30" aria-hidden />
      <div className="pointer-events-none absolute inset-x-0 top-[66%] h-px bg-white/30" aria-hidden />
      {(["left", "right"] as const).map((side) => (
        <div
          key={side}
          aria-hidden
          className={`pointer-events-none absolute inset-y-6 flex flex-col justify-around ${
            side === "left" ? "left-1" : "right-1"
          }`}
        >
          {LINE_LABELS.map((l) => (
            <span
              key={l.id}
              className="font-mono text-[9px] font-bold uppercase tracking-micro text-white/50"
              style={{
                writingMode: "vertical-rl",
                transform: side === "left" ? "rotate(180deg)" : undefined,
              }}
            >
              {l.label}
            </span>
          ))}
        </div>
      ))}
      {/* Positions sit inside a padded box so corner spots clear the
          oval's curve. */}
      <div className="absolute inset-x-8 inset-y-6">
        {positions.map((p) => (
          <div
            key={p.key}
            className="absolute -translate-x-1/2 -translate-y-1/2"
            style={{ left: `${p.x * 100}%`, top: `${p.y * 100}%` }}
          >
            {renderPosition(p)}
          </div>
        ))}
      </div>
    </div>
  );
}
