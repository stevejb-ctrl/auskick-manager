import type { TitleParts } from "@/lib/sports/brand-copy";

interface TitleAccentProps {
  parts: TitleParts;
  /**
   * Class override for the accent word. Defaults to brand-500 — the
   * per-host accent (footy green / netball sky-blue). Use
   * `text-warm/90` on the dark overlay card so the accent reads on
   * the ink background; use `text-ink-dim` on the centerpiece's
   * "Nothing you don't." half so the accent reads softer.
   *
   * Ignored if `accentColor` is set (inline style wins).
   */
  italicClassName?: string;
  /**
   * Optional hex colour for the accent word. The multi-sport
   * homepage passes the active sport's accent here so the
   * "breeze" / "fair" / etc. word matches the picker tile and hero
   * eyebrow. When unset, falls back to the className path
   * (typically brand-500). Inline style because the colour is a
   * runtime data value, not a Tailwind token.
   */
  accentColor?: string;
}

/**
 * Renders a heading split into `before` + accent `italic` + `after`.
 *
 * Note on naming: the prop is still called `italic` (and the override
 * `italicClassName`) for backwards compatibility with the existing
 * `TitleParts` shape — but the accent is no longer rendered in italic
 * Instrument Serif. Per the design refresh the accent word stays in
 * the same Geist 700 weight as the rest of the heading; only the
 * colour changes (the per-host brand-500 hue does the emphasis).
 *
 * If `italic` is empty (some headings stay plain), the parts just
 * concatenate with no markup.
 */
export function TitleAccent({
  parts,
  italicClassName,
  accentColor,
}: TitleAccentProps) {
  const { before, italic, after } = parts;
  if (!italic) {
    return <>{`${before}${after}`}</>;
  }
  // accentColor wins over className — inline style takes precedence
  // and is the path the multi-sport homepage uses to thread the
  // active sport's hex through.
  if (accentColor) {
    return (
      <>
        {before}
        <span style={{ color: accentColor }}>{italic}</span>
        {after}
      </>
    );
  }
  return (
    <>
      {before}
      <span className={italicClassName ?? "text-brand-500"}>
        {italic}
      </span>
      {after}
    </>
  );
}
