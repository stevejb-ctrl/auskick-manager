import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { MarketingBanner } from "@/components/marketing/MarketingBanner";
import { MarketingHeader } from "@/components/marketing/MarketingHeader";
import { Hero } from "@/components/marketing/Hero";
import { TrustBand } from "@/components/marketing/TrustBand";
import { ScrollingFeatures } from "@/components/marketing/ScrollingFeatures";
import { FinalCTA } from "@/components/marketing/FinalCTA";
import { MarketingFooter } from "@/components/marketing/MarketingFooter";
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
    redirect("/dashboard");
  }

  const brand = getBrand();
  const copy = getBrandCopy(brand.id);

  return (
    <>
      <MarketingBanner />
      <MarketingHeader />
      <main>
        <Hero />
        <TrustBand />
        <ScrollingFeatures features={copy.features} centerpiece={copy.centerpiece} />
        <FinalCTA />
      </main>
      <MarketingFooter />
    </>
  );
}
