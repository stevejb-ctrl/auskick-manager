import type { BrandCopy } from "@/lib/sports/brand-copy";

interface TrustBandProps {
  /** Trust-band entries to render. Server pages pass the host-
   *  resolved brand's stats; the multi-sport homepage's client
   *  wrapper passes per-active-sport stats. */
  entries: BrandCopy["trustBand"];
}

// Quiet horizontal stats strip between the hero and the features
// section. Per the design handoff (`MktTrustBand` in
// `marketing_handoff/prototype/sf/marketing.jsx`): a row of big
// tracking-tightest numerals each paired with a small uppercase
// mono label underneath. Two columns on phones, four on desktop.
//
// Component is props-only — the host-based brand resolution
// (previously inline via `getBrand()`) was moved out so the
// multi-sport homepage's client wrapper can import this file
// without pulling `next/headers` (server-only) across the client
// boundary. Static marketing pages resolve `entries` themselves
// and pass them down.
export function TrustBand({ entries }: TrustBandProps) {
  return (
    <section
      aria-label="At a glance"
      className="border-b border-hairline bg-surface"
    >
      <div className="mx-auto grid max-w-6xl grid-cols-2 gap-6 px-4 py-6 sm:grid-cols-4 sm:gap-8 sm:px-6 sm:py-8">
        {entries.map((item) => (
          // text-center across both breakpoints — previously
          // `sm:text-left` left-aligned content within each cell,
          // which pushed the four stats to the left edges of their
          // columns and made the whole bar feel weighted to the
          // left side (especially against the centred picker cards
          // directly above on the multi-sport homepage). Centring
          // each cell aligns with the cards' rhythm.
          <div key={item.label} className="text-center">
            <div className="text-2xl font-bold tracking-tightest text-ink sm:text-3xl">
              {item.stat}
            </div>
            <div className="mt-1 font-mono text-[10px] font-bold uppercase tracking-[0.14em] text-ink-mute">
              {item.label}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
