import type { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { FinalCTA } from "@/components/marketing/FinalCTA";
import { HomeHero } from "@/components/marketing/HomeHero";
import { NativeMarketingBounce } from "@/components/marketing/NativeMarketingBounce";
import { SharedFeatures } from "@/components/marketing/SharedFeatures";
import { SportDirectory } from "@/components/marketing/SportDirectory";
import { TrustBand } from "@/components/marketing/TrustBand";
import { JsonLd } from "@/components/seo/JsonLd";
import { getBrand } from "@/lib/brand";
import { HOME_CONTENT } from "@/lib/marketing/homeContent";
import { siteUrl } from "@/lib/seo";
import { PRICE, sportsSentence } from "@/lib/siren-facts";
import { getBrandCopy } from "@/lib/sports/brand-copy";
import {
  organizationJsonLd,
  softwareApplicationJsonLd,
  websiteJsonLd,
} from "@/lib/structured-data";
import { getUser } from "@/lib/supabase/server";

// Explicit canonical so Search Console doesn't flag the apex
// (`sirenfooty.com.au/`) and www variants as "Duplicate without
// user-selected canonical". Resolves against `metadataBase` set in
// the root layout.
//
// The homepage covers every sport, so its title and description do
// too (the root layout's are the brand's own, AFL on sirenfooty). The
// sports and price come from src/lib/siren-facts.ts.
export const metadata: Metadata = {
  title: "Siren: fair rotations and subs for junior footy, netball, league and more",
  description: `Fair rotations, subs and live scores for junior ${sportsSentence()}. ${PRICE.line}.`,
  alternates: { canonical: "/" },
};

/**
 * The homepage: the front door to ten sports (design canvas, 22 Oct
 * 2026). It pitches what's the same in every sport and sends each coach
 * to their own sport's page (/netball, /afl, …), where that sport's
 * rules and feature tour live. It used to be one sport's page with a
 * picker that re-skinned it in the browser, which at ten sports hid
 * most of the content from crawlers and put five rows of cards on a
 * phone before any of it.
 *
 * All server-rendered: the hero, a strip of true facts, the sport
 * directory, the six shared features, and the sign-up section.
 */
export default async function Home() {
  // Authenticated users skip the marketing site entirely — the
  // app should feel native, not "marketing page with an app
  // overlaid on it". Server-side redirect before any render so
  // there's no flash of marketing content.
  const {
    data: { user },
  } = await getUser();
  if (user) {
    // Steve 2026-05-13: prefer the last-accessed-team cookie so a
    // returning user lands in the team they care about, not the
    // multi-team list. Cookie is set by middleware on every
    // /teams/[id] visit; falls back to /dashboard if it's missing
    // (first-time login) or stale (the team page itself handles the
    // lost-access case).
    const lastTeam = cookies().get("siren-last-team")?.value;
    redirect(lastTeam ? `/teams/${lastTeam}` : "/dashboard");
  }

  const site = siteUrl();
  const copy = getBrandCopy(getBrand().id);

  return (
    <main>
      {/* Structured data: who makes Siren, the site, and the app. */}
      <JsonLd data={organizationJsonLd(site)} />
      <JsonLd data={websiteJsonLd(site, copy.productName)} />
      <JsonLd data={softwareApplicationJsonLd(site, copy.productName)} />
      {/* Belt-and-braces redirect off marketing for native Capacitor
          users. The canonical fix is in capacitor.config.ts +
          middleware.ts, but TestFlight Build 1 was archived before
          those changes landed (server.url still points at "/"), so
          first-launch unauth users on Build 1 land here. This
          component bounces them to /login client-side. Becomes
          dead code once Build 2+ replaces every Build 1 install. */}
      <NativeMarketingBounce />
      <HomeHero />
      <TrustBand entries={HOME_CONTENT.trustBand} />
      <SportDirectory />
      <SharedFeatures
        eyebrow="Whatever you coach"
        heading={{ before: "Everything you need to make game day a ", accent: "breeze", after: "." }}
        intro="The same six things in every sport. Shown here in five of them."
      />
      <FinalCTA copy={HOME_CONTENT.finalCta} showAppStoreBadge />
    </main>
  );
}
