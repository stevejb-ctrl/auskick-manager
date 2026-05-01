// Decorative AFL field-oval motif used as a background flourish on the
// marketing hero. Pure SVG — three concentric ellipses + crosshair lines.
// Per the design handoff (`marketing_handoff/prototype/sf/marketing.jsx`):
//
//   <FieldOval ... opacity={0.07} />
//
// Always rendered with very low opacity so it reads as a target/oval
// motif rather than as decoration competing with the copy.
interface FieldOvalProps {
  size?: number;
  /** Use the warm off-white stroke instead of ink — for use on dark surfaces. */
  dark?: boolean;
  className?: string;
}

export function FieldOval({ size = 900, dark = false, className = "" }: FieldOvalProps) {
  const stroke = dark ? "#F7F5F1" : "#1A1E1A";
  return (
    <svg
      width={size}
      height={size * 1.05}
      viewBox="0 0 200 220"
      className={className}
      aria-hidden="true"
    >
      <ellipse cx="100" cy="110" rx="80" ry="100" fill="none" stroke={stroke} strokeWidth="0.7" />
      <ellipse cx="100" cy="110" rx="55" ry="75" fill="none" stroke={stroke} strokeWidth="0.55" />
      <ellipse cx="100" cy="110" rx="30" ry="45" fill="none" stroke={stroke} strokeWidth="0.45" />
      <line x1="100" y1="10" x2="100" y2="210" stroke={stroke} strokeWidth="0.45" opacity="0.6" />
      <line x1="20" y1="110" x2="180" y2="110" stroke={stroke} strokeWidth="0.45" opacity="0.6" />
    </svg>
  );
}
