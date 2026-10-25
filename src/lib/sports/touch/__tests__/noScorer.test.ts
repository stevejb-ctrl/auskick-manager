// Tries nobody was named for (UX audit, 23 Oct 2026): Oztag's share text
// read "5 def 1 · Tries: Chloe, Mason" with a girl's try missing, and the
// stats' tries (1 + 1) didn't add up to "Points for 5".

import { describe, expect, it } from "vitest";
import { buildTouchSummary } from "@/lib/sports/touch/summary";
import { replayTouchGame } from "@/lib/sports/touch/replay";
import { aggregateTouchSeason } from "@/lib/dashboard/touchAggregators";
import type { Player } from "@/lib/types";
import { FIELD, game } from "./touchGame";

const player = (id: string, full_name: string, jersey_number: number): Player => ({
  id,
  team_id: "t1",
  full_name,
  jersey_number,
  is_active: true,
  created_by: "u1",
  created_at: "2026-10-22T00:00:00Z",
  updated_at: "2026-10-22T00:00:00Z",
});

/** Chloe a try and a girl's try, Mason a try, and a girl's try nobody was named for. */
function oztagGame() {
  const g = game();
  g.lineup(FIELD);
  g.start(1);
  g.score("try", 1, "a");
  g.score("girls_try", 2, "a");
  g.score("try", 3, "d");
  g.score("girls_try", 4);
  g.score("opponent_try", 5);
  g.end(1, 20);
  return g;
}

describe("Oztag tries with no scorer", () => {
  it("puts them in the share text after the named tries", () => {
    const text = buildTouchSummary({
      teamName: "Us",
      opponentName: "Them",
      trackScoring: true,
      state: replayTouchGame(oztagGame().events),
      squad: [player("a", "Chloe Smith", 4), player("d", "Mason Lee", 9)],
      presentIds: [],
    });
    expect(text).toContain("Us 6 def Them 1");
    expect(text).toContain("🏉 Tries: Chloe (#4) 2, Mason (#9), +1 try (no scorer)");
  });

  it("says how many when there's more than one, and nothing when every try was named", () => {
    const g = game();
    g.lineup(FIELD);
    g.start(1);
    g.score("try", 1);
    g.score("girls_try", 2);
    g.end(1, 20);
    const summary = (events: typeof g.events) =>
      buildTouchSummary({ teamName: "Us", opponentName: "Them", trackScoring: true, state: replayTouchGame(events), squad: [], presentIds: [] });
    expect(summary(g.events)).toContain("🏉 Tries: +2 tries (no scorer)");
    expect(summary(oztagGame().events.filter((e) => !(e.type === "girls_try" && !e.player_id)))).not.toContain("no scorer");
  });

  it("adds them to the season's stats, so the kids' points and theirs make points for", () => {
    const agg = aggregateTouchSeason([{ id: "x" }], { x: oztagGame().events });
    expect(agg.totals.pointsFor).toBe(6);
    expect(agg.perPlayer.a).toMatchObject({ tries: 2, points: 3 });
    expect(agg.perPlayer.d).toMatchObject({ tries: 1, points: 1 });
    expect(agg.noScorer).toEqual({ tries: 1, points: 2 });
    const kids = Object.values(agg.perPlayer).reduce((s, r) => s + r.points, 0);
    expect(kids + agg.noScorer.points).toBe(agg.totals.pointsFor);
  });
});
