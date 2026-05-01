import { getBrand } from "@/lib/brand";
import { getBrandCopy } from "@/lib/sports/brand-copy";

// Quiet horizontal strip between the hero and the features section.
// Three or four short phrases set in mono uppercase, separated by tiny
// alarm dots on desktop and stacked on phones. Kept truthful on
// purpose — the prototype's "1,200+ COACHES / 38k GAMES TRACKED" stats
// would be inventing numbers we don't have. These phrases hold the
// same band weight without making claims.
export function TrustBand() {
  const brand = getBrand();
  const { trustBand } = getBrandCopy(brand.id);
  return (
    <section
      aria-label="What Siren is"
      className="border-b border-hairline bg-surface-alt"
    >
      <div className="mx-auto flex max-w-6xl flex-col items-center justify-center gap-3 px-4 py-6 sm:flex-row sm:flex-wrap sm:gap-x-5 sm:gap-y-2 sm:px-6 sm:py-8">
        {trustBand.map((item, i) => (
          <div
            key={item}
            className="flex items-center gap-2 font-mono text-[11px] font-semibold uppercase tracking-[0.16em] text-ink-dim sm:text-[12px]"
          >
            <span
              aria-hidden="true"
              className="block h-1 w-1 rounded-full bg-alarm"
            />
            <span>{item}</span>
            {i < trustBand.length - 1 && (
              <span
                aria-hidden="true"
                className="ml-3 hidden text-ink-mute/60 sm:inline"
              >
                ·
              </span>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}
