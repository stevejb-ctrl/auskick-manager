import { RevealOnScroll } from "@/components/marketing/RevealOnScroll";
import { TitleAccent } from "@/components/marketing/TitleAccent";
import { MarketingAuthCTAs } from "@/components/marketing/MarketingAuthCTAs";
import { getBrand } from "@/lib/brand";
import { getBrandCopy } from "@/lib/sports/brand-copy";

// Closing CTA. Dark ink block per the design handoff so it reads as a
// decision point — not another feature section. The italic accent in
// the headline (Instrument Serif 400) is the brand's signature type
// move; auth-aware buttons live in MarketingAuthCTAs (client island)
// so this tree stays static.
export function FinalCTA() {
  const brand = getBrand();
  const copy = getBrandCopy(brand.id);
  return (
    <section
      id="signup"
      className="relative overflow-hidden border-t border-ink/40 bg-ink text-warm"
    >
      <div className="mx-auto max-w-3xl px-4 py-20 text-center sm:px-6 md:py-28">
        <RevealOnScroll>
          <p className="font-mono text-[11px] font-semibold uppercase tracking-micro text-warm/55">
            {copy.finalCtaEyebrow}
          </p>
          <h2 className="mt-4 text-3xl font-bold leading-[1.02] tracking-tightest text-warm [text-wrap:balance] sm:text-4xl md:text-5xl lg:text-6xl">
            <TitleAccent parts={copy.finalCtaTitle} />
          </h2>
          <p className="mx-auto mt-5 max-w-xl text-base text-warm/70 sm:text-lg">
            {copy.finalCtaBody}
          </p>

          <div className="mt-9 flex flex-wrap items-center justify-center gap-3">
            <MarketingAuthCTAs variant="final" />
          </div>
        </RevealOnScroll>
      </div>
    </section>
  );
}
