// Loading boundary for /live. Steve 2026-05-15: the post-end-of-
// quarter router.refresh() (LiveGame.handleEndQuarter, wrapped in
// startTransition) was supposed to keep the existing live UI
// painted while the server-rendered tree refetched — React's
// concurrent-transition semantics keep the previous Suspense
// content mounted UNLESS a new boundary mounts during the
// transition. The closest pre-existing fallback was the
// team-level (app)/teams/[teamId]/loading.tsx — a big centred
// PulseDot + warm-up phrases. Refreshes from /live were hitting
// that, producing a "page goes white for a couple of seconds
// and refreshes" beat right after the QuarterEndModal's
// "Select team for Q{n+1}" tap.
//
// This file installs a tighter Suspense boundary at /live with a
// `null` fallback. The team-level loading.tsx still fires when
// you NAVIGATE into the team segment (Home/Squad/Games/Stats/
// Settings tab swap) — that's the right place for the brand
// pulse — but in-route refreshes of /live now keep the live game
// painted under the transition, no fallback flash.

export default function LiveLoading() {
  return null;
}
