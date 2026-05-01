import type { TitleParts } from "@/lib/sports/brand-copy";

interface TitleAccentProps {
  parts: TitleParts;
  /**
   * Color override for the italic accent. Defaults to inheriting from
   * the surrounding heading. Use `text-ink-dim` on the centerpiece's
   * "Nothing you don’t." half so the italic reads softer.
   */
  italicClassName?: string;
}

/**
 * Renders a heading split into `before` + Instrument Serif italic
 * `italic` + `after`. The italic is the brand's defining type move —
 * always weight 400, always italic, never anything else.
 *
 * If `italic` is empty (some headings stay plain), the parts just
 * concatenate with no markup — the surrounding sans-serif heading
 * keeps its weight and tracking.
 */
export function TitleAccent({ parts, italicClassName }: TitleAccentProps) {
  const { before, italic, after } = parts;
  if (!italic) {
    return <>{`${before}${after}`}</>;
  }
  return (
    <>
      {before}
      <em
        className={`font-serif font-normal italic ${italicClassName ?? ""}`}
      >
        {italic}
      </em>
      {after}
    </>
  );
}
