import { getBrand } from "@/lib/brand";
import { getBrandCopy } from "@/lib/sports/brand-copy";

// Quiet horizontal stats strip between the hero and the features section.
// Per the design handoff (`MktTrustBand` in
// `marketing_handoff/prototype/sf/marketing.jsx`): a row of big
// tracking-tightest numerals each paired with a small uppercase
// mono label underneath. Two columns on phones, four on desktop.
export function TrustBand() {
  const brand = getBrand();
  const { trustBand } = getBrandCopy(brand.id);
  return (
    <section
      aria-label="At a glance"
      className="border-b border-hairline bg-surface"
    >
      <div className="mx-auto grid max-w-6xl grid-cols-2 gap-6 px-4 py-6 sm:grid-cols-4 sm:gap-8 sm:px-6 sm:py-8">
        {trustBand.map((item) => (
          <div key={item.label} className="text-center sm:text-left">
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
