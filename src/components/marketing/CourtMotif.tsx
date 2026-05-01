// ─── Court motif ────────────────────────────────────────────
// Decorative netball-court flourish used as a background motif
// on the marketing hero (parallel to FieldOval for AFL). Pure
// SVG — three thirds with painted dividers, two goal semicircles
// at the ends, and a centre circle. Always rendered with very
// low opacity so it reads as a target/court motif rather than
// decoration competing with the copy.
//
// Why a separate component instead of branching FieldOval?
// FieldOval's geometry (concentric ellipses + crosshair) is
// AFL-specific. Netball is a rectangle, not an oval — overloading
// FieldOval would require a `shape="oval" | "rect"` prop and the
// component would mostly be a switch. Keeping them as siblings
// matches how the brand assets are structured in design land.
interface CourtMotifProps {
  size?: number;
  /** Use the warm off-white stroke instead of ink — for use on dark surfaces. */
  dark?: boolean;
  className?: string;
}

export function CourtMotif({ size = 900, dark = false, className = "" }: CourtMotifProps) {
  const stroke = dark ? "#F7F5F1" : "#1A1E1A";
  // Court is rendered taller-than-wide (≈ 1:2.05 — actual netball
  // court is 30.5×15.25m, i.e. exactly 2:1) so the motif lands
  // cleanly in the same hero slot the FieldOval uses. The
  // 200×420 viewBox keeps stroke widths readable at any size.
  return (
    <svg
      width={size}
      height={size * 1.05}
      viewBox="0 0 200 420"
      className={className}
      aria-hidden="true"
    >
      {/* Outer court border. */}
      <rect
        x="10"
        y="10"
        width="180"
        height="400"
        fill="none"
        stroke={stroke}
        strokeWidth="0.7"
      />

      {/* Thirds dividers — at 1/3 and 2/3 court length. */}
      <line x1="10" y1="143.33" x2="190" y2="143.33" stroke={stroke} strokeWidth="0.55" />
      <line x1="10" y1="276.66" x2="190" y2="276.66" stroke={stroke} strokeWidth="0.55" />

      {/* Goal semicircles. Radius ~32 court-units, centred on the
          end midpoints. The arcs curve INWARD into the attack /
          defence thirds. */}
      <path
        d="M 68 10 A 32 32 0 0 0 132 10"
        fill="none"
        stroke={stroke}
        strokeWidth="0.55"
      />
      <path
        d="M 68 410 A 32 32 0 0 1 132 410"
        fill="none"
        stroke={stroke}
        strokeWidth="0.55"
      />

      {/* Centre circle. Single ring (not a centre square — that's
          AFL); radius 12 court-units, ink stroke. */}
      <circle
        cx="100"
        cy="210"
        r="12"
        fill="none"
        stroke={stroke}
        strokeWidth="0.45"
      />

      {/* Centre crosshair — extends through the middle third only,
          matching the way coaches read the centre band. Quiet
          opacity so it doesn't compete with the dividers. */}
      <line x1="100" y1="143.33" x2="100" y2="276.66" stroke={stroke} strokeWidth="0.45" opacity="0.6" />
    </svg>
  );
}
