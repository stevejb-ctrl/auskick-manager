// The game-day link's loader: on the way in (from the demo picker, the
// group chat) and from Who's here to the lineup, the app's loader rather
// than the last screen sitting still or a blank one (Stagehand round 11,
// #4). Nothing over a refresh of the screen already on the page: see
// GameDayLoading.

import { GameDayLoading } from "@/components/live/GameDayLoading";

export default function RunLoading() {
  return <GameDayLoading />;
}
