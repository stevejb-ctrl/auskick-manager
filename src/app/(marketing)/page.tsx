import type { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { Hero } from "@/components/marketing/Hero";
import { TrustBand } from "@/components/marketing/TrustBand";
import { ScrollingFeatures } from "@/components/marketing/ScrollingFeatures";
import { FinalCTA } from "@/components/marketing/FinalCTA";
import { NativeMarketingBounce } from "@/components/marketing/NativeMarketingBounce";
import { getBrand } from "@/lib/brand";
import { getBrandCopy } from "@/lib/sports/brand-copy";
import { getUser } from "@/lib/supabase/server";

// Explicit canonical so Search Console doesn't flag the apex
// (`sirenfooty.com.au/`) and www variants as "Duplicate without
// user-selected canonical". Resolves against `metadataBase` set in
// the root layout.
export const metadata: Metadata = {
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

  const brand = getBrand();
  const copy = getBrandCopy(brand.id);

  return (
    <main>
      {/* Belt-and-braces redirect off marketing for native Capacitor
          users. The canonical fix is in capacitor.config.ts +
          middleware.ts, but TestFlight Build 1 was archived before
          those changes landed (server.url still points at "/"), so
          first-launch unauth users on Build 1 land here. This
          component bounces them to /login client-side. Becomes
          dead code once Build 2+ replaces every Build 1 install. */}
      <NativeMarketingBounce />
      <Hero />
      <TrustBand />
      <ScrollingFeatures
        features={copy.features}
        centerpiece={copy.centerpiece}
      />
      <FinalCTA />
    </main>
  );
}
