import { AppStoreBadge } from "@/components/marketing/AppStoreBadge";
import { BAND_ACCENT } from "@/components/marketing/bandStyles";
import { FieldBand } from "@/components/marketing/FieldBand";
import { MarketingAuthCTAs } from "@/components/marketing/MarketingAuthCTAs";
import { TitleAccent } from "@/components/marketing/TitleAccent";
import type { MarketingSurface } from "@/lib/sports/marketing-sports";
import type { BrandCopy } from "@/lib/sports/brand-copy";
import type { SportId } from "@/lib/sports/types";

interface FinalCTAProps {
  copy: Pick<BrandCopy, "finalCtaEyebrow" | "finalCtaTitle" | "finalCtaBody">;
  /** The App Store badge: the iOS app is Siren Footy, so not on every page. */
  showAppStoreBadge: boolean;
  /** Whose ground it's on: a sport page's own; grass and the oval otherwise. */
  surface?: MarketingSurface;
  marks?: SportId;
}

/**
 * The sign-up at the foot of a page, back on the ground: the page's
 * surface (a sport page's own, grass elsewhere) with its centre marked,
 * and the one hi-vis action. The eyebrow is the moment ("Saturday
 * morning is coming"), set as the app's dim margin words are.
 */
export function FinalCTA({ copy, showAppStoreBadge, surface = "field", marks = "afl" }: FinalCTAProps) {
  return (
    <FieldBand id="signup" surface={surface} marks={marks} markOpacity={0.12} markFit="meet" labelledBy="signup-heading">
      <div className="mx-auto max-w-3xl px-4 py-20 text-center sm:px-6 md:py-28">
        <p className="font-display text-[1.0625rem] font-bold text-mark/75 stretch-80">{copy.finalCtaEyebrow}</p>
        <h2
          id="signup-heading"
          className="mt-3 font-display text-[clamp(2.5rem,6vw,4.25rem)] font-extrabold leading-[0.98] stretch-80 [text-wrap:balance]"
        >
          <TitleAccent parts={copy.finalCtaTitle} accentColor={BAND_ACCENT} />
        </h2>
        <p className="mx-auto mt-5 max-w-xl text-lg leading-relaxed text-mark/85">{copy.finalCtaBody}</p>
        <div className="mt-9 flex flex-wrap items-center justify-center gap-3">
          <MarketingAuthCTAs variant="final" />
          {showAppStoreBadge && <AppStoreBadge theme="dark" />}
        </div>
      </div>
    </FieldBand>
  );
}
