// A game's result follows the scores kept in THAT game, not the team's
// switch today (UX round 3, 24 Oct 2026): a hockey game played with
// scoring off read "0 drew with 0" once scoring was turned back on, and
// AFL's Head-to-head counted a scoring-off game as a draw.

import { describe, expect, it } from "vitest";
import { scoresKept } from "@/lib/results";
import { aggregateSoccerSeason } from "@/lib/dashboard/soccerAggregators";
import { computeHeadToHead } from "@/lib/dashboard/aggregators";
import { replayGame } from "@/lib/dashboard/eventReplay";
import type { Game, GameEvent } from "@/lib/types";

let n = 0;
function ev(gameId: string, type: string, metadata: Record<string, unknown> = {}, playerId: string | null = null): GameEvent {
  n++;
  return {
    id: `e${n}`,
    game_id: gameId,
    type,
    player_id: playerId,
    metadata,
    created_by: null,
    created_at: new Date(Date.UTC(2026, 9, 24, 9, 0, n)).toISOString(),
  } as GameEvent;
}

const snap = (trackScoring?: boolean) => ({ playbook_snapshot: trackScoring === undefined ? null : { trackScoring } });

describe("scoresKept", () => {
  const goal = [ev("g", "goal", { quarter: 1, elapsed_ms: 1 }, "a")];

  it("goes by the game's own record from kick-off, whatever the switch says now", () => {
    expect(scoresKept("hockey", snap(false), true, [])).toBe(false);
    expect(scoresKept("hockey", snap(true), false, goal)).toBe(true);
  });

  it("for a game played before that record: a score means kept, else the team's switch", () => {
    expect(scoresKept("hockey", snap(), false, goal)).toBe(true);
    expect(scoresKept("hockey", snap(), true, [])).toBe(true);
    expect(scoresKept("hockey", snap(), false, [])).toBe(false);
  });
});

describe("results leave out games with no score kept", () => {
  const lineup = { keeper: "k", lines: { def: ["a"], mid: ["b"], att: [], field: [] }, bench: [] };
  const played = (id: string, ours: number) => [
    ev(id, "lineup_set", { lineup }),
    ev(id, "quarter_start", { quarter: 1 }),
    ...Array.from({ length: ours }, () => ev(id, "goal", { quarter: 1, elapsed_ms: 60_000 }, "a")),
    ev(id, "quarter_end", { quarter: 1, elapsed_ms: 1_200_000 }),
  ];

  it("soccer's won · drawn · lost and goals", () => {
    const events = new Map([
      ["won", played("won", 2)],
      ["off", played("off", 0)],
    ]);
    const agg = aggregateSoccerSeason([{ id: "won" }, { id: "off" }], events, (id) => id !== "off");
    expect(agg.totals).toMatchObject({ games: 2, wins: 1, draws: 0, losses: 0, goalsFor: 2 });
  });

  it("AFL's head-to-head", () => {
    const game = (id: string) => ({ id, opponent: "Crocs", status: "completed" }) as Game;
    const h2h = computeHeadToHead([game("off")], [replayGame("off", [])], () => false);
    expect(h2h).toEqual([]);
  });
});
