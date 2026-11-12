"use client";

import type { ReactNode } from "react";
import type { LineDef, PositionDef } from "@/lib/playbook/types";

interface PositionsFieldProps {
  /** Positions with formation coordinates (0–1, attacking up the page). */
  positions: PositionDef[];
  renderPosition: (position: PositionDef) => ReactNode;
  ariaLabel: string;
  /** Which field to draw: AFL's oval or rugby's rectangle. */
  field?: "afl" | "rugby";
  /** The sport's lines, for the labels down the sides. */
  lines?: LineDef[];
}

const AFL_LINE_LABELS = ["FORWARD", "CENTRE", "BACK"];

/**
 * The sport's field with named positions placed by formation
 * coordinates (UX plan §7.6 FieldFormation): AFL's oval with its
 * centre circle and line labels down both sides, or rugby's rectangle
 * with the halfway line — the same pitch styling as the live fields,
 * so the positions editor reads as the field the coach plays on.
 */
export function PositionsField({
  positions,
  renderPosition,
  ariaLabel,
  field = "afl",
  lines,
}: PositionsFieldProps) {
  const sideLabels =
    field === "afl"
      ? AFL_LINE_LABELS
      : (lines ?? []).map((l) => l.label.toUpperCase());
  return (
    <div
      role="group"
      aria-label={ariaLabel}
      className={`relative w-full overflow-hidden bg-field shadow-card ${
        field === "afl" ? "aspect-[3/4]" : "aspect-[4/5] rounded-md"
      }`}
      style={field === "afl" ? { borderRadius: "50% / 15%" } : undefined}
    >
      {field === "afl" ? (
        <>
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
        </>
      ) : (
        <>
          {/* Rugby pitch: touchlines, halfway line, a tryline band at
              each end — the same cues LeagueField draws live. */}
          <div className="pointer-events-none absolute inset-x-3 inset-y-2 border border-white/10" aria-hidden />
          <div className="pointer-events-none absolute inset-x-0 top-1/2 h-px bg-white/30" aria-hidden />
          <div className="pointer-events-none absolute inset-x-0 top-[6%] h-px bg-white/20" aria-hidden />
          <div className="pointer-events-none absolute inset-x-0 bottom-[6%] h-px bg-white/20" aria-hidden />
        </>
      )}
      {(["left", "right"] as const).map((side) => (
        <div
          key={side}
          aria-hidden
          className={`pointer-events-none absolute inset-y-6 flex flex-col justify-around ${
            side === "left" ? "left-1" : "right-1"
          }`}
        >
          {sideLabels.map((label) => (
            <span
              key={label}
              className="font-mono text-nano font-bold uppercase tracking-micro text-white/50"
              style={{
                writingMode: "vertical-rl",
                transform: side === "left" ? "rotate(180deg)" : undefined,
              }}
            >
              {label}
            </span>
          ))}
        </div>
      ))}
      {/* Positions sit inside a padded box so corner spots clear the
          field's edge (and the oval's curve on AFL). */}
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
