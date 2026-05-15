import { PulseDot } from "@/components/ui/PulseDot";
import { WarmUpPhrases } from "@/components/ui/WarmUpPhrases";

// Next.js renders this whenever a route segment under (app)/ is
// resolving — including the initial RSC fetch on navigation from
// one team page to another, or from the dashboard into a game.
// The (app) layout (header + footer) stays visible; only the
// <main>'s children get swapped for this fallback until the new
// page.tsx is ready.
//
// One file here means every navigation inside the authenticated
// shell gets the pulse — no per-page Suspense wiring required.
// Individual deeper routes can override with their own loading.tsx
// if they want a different fallback (e.g., the live-game page
// might want a skeleton field).
//
// Steve 2026-05-15: added WarmUpPhrases so route transitions
// feel like the kids are warming up pre-game — "Lacing the
// boots…", "Star jumps…", "Practising marks…". Perceived-
// performance hack: a 2s wait with something to read feels
// shorter than a 2s wait with a silent spinner.
export default function AppLoading() {
  return (
    <div
      className="flex min-h-[40vh] flex-col items-center justify-center gap-4"
      aria-label="Loading"
    >
      <PulseDot size="lg" />
      <WarmUpPhrases />
    </div>
  );
}
