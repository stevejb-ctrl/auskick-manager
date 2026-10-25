// Typed loader for the homepage's CMS copy (content/marketing/home.json,
// editable in Pages CMS). The sports themselves aren't here: the
// directory and the chips list them from src/lib/sports/marketing-sports.ts,
// and src/lib/__tests__/sirenFacts.test.ts checks the counts in this
// copy against src/lib/siren-facts.ts.

import type { BrandCopy } from "@/lib/sports/brand-copy";
import rawContent from "../../../content/marketing/home.json";

export interface HomeContent {
  hero: {
    /** Small caps over the headline. */
    eyebrow: string;
    /** Big sport-agnostic h1 at the top of the homepage. */
    headline: string;
    /** Sentence under the headline. */
    subtitle: string;
  };
  /** Four true facts in a strip under the hero: a big stat, a small label. */
  trustBand: ReadonlyArray<{ stat: string; label: string }>;
  /** The dark sign-up section at the foot of the page (FinalCTA). */
  finalCta: Pick<BrandCopy, "finalCtaEyebrow" | "finalCtaTitle" | "finalCtaBody">;
}

export const HOME_CONTENT = rawContent as HomeContent;
