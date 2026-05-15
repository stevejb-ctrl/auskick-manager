import { PulseDot } from "@/components/ui/PulseDot";
import { WarmUpPhrases } from "@/components/ui/WarmUpPhrases";

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
//
// Steve 2026-05-15: WarmUpPhrases sits below the pulse — the kids
// are warming up pre-game. Gives the coach something to read
// while the tab content streams in.
export default function TeamLoading() {
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
