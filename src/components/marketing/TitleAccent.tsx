import type { TitleParts } from "@/lib/sports/brand-copy";

interface TitleAccentProps {
  parts: TitleParts;
  /**
   * Class override for the accent word. Defaults to brand-500 — the
   * per-host accent (footy green / netball sky-blue). Use
   * `text-warm/90` on the dark overlay card so the accent reads on
   * the ink background; use `text-ink-dim` on the centerpiece's
   * "Nothing you don't." half so the accent reads softer.
   */
  italicClassName?: string;
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
export function TitleAccent({ parts, italicClassName }: TitleAccentProps) {
  const { before, italic, after } = parts;
  if (!italic) {
    return <>{`${before}${after}`}</>;
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
