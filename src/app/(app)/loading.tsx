import { PulseDot } from "@/components/ui/PulseDot";

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
export default function AppLoading() {
  return (
    <div
      className="flex min-h-[40vh] items-center justify-center"
      role="status"
      aria-label="Loading"
    >
      <PulseDot size="lg" />
    </div>
  );
}
