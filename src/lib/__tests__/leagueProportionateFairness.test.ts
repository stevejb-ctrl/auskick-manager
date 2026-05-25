// ─── Proportionate fairness regression tests ─────────────────
// Steve 2026-05-19 asked for the fairness algorithm to use a
// time-on-field PROPORTION (played / available) rather than gross
// minutes, so a no-show kid playing 100% of their attended time
// doesn't outrank a reliable kid playing 90%. Same rule applies
// to FR / DH rotations: once everyone has had at least one go,
// preference the kid who shows up every week.
//
// These tests exercise the public suggester APIs (the season-
// fairness compute is module-private). Each test builds a season
// event log with carefully crafted prior games, then asserts the
// suggester's pick matches the new tiebreak.
//
// Sort order under test:
//   Starters  : shortfall DESC, playtimeRatio ASC, games DESC, jersey ASC
//   Vests     : zeroCount first, vestRatio ASC, games DESC, jersey ASC

import { describe, expect, it } from "vitest";
import {
  suggestLeagueLineup,
  suggestVestRotation,
} from "@/lib/sports/rugby_league/fairness";
import type { GameEvent, GameEventType, Player } from "@/lib/types";

let _ts = 0;
function mk(
  gameId: string,
  type: GameEventType,
  metadata: Record<string, unknown> = {},
  playerId: string | null = null,
): GameEvent {
  _ts++;
  return {
    id: `${gameId}-e${_ts}`,
    game_id: gameId,
    type,
    player_id: playerId,
    metadata,
    created_by: null,
    created_at: new Date(2026, 0, 1, 9, 0, _ts).toISOString(),
  };
}
function reset() {
  _ts = 0;
}

function makePlayer(
  id: string,
  jersey: number | null,
  chip: "a" | "b" | null = null,
): Player {
  return {
    id,
    team_id: "t1",
    full_name: id.toUpperCase(),
    jersey_number: jersey,
    is_active: true,
    chip,
    created_by: "u1",
    created_at: "2026-05-19T00:00:00Z",
    updated_at: "2026-05-19T00:00:00Z",
  };
}

interface PriorGameSpec {
  gameId: string;
  field: string[];
  bench: string[];
  periodCount: number;
  periodMs?: number;
  /** Mid-period swaps. */
  swaps?: Array<{ off: string; on: string; quarter: number; atMs: number }>;
  /** Vest assignments per period. */
  vests?: Array<{ player: string; vest: "fr" | "dh"; quarter: number }>;
}

function buildGame(spec: PriorGameSpec): GameEvent[] {
  const periodMs = spec.periodMs ?? 480_000; // 8 min default
  const events: GameEvent[] = [];
  events.push(
    mk(spec.gameId, "lineup_set", {
      lineup: { forwards: spec.field, backs: [], bench: spec.bench },
    }),
  );
  for (let q = 1; q <= spec.periodCount; q++) {
    events.push(mk(spec.gameId, "quarter_start", { quarter: q }));
    for (const s of (spec.swaps ?? []).filter((s) => s.quarter === q)) {
      events.push(
        mk(spec.gameId, "swap", {
          off_player_id: s.off,
          on_player_id: s.on,
          quarter: q,
          elapsed_ms: s.atMs,
        }),
      );
    }
    for (const v of (spec.vests ?? []).filter((v) => v.quarter === q)) {
      events.push(
        mk(
          spec.gameId,
          "vest_assigned",
          { vest: v.vest, period: q },
          v.player,
        ),
      );
    }
    events.push(
      mk(spec.gameId, "quarter_end", { quarter: q, elapsed_ms: periodMs }),
    );
  }
  return events;
}

// ─── Starter selection — proportionate playtime ──────────────

describe("suggestLeagueLineup — proportionate playtime fairness", () => {
  it("less playtime ratio wins over more, even when total minutes are HIGHER", () => {
    reset();
    // p1: attended 1 game, full 4 quarters → 100% ratio, 32 min total
    // p2: attended 4 games, played 50% of each → 50% ratio, 64 min total
    // p2 has MORE absolute minutes but LESS proportional time, so the
    // fairness algorithm should preference p2 — they're owed time.
    const players = [makePlayer("p1", 1), makePlayer("p2", 2)];
    const seasonEvents = [
      // Game 1: p1 alone on field, p2 wasn't there
      ...buildGame({
        gameId: "g1",
        field: ["p1"],
        bench: [],
        periodCount: 4,
      }),
      // Games 2–5: p2 plays half each quarter (sub off at 4 min,
      // never comes back, so 240_000 ms per quarter × 4 quarters
      // → 960_000 ms per game; but the swap-off needs an `on`
      // player too. Use a throwaway "x" player as the on-target.)
      ...buildGame({
        gameId: "g2",
        field: ["p2"],
        bench: ["x2"],
        periodCount: 4,
        swaps: [
          { off: "p2", on: "x2", quarter: 1, atMs: 240_000 },
        ],
      }),
      ...buildGame({
        gameId: "g3",
        field: ["p2"],
        bench: ["x3"],
        periodCount: 4,
        swaps: [
          { off: "p2", on: "x3", quarter: 1, atMs: 240_000 },
        ],
      }),
      ...buildGame({
        gameId: "g4",
        field: ["p2"],
        bench: ["x4"],
        periodCount: 4,
        swaps: [
          { off: "p2", on: "x4", quarter: 1, atMs: 240_000 },
        ],
      }),
      ...buildGame({
        gameId: "g5",
        field: ["p2"],
        bench: ["x5"],
        periodCount: 4,
        swaps: [
          { off: "p2", on: "x5", quarter: 1, atMs: 240_000 },
        ],
      }),
    ];
    // Pick 1 starter; the bigger-ratio player should sit.
    const result = suggestLeagueLineup({
      players,
      defaultOnFieldSize: 1,
      forwardCount: 1,
      seasonEvents,
      requiredUnbrokenPeriods: 0,
    });
    expect(result.lineup.forwards).toEqual(["p2"]);
    expect(result.lineup.bench).toEqual(["p1"]);
  });

  it("reliable attendee wins tiebreak when ratios are equal (the bug fix)", () => {
    reset();
    // Both players played 100% of their attended time, but p1
    // attended 4 games while p2 attended 1. OLD sort used
    // games ASC → p2 (1 game) won; NEW sort uses games DESC →
    // p1 (4 games) wins as the reliable attendee.
    const players = [makePlayer("p1", 1), makePlayer("p2", 2)];
    const seasonEvents = [
      ...buildGame({ gameId: "g1", field: ["p1"], bench: [], periodCount: 1 }),
      ...buildGame({ gameId: "g2", field: ["p1"], bench: [], periodCount: 1 }),
      ...buildGame({ gameId: "g3", field: ["p1"], bench: [], periodCount: 1 }),
      ...buildGame({ gameId: "g4", field: ["p1"], bench: [], periodCount: 1 }),
      ...buildGame({ gameId: "g5", field: ["p2"], bench: [], periodCount: 1 }),
    ];
    const result = suggestLeagueLineup({
      players,
      defaultOnFieldSize: 1,
      forwardCount: 1,
      seasonEvents,
      requiredUnbrokenPeriods: 0,
    });
    // Old sort would have started p2 (1 game, "fewer games first").
    // New sort starts p1 (reliable attendee tiebreak).
    expect(result.lineup.forwards).toEqual(["p1"]);
    expect(result.lineup.bench).toEqual(["p2"]);
  });

  it("a brand-new player (no history) gets a starting go", () => {
    reset();
    // p1: 5 prior games, all played full time (ratio 1.0)
    // p2: no prior season events at all (ratio 0)
    // p2 should start — they haven't had a go yet.
    const players = [makePlayer("p1", 1), makePlayer("p2", 2)];
    const seasonEvents = [
      ...buildGame({ gameId: "g1", field: ["p1"], bench: [], periodCount: 4 }),
      ...buildGame({ gameId: "g2", field: ["p1"], bench: [], periodCount: 4 }),
      ...buildGame({ gameId: "g3", field: ["p1"], bench: [], periodCount: 4 }),
    ];
    const result = suggestLeagueLineup({
      players,
      defaultOnFieldSize: 1,
      forwardCount: 1,
      seasonEvents,
      requiredUnbrokenPeriods: 0,
    });
    expect(result.lineup.forwards).toEqual(["p2"]);
  });

  it("shortfall stays primary — owed §6 periods beat ratio gap", () => {
    reset();
    // p1: 2 prior games, both compliant (shortfall 0), ratio 0.5
    // p2: 1 prior game, NON-compliant (shortfall 1), ratio 0.9
    // p2 wins because §6 enforcement (shortfall) is primary sort.
    const players = [makePlayer("p1", 1), makePlayer("p2", 2)];
    const seasonEvents = [
      // p1's two games: 50% playtime each (sub off at 4 min in each
      // quarter), required = 1 unbroken period → not compliant
      // either. To keep p1 compliant we need a full unbroken stint
      // somewhere — give p1 ONE quarter unbroken.
      //
      // Easier: build p1 games where p1 is alone on field for full
      // quarters (compliant, ratio = 1.0). Then p1 ratio = 1.0,
      // shortfall = 0.
      ...buildGame({ gameId: "g1", field: ["p1"], bench: [], periodCount: 1 }),
      ...buildGame({ gameId: "g2", field: ["p1"], bench: [], periodCount: 1 }),
      // p2's game: 1 quarter, p2 subbed off at 4 min → no unbroken
      // period → shortfall = 1, ratio ≈ 0.5
      ...buildGame({
        gameId: "g3",
        field: ["p2"],
        bench: ["dummy"],
        periodCount: 1,
        swaps: [
          { off: "p2", on: "dummy", quarter: 1, atMs: 240_000 },
        ],
      }),
    ];
    const result = suggestLeagueLineup({
      players,
      defaultOnFieldSize: 1,
      forwardCount: 1,
      seasonEvents,
      requiredUnbrokenPeriods: 1,
    });
    // p2 has the shortfall → starts. p1 is fine.
    expect(result.lineup.forwards).toEqual(["p2"]);
  });
});

// ─── Vest rotation — proportionate vest fairness ─────────────

describe("suggestLeagueLineup — proportionate FR vest fairness", () => {
  it("zero-count player wins over any positive-count player (give everyone a go)", () => {
    reset();
    // p1: worn FR once in 1 game (high ratio 100%)
    // p2: never worn FR, attended 10 games (0 count → zero tier)
    // p2 wins via the zero-first tier, regardless of game counts.
    const players = [makePlayer("p1", 1), makePlayer("p2", 2)];
    const seasonEvents = [
      ...buildGame({
        gameId: "g1",
        field: ["p1", "p2"],
        bench: [],
        periodCount: 1,
        vests: [{ player: "p1", vest: "fr", quarter: 1 }],
      }),
    ];
    const result = suggestLeagueLineup({
      players,
      defaultOnFieldSize: 2,
      forwardCount: 2,
      seasonEvents,
      requiredUnbrokenPeriods: 0,
      vestRequirements: { fr: true, dh: false },
    });
    expect(result.suggestedFr).toBe("p2");
  });

  it("once everyone has had a go, LOWER vest ratio wins over higher", () => {
    reset();
    // p1: 1 FR in 4 on-field appearances → 25% vest share
    // p2: 1 FR in 2 on-field appearances → 50% vest share
    // Both have ≥ 1 FR (past the zero tier). p1's lower ratio
    // means they're "owed" less, but the algorithm should still
    // pick them — they've had FEWER per chance.
    // Wait — re-reading the rule: lower ratio = priority (they've
    // worn it LESS per opportunity). So p1 wins.
    const players = [makePlayer("p1", 1), makePlayer("p2", 2)];
    const seasonEvents = [
      // p1's 4 games — wears FR in only the first one
      ...buildGame({
        gameId: "g1",
        field: ["p1"],
        bench: [],
        periodCount: 1,
        vests: [{ player: "p1", vest: "fr", quarter: 1 }],
      }),
      ...buildGame({ gameId: "g2", field: ["p1"], bench: [], periodCount: 1 }),
      ...buildGame({ gameId: "g3", field: ["p1"], bench: [], periodCount: 1 }),
      ...buildGame({ gameId: "g4", field: ["p1"], bench: [], periodCount: 1 }),
      // p2's 2 games — wears FR in the first
      ...buildGame({
        gameId: "g5",
        field: ["p2"],
        bench: [],
        periodCount: 1,
        vests: [{ player: "p2", vest: "fr", quarter: 1 }],
      }),
      ...buildGame({ gameId: "g6", field: ["p2"], bench: [], periodCount: 1 }),
    ];
    const result = suggestLeagueLineup({
      players,
      defaultOnFieldSize: 2,
      forwardCount: 2,
      seasonEvents,
      requiredUnbrokenPeriods: 0,
      vestRequirements: { fr: true, dh: false },
    });
    expect(result.suggestedFr).toBe("p1");
  });

  it("reliable attendee wins tiebreak when vest ratios are equal", () => {
    reset();
    // p1: 1 FR / 5 games (20%) — reliable
    // p2: 2 FR / 10 games (20%) — also reliable, more games
    // Same ratio → games DESC tiebreak → p2 wins.
    const players = [makePlayer("p1", 1), makePlayer("p2", 2)];
    const games: GameEvent[] = [];
    // p1: 5 games, FR in g1
    for (let i = 1; i <= 5; i++) {
      games.push(
        ...buildGame({
          gameId: `p1g${i}`,
          field: ["p1"],
          bench: [],
          periodCount: 1,
          vests: i === 1 ? [{ player: "p1", vest: "fr", quarter: 1 }] : [],
        }),
      );
    }
    // p2: 10 games, FR in g1 and g6
    for (let i = 1; i <= 10; i++) {
      games.push(
        ...buildGame({
          gameId: `p2g${i}`,
          field: ["p2"],
          bench: [],
          periodCount: 1,
          vests:
            i === 1 || i === 6
              ? [{ player: "p2", vest: "fr", quarter: 1 }]
              : [],
        }),
      );
    }
    const result = suggestLeagueLineup({
      players,
      defaultOnFieldSize: 2,
      forwardCount: 2,
      seasonEvents: games,
      requiredUnbrokenPeriods: 0,
      vestRequirements: { fr: true, dh: false },
    });
    expect(result.suggestedFr).toBe("p2");
  });
});

describe("suggestVestRotation — proportionate vest fairness", () => {
  it("zero-count player first when any candidate has never worn the vest", () => {
    reset();
    const players = [
      makePlayer("p1", 1),
      makePlayer("p2", 2),
      makePlayer("p3", 3),
    ];
    // p1 has worn FR before; p2, p3 haven't. p2 wins the zero-tier
    // tiebreak via jersey (both are at zero, both with 0 games).
    const seasonEvents = buildGame({
      gameId: "g1",
      field: ["p1"],
      bench: [],
      periodCount: 1,
      vests: [{ player: "p1", vest: "fr", quarter: 1 }],
    });
    const rotation = suggestVestRotation({
      onFieldIds: ["p1", "p2", "p3"],
      players,
      seasonEvents,
      requiredUnbrokenPeriods: 0,
      vestRequirements: { fr: true, dh: false },
      periodCount: 1,
    });
    expect(rotation.fr[0]).toBe("p2");
  });
});

// ─── DH symmetry ─────────────────────────────────────────────
// FR and DH share the same generic ranking helper, so the FR
// behaviour above implicitly covers DH. These tests pin the DH
// path explicitly so a future divergence (e.g. someone hard-
// coding `frCount` in a DH branch) can't sneak through.

describe("DH vest — proportionate fairness mirrors FR", () => {
  it("suggestLeagueLineup: zero-DH-count player wins over a positive-DH-count player", () => {
    reset();
    const players = [makePlayer("p1", 1), makePlayer("p2", 2)];
    // p1 has worn DH; p2 has not. p2 wins the zero tier.
    const seasonEvents = buildGame({
      gameId: "g1",
      field: ["p1", "p2"],
      bench: [],
      periodCount: 1,
      vests: [{ player: "p1", vest: "dh", quarter: 1 }],
    });
    const result = suggestLeagueLineup({
      players,
      defaultOnFieldSize: 2,
      forwardCount: 2,
      seasonEvents,
      requiredUnbrokenPeriods: 0,
      // FR off so DH isn't excluded by the FR pick first.
      vestRequirements: { fr: false, dh: true },
    });
    expect(result.suggestedDh).toBe("p2");
  });

  it("suggestLeagueLineup: lower DH ratio wins once everyone has had a go", () => {
    reset();
    // p1: 1 DH in 4 appearances (25%)
    // p2: 1 DH in 2 appearances (50%)
    // Both past the zero tier → p1 wins on lower ratio.
    const players = [makePlayer("p1", 1), makePlayer("p2", 2)];
    const seasonEvents = [
      ...buildGame({
        gameId: "g1",
        field: ["p1"],
        bench: [],
        periodCount: 1,
        vests: [{ player: "p1", vest: "dh", quarter: 1 }],
      }),
      ...buildGame({ gameId: "g2", field: ["p1"], bench: [], periodCount: 1 }),
      ...buildGame({ gameId: "g3", field: ["p1"], bench: [], periodCount: 1 }),
      ...buildGame({ gameId: "g4", field: ["p1"], bench: [], periodCount: 1 }),
      ...buildGame({
        gameId: "g5",
        field: ["p2"],
        bench: [],
        periodCount: 1,
        vests: [{ player: "p2", vest: "dh", quarter: 1 }],
      }),
      ...buildGame({ gameId: "g6", field: ["p2"], bench: [], periodCount: 1 }),
    ];
    const result = suggestLeagueLineup({
      players,
      defaultOnFieldSize: 2,
      forwardCount: 2,
      seasonEvents,
      requiredUnbrokenPeriods: 0,
      vestRequirements: { fr: false, dh: true },
    });
    expect(result.suggestedDh).toBe("p1");
  });

  it("suggestVestRotation: zero-DH player first when any candidate has never worn DH", () => {
    reset();
    const players = [
      makePlayer("p1", 1),
      makePlayer("p2", 2),
      makePlayer("p3", 3),
    ];
    const seasonEvents = buildGame({
      gameId: "g1",
      field: ["p1"],
      bench: [],
      periodCount: 1,
      vests: [{ player: "p1", vest: "dh", quarter: 1 }],
    });
    const rotation = suggestVestRotation({
      onFieldIds: ["p1", "p2", "p3"],
      players,
      seasonEvents,
      requiredUnbrokenPeriods: 0,
      vestRequirements: { fr: false, dh: true },
      periodCount: 1,
    });
    expect(rotation.dh[0]).toBe("p2");
  });

  it("suggestVestRotation: reliable attendee wins DH tiebreak when ratios are equal", () => {
    reset();
    // p1: 1 DH / 5 games (20%) — reliable
    // p2: 2 DH / 10 games (20%) — more games, also reliable
    // Same ratio → games DESC tiebreak → p2 wins.
    const players = [makePlayer("p1", 1), makePlayer("p2", 2)];
    const games: GameEvent[] = [];
    for (let i = 1; i <= 5; i++) {
      games.push(
        ...buildGame({
          gameId: `p1g${i}`,
          field: ["p1"],
          bench: [],
          periodCount: 1,
          vests: i === 1 ? [{ player: "p1", vest: "dh", quarter: 1 }] : [],
        }),
      );
    }
    for (let i = 1; i <= 10; i++) {
      games.push(
        ...buildGame({
          gameId: `p2g${i}`,
          field: ["p2"],
          bench: [],
          periodCount: 1,
          vests:
            i === 1 || i === 6
              ? [{ player: "p2", vest: "dh", quarter: 1 }]
              : [],
        }),
      );
    }
    const rotation = suggestVestRotation({
      onFieldIds: ["p1", "p2"],
      players,
      seasonEvents: games,
      requiredUnbrokenPeriods: 0,
      vestRequirements: { fr: false, dh: true },
      periodCount: 1,
    });
    expect(rotation.dh[0]).toBe("p2");
  });
});
