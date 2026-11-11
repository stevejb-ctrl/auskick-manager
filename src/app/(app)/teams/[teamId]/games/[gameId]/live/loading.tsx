// Loading boundary for /live. Steve 2026-05-15: the post-end-of-
// quarter router.refresh() (LiveGame.handleEndQuarter, wrapped in
// startTransition) was supposed to keep the existing live UI
// painted while the server-rendered tree refetched. Refreshes from
// /live were hitting the team-level loading.tsx (a big centred pulse),
// a "page goes white for a couple of seconds" beat after the
// QuarterEndModal's "Select team for Q{n+1}" tap. This boundary
// rendered nothing so in-route refreshes kept the live game painted.
//
// But the first way in, after Start game day, was then blank for as
// long as the server took (Stagehand round 11, #4; Steve: "Have the
// loader in there"). GameDayLoading shows the app's loader on the way
// in and still nothing over a refresh of the screen already on the page
// (the live layout marks it, GameDayScreen).

import { GameDayLoading } from "@/components/live/GameDayLoading";

export default function LiveLoading() {
  return <GameDayLoading />;
}
