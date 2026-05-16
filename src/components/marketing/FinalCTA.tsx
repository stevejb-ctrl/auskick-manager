import { RevealOnScroll } from "@/components/marketing/RevealOnScroll";
import { MarketingAuthCTAs } from "@/components/marketing/MarketingAuthCTAs";

// Closing CTA. Ink-on-dark block so it reads as a decision point, not
// another feature section. The auth-aware CTA pair lives in
// MarketingAuthCTAs (client island) so this tree stays static.
//
// Headline pulls "five" out in the sport accent — the only place on the
// page where a single word breaks the type into colour. Eyebrow above
// in translucent mono caps per the Field Sunday spec.
export function FinalCTA() {
  return (
    <section className="bg-ink text-warm">
      <div className="mx-auto max-w-4xl px-4 py-20 text-center sm:px-6 md:py-28">
        <RevealOnScroll>
          <p className="font-mono text-[11px] font-bold uppercase tracking-micro text-warm/50">
            Saturday morning is coming
          </p>
          <h2 className="mt-4 text-3xl font-bold tracking-section leading-[0.98] text-balance sm:text-4xl md:text-5xl">
            Set up your team in about{" "}
            <span className="text-accent">five</span> minutes.
          </h2>
          <p className="mx-auto mt-5 max-w-xl text-lg text-warm/70">
            Free to use. Works on the phone you already have.
          </p>

          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <MarketingAuthCTAs variant="final" />
          </div>
        </RevealOnScroll>
      </div>
    </section>
  );
}
