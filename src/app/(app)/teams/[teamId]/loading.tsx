import { PulseDot } from "@/components/ui/PulseDot";

// Loading fallback for navigation INSIDE a team (Home ↔ Squad ↔
// Games ↔ Stats ↔ Settings). This file scopes the pulse to the
// inner page area, leaving the team layout — back-link, team name,
// TeamNav tab bar — visible the whole time.
//
// Why it matters (Steve 2026-05-13): without this, the route
// transition cascades up to (app)/loading.tsx, which replaces ALL
// of (app)'s children including the team layout. On a slow page
// load the tabs visually vanish, and the user's second tap lands
// on the empty pulse area instead of a tab — so it felt like the
// tabs were intermittently unresponsive.
//
// This loader fires for the page segment under teams/[teamId]/...
// while keeping TeamNav (and its tab bar) painted, so subsequent
// taps can still hit the right target.
export default function TeamLoading() {
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
