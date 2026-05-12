import { MarketingBanner } from "@/components/marketing/MarketingBanner";
import { MarketingHeader } from "@/components/marketing/MarketingHeader";
import { MarketingFooter } from "@/components/marketing/MarketingFooter";

// Dedicated marketing shell. Pages under (marketing)/ share the
// banner + header + footer chrome here so the authenticated app
// (under (app)/) and the marketing site live in fully separate
// shells — the app no longer feels like an overlay on the website.
//
// Pages keep their own <main> element so per-page width/padding
// classes (max-w-3xl on policy pages, full-bleed on the home hero,
// etc.) stay exactly where they are.
export default function MarketingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      <MarketingBanner />
      <MarketingHeader />
      {children}
      <MarketingFooter />
    </>
  );
}
