import { RevealOnScroll } from "@/components/marketing/RevealOnScroll";
import { MarketingAuthCTAs } from "@/components/marketing/MarketingAuthCTAs";

// Closing CTA. Dark field-green block so it reads as a decision point,
// not another feature section. The auth-aware CTA pair lives in
// MarketingAuthCTAs (client island) so this tree stays static.
export function FinalCTA() {
  return (
    <section className="bg-brand-800 text-warm">
      <div className="mx-auto max-w-4xl px-4 py-20 text-center sm:px-6 md:py-28">
        <RevealOnScroll>
          <h2 className="text-3xl font-bold tracking-tightest sm:text-4xl md:text-5xl">
            Ready for Saturday morning?
          </h2>
          <p className="mx-auto mt-5 max-w-xl text-lg text-brand-100">
            Set up your team in about five minutes. Free to use. Works on the
            phone you already have.
          </p>

          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <MarketingAuthCTAs variant="final" />
          </div>
        </RevealOnScroll>
      </div>
    </section>
  );
}
