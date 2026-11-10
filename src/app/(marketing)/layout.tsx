import { MarketingBanner } from "@/components/marketing/MarketingBanner";
import { MarketingHeader } from "@/components/marketing/MarketingHeader";
import { MarketingFooter } from "@/components/marketing/MarketingFooter";
import { FeedbackFab } from "@/components/feedback/FeedbackFab";

// Dedicated marketing shell. Pages under (marketing)/ share the
// banner + header + footer chrome here so the authenticated app
// (under (app)/) and the marketing site live in fully separate
// shells — the app no longer feels like an overlay on the website.
//
// The page is the app's chalk (`bg-warm`, live v3): the reading sections
// sit on it, and the field bands (FieldBand) paint each sport's surface
// over it (docs/marketing/V3-SITE-DESIGN.md).
//
// `theme-light` pins the marketing site to the light palette on a dark
// phone: its screenshots and the chalk page are drawn for light, and the
// dark theme is the app's (25 Oct 2026). The bands are the same in both.
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
    <div className="theme-light min-h-screen bg-warm">
      <MarketingBanner />
      <MarketingHeader />
      {children}
      <MarketingFooter />
      {/* Always-visible presales FAB. Marketing has no /live screens,
          so explicit empty array — self-documenting that the FAB
          should show on every marketing route (homepage, contact,
          help index, policy pages). Submissions are anonymous;
          server action requires a typed email so Steve can reply. */}
      <FeedbackFab kind="presales" hiddenOnPathSuffixes={[]} />
    </div>
  );
}
