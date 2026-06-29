// Shared colour key for the per-player time-in-zone bars.
//
// The bars encode zone purely by colour (forward = orange `zone-f`,
// centre = green `zone-c`, back = blue `zone-b`), which is impossible
// to read at a glance without a key — Steve 2026-06-29: "I'm having
// trouble remembering what each colour is when I glance at the game
// time bar." This renders that key ONCE per screen so every bar below
// it is instantly legible.
//
// Sport-agnostic by design (CLAUDE.md cross-sport rule): AFL, netball
// and rugby league all share the same palette, so they all consume
// this verbatim and only vary the labels (Fwd/Centre/Back vs Attack/
// Centre/Defence). Order items the SAME way the bar segments render
// (forward-first) so position reinforces colour.

export type ZoneLegendItem = {
  /** Short, sentence-case label, e.g. "Fwd", "Centre", "Defence". */
  label: string;
  /** Tailwind background class for the swatch, e.g. "bg-zone-f". */
  swatchClassName: string;
  /** Tailwind text-colour class for the label, e.g. "text-zone-f". */
  textClassName: string;
};

export function ZoneTimeLegend({
  items,
  className = "",
}: {
  items: ZoneLegendItem[];
  className?: string;
}) {
  return (
    <div
      className={`flex flex-wrap items-center gap-x-3 gap-y-1 ${className}`}
      aria-label="Time-in-zone colour key"
    >
      {items.map((it) => (
        <span key={it.label} className="flex items-center gap-1">
          <span
            aria-hidden="true"
            className={`h-2 w-2 shrink-0 rounded-[2px] ${it.swatchClassName}`}
          />
          <span
            className={`font-mono text-[10px] font-bold uppercase tracking-micro ${it.textClassName}`}
          >
            {it.label}
          </span>
        </span>
      ))}
    </div>
  );
}
