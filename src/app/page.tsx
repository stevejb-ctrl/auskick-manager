import { MarketingBanner } from "@/components/marketing/MarketingBanner";
import { MarketingHeader } from "@/components/marketing/MarketingHeader";
import { Hero } from "@/components/marketing/Hero";
import { ScrollingFeatures } from "@/components/marketing/ScrollingFeatures";
import { FinalCTA } from "@/components/marketing/FinalCTA";
import { MarketingFooter } from "@/components/marketing/MarketingFooter";
import { getBrand } from "@/lib/brand";
import { getBrandCopy } from "@/lib/sports/brand-copy";

export default function Home() {
  const brand = getBrand();
  const copy = getBrandCopy(brand.id);

  return (
    <>
      <MarketingBanner />
      <MarketingHeader />
      <main>
        <Hero />
        <ScrollingFeatures features={copy.features} />
        <FinalCTA />
      </main>
      <MarketingFooter />
    </>
  );
}
