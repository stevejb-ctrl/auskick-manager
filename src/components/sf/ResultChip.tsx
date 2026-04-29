type Result = "win" | "loss" | "draw";

interface ResultChipProps {
  result: Result;
  /** Optional size override in px. Defaults to 22 (Form-line size). */
  size?: number;
}

const RESULT_MAP: Record<Result, { ch: string; bg: string; fg: string; label: string }> = {
  win: { ch: "W", bg: "bg-win-soft", fg: "text-win", label: "Won" },
  loss: { ch: "L", bg: "bg-loss-soft", fg: "text-loss", label: "Lost" },
  draw: { ch: "D", bg: "bg-draw-soft", fg: "text-draw", label: "Drew" },
};

/**
 * Round W / L / D disc — used in the Home Form line, Games list result
 * column, and the Last-result card eyebrow. Letter-form is part of the
 * accessibility contract (don't rely on colour alone).
 */
export function ResultChip({ result, size = 22 }: ResultChipProps) {
  const m = RESULT_MAP[result];
  return (
    <span
      role="img"
      aria-label={m.label}
      className={`inline-flex shrink-0 items-center justify-center rounded-full font-mono font-bold ${m.bg} ${m.fg}`}
      style={{ width: size, height: size, fontSize: Math.round(size * 0.5) }}
    >
      {m.ch}
    </span>
  );
}
