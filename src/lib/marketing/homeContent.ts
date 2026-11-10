// The homepage's own words: content/marketing/home.json (CMS-edited).

import type { BrandCopy } from "@/lib/sports/brand-copy";
import rawContent from "../../../content/marketing/home.json";

export interface HomeContent {
  hero: {
    /** Big sport-agnostic h1 at the top of the homepage. */
    headline: string;
    /** Sentence under the headline. */
    subtitle: string;
  };
  /** Four true facts along the hero's foot: a number, then what it counts. */
  trustBand: ReadonlyArray<{ stat: string; label: string }>;
  /** The sign-up band at the foot of the page (FinalCTA). */
  finalCta: Pick<BrandCopy, "finalCtaEyebrow" | "finalCtaTitle" | "finalCtaBody">;
}

export const HOME_CONTENT = rawContent as HomeContent;
