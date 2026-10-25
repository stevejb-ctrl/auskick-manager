import type { SurfaceArt } from "@/lib/sports/types";

// ─── SurfaceMotif ────────────────────────────────────────────
// A faint outline of the sport's own playing surface, for decorative
// corners like the team home's "Next up" card. Every team used to get
// AFL's oval there, courts and pitches included (ten-sport UX audit,
// 23 Oct 2026). The sport says which outline it plays on
// (`SportConfig.surfaceArt`); this only draws it.
//
// One 200 × 220 frame, portrait like the oval, so every outline sits in
// the same slot. Strokes use currentColor; the caller sets colour and
// opacity. Shapes are recognisable, not to scale.

interface SurfaceMotifProps {
  art: SurfaceArt;
  width?: number;
  height?: number;
  className?: string;
}

// The rectangle every non-oval surface sits in.
const L = 30;
const R = 170;
const T = 10;
const B = 210;
const CX = 100;
const CY = 110;

function Frame() {
  return <rect x={L} y={T} width={R - L} height={B - T} strokeWidth="1.5" />;
}

function Halfway() {
  return <line x1={L} y1={CY} x2={R} y2={CY} strokeWidth="1" />;
}

/** A line across the surface at `y`, solid or dashed. */
function Across({ y, dashed = false }: { y: number; dashed?: boolean }) {
  return (
    <line x1={L} y1={y} x2={R} y2={y} strokeWidth="1" strokeDasharray={dashed ? "4 4" : undefined} opacity={dashed ? 0.7 : 1} />
  );
}

/** Rugby posts standing on a try line. */
function Posts({ y }: { y: number }) {
  return (
    <g strokeWidth="1.25">
      <line x1={92} y1={y - 8} x2={92} y2={y + 8} />
      <line x1={108} y1={y - 8} x2={108} y2={y + 8} />
      <line x1={92} y1={y} x2={108} y2={y} />
    </g>
  );
}

function Shapes({ art }: { art: SurfaceArt }) {
  switch (art) {
    case "oval":
      return (
        <>
          <ellipse cx={CX} cy={CY} rx="80" ry="100" strokeWidth="1.5" />
          <ellipse cx={CX} cy={CY} rx="55" ry="75" strokeWidth="1" />
          <line x1={CX} y1="35" x2={CX} y2="185" strokeWidth="1" opacity="0.6" />
        </>
      );
    case "netball-court":
      return (
        <>
          <Frame />
          <Across y={T + (B - T) / 3} />
          <Across y={T + ((B - T) * 2) / 3} />
          <path d={`M 70 ${T} A 30 30 0 0 0 130 ${T}`} strokeWidth="1" />
          <path d={`M 70 ${B} A 30 30 0 0 1 130 ${B}`} strokeWidth="1" />
          <circle cx={CX} cy={CY} r="8" strokeWidth="1" />
        </>
      );
    case "rugby-field":
      return (
        <>
          <Frame />
          <Across y={30} />
          <Across y={190} />
          <Halfway />
          <Across y={70} dashed />
          <Across y={150} dashed />
          <Posts y={30} />
          <Posts y={190} />
        </>
      );
    case "touch-field":
      return (
        <>
          <Frame />
          <Across y={25} />
          <Across y={195} />
          <Halfway />
          <Across y={65} dashed />
          <Across y={155} dashed />
        </>
      );
    case "soccer-pitch":
      return (
        <>
          <Frame />
          <Halfway />
          <circle cx={CX} cy={CY} r="22" strokeWidth="1" />
          <rect x="62" y={T} width="76" height="34" strokeWidth="1" />
          <rect x="62" y={B - 34} width="76" height="34" strokeWidth="1" />
          <rect x="84" y={T} width="32" height="12" strokeWidth="1" />
          <rect x="84" y={B - 12} width="32" height="12" strokeWidth="1" />
        </>
      );
    case "futsal-court":
      return (
        <>
          <Frame />
          <Halfway />
          <circle cx={CX} cy={CY} r="16" strokeWidth="1" />
          <path d={`M 58 ${T} A 30 30 0 0 0 82 ${T + 30} L 118 ${T + 30} A 30 30 0 0 0 142 ${T}`} strokeWidth="1" />
          <path d={`M 58 ${B} A 30 30 0 0 1 82 ${B - 30} L 118 ${B - 30} A 30 30 0 0 1 142 ${B}`} strokeWidth="1" />
        </>
      );
    case "hockey-pitch":
      return (
        <>
          <Frame />
          <Halfway />
          <Across y={60} />
          <Across y={160} />
          <path d={`M 58 ${T} A 42 32 0 0 0 142 ${T}`} strokeWidth="1" />
          <path d={`M 58 ${B} A 42 32 0 0 1 142 ${B}`} strokeWidth="1" />
        </>
      );
    case "basketball-court":
      return (
        <>
          <Frame />
          <Halfway />
          <circle cx={CX} cy={CY} r="14" strokeWidth="1" />
          <rect x="80" y={T} width="40" height="44" strokeWidth="1" />
          <rect x="80" y={B - 44} width="40" height="44" strokeWidth="1" />
          <path d={`M 44 ${T} A 58 64 0 0 0 156 ${T}`} strokeWidth="1" />
          <path d={`M 44 ${B} A 58 64 0 0 1 156 ${B}`} strokeWidth="1" />
        </>
      );
  }
}

export function SurfaceMotif({ art, width = 240, height = 260, className = "" }: SurfaceMotifProps) {
  return (
    <svg
      aria-hidden="true"
      data-surface={art}
      className={className}
      width={width}
      height={height}
      viewBox="0 0 200 220"
      fill="none"
      stroke="currentColor"
    >
      <Shapes art={art} />
    </svg>
  );
}
