import { MarketingBanner } from "@/components/marketing/MarketingBanner";
import { MarketingHeader } from "@/components/marketing/MarketingHeader";
import { MarketingFooter } from "@/components/marketing/MarketingFooter";
import { FeedbackFab } from "@/components/feedback/FeedbackFab";

// Dedicated marketing shell. Pages under (marketing)/ share the
// banner + header + footer chrome here so the authenticated app
// (under (app)/) and the marketing site live in fully separate
// shells — the app no longer feels like an overlay on the website.
//
// The mint gradient backdrop is scoped to this wrapper (not the body)
// so it only shows on the public marketing surface. The authenticated
// app keeps the warm cream `bg-warm` body backdrop from globals.css.
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
    <div className="min-h-screen bg-gradient-to-b from-brand-50 to-brand-100">
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
