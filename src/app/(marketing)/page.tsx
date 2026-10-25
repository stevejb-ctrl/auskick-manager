import type { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { HeroCarousel } from "@/components/marketing/HeroCarousel";
import { MultiSportHomeContent } from "@/components/marketing/MultiSportHomeContent";
import { NativeMarketingBounce } from "@/components/marketing/NativeMarketingBounce";
import { JsonLd } from "@/components/seo/JsonLd";
import { getBrand } from "@/lib/brand";
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
      {/* HeroCarousel replaces the previous host-resolved <Hero />
          on the unified homepage — auto-rotates AFL → League →
          Union → Netball every ~4.5s with shared headline / sub /
          CTAs and a per-sport eyebrow + phone-mock screenshot.
          Pauses on hover, hides auto-rotate for prefers-reduced-
          motion. Dedicated brand sites (sirenfooty.com.au etc.)
          could swap this back to the host-resolved <Hero /> via a
          branch on getBrand() if a per-host hero ever needs to
          return. */}
      <HeroCarousel />
      {/* All sport-aware content below the hero lives inside
          MultiSportHomeContent — a single client island that owns the
          active-sport state (with localStorage persistence) and
          threads it through:
            • MultiSportSection (the picker itself)
            • TrustBand          (per-sport stats)
            • ScrollingFeatures  (per-sport feature scroll)
            • FinalCTA           (per-sport closing CTA + AppStoreBadge)
          The hero above stays server-rendered + host-resolved —
          sirenfooty.com.au lands on the AFL hero, sirennetball.com.au
          on the netball hero. The picker is for visitors exploring
          "what does Siren look like in OTHER sports", not for
          swapping their landed-on context. */}
      <MultiSportHomeContent />
    </main>
  );
}
