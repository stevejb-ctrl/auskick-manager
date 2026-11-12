import type { TitleParts } from "@/lib/sports/brand-copy";

interface TitleAccentProps {
  parts: TitleParts;
  /** Class for the accent word when no `accentColor` is given. Defaults to brand-500. */
  italicClassName?: string;
  /**
   * The accent word's colour: a sport's accent on the chalk page, or sun
   * on a field band (BAND_ACCENT). Inline, because it's data. Wins over
   * `italicClassName`.
   */
  accentColor?: string;
}

/**
 * A heading split into `before` + accent + `after`.
 *
 * The accent word is COLOUR ONLY: the heading's own font, weight and
 * slant. Never italic, never Instrument Serif. The `italic` field name
 * (and `italicClassName`) is left over from an older design and kept so
 * the CMS-edited JSON keeps its shape.
 *
 * If `italic` is empty (some headings stay plain), the parts just
 * concatenate with no markup.
 */
export function TitleAccent({ parts, italicClassName, accentColor }: TitleAccentProps) {
  const { before, italic, after } = parts;
  if (!italic) {
    return <>{`${before}${after}`}</>;
  }
  return (
    <>
      {before}
      {accentColor ? (
        <span style={{ color: accentColor }}>{italic}</span>
      ) : (
        <span className={italicClassName ?? "text-brand-500"}>{italic}</span>
      )}
      {after}
    </>
  );
}
