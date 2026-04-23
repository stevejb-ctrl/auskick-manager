import { RevealOnScroll } from "@/components/marketing/RevealOnScroll";
import { MarketingAuthCTAs } from "@/components/marketing/MarketingAuthCTAs";
import { getBrand } from "@/lib/brand";
import { getBrandCopy } from "@/lib/sports/brand-copy";

// Closing CTA. Dark field-green block so it reads as a decision point,
// not another feature section. The auth-aware CTA pair lives in
// MarketingAuthCTAs (client island) so this tree stays static.
export function FinalCTA() {
  const brand = getBrand();
  const copy = getBrandCopy(brand.id);
  return (
    <section className="bg-brand-800 text-warm">
      <div className="mx-auto max-w-4xl px-4 py-20 text-center sm:px-6 md:py-28">
        <RevealOnScroll>
          <h2 className="text-3xl font-bold tracking-tightest sm:text-4xl md:text-5xl">
            {copy.finalCtaTitle}
          </h2>
          <p className="mx-auto mt-5 max-w-xl text-lg text-brand-100">
            {copy.finalCtaBody}
          </p>

          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <MarketingAuthCTAs variant="final" />
          </div>
        </RevealOnScroll>
      </div>
    </section>
  );
}
