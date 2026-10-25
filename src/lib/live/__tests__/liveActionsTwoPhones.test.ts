// Two phones on one game: the live actions refuse a write from a phone
// that's behind the game, and an undo takes back the score its phone
// named (UX round 2, 24 Oct 2026). Every sport's actions run here against
// an in-memory database (fakeSupabase.ts), as a game-day link (the
// runner's phone) would call them.

import { beforeEach, describe, expect, it, vi } from "vitest";
import { makeFakeDb, type FakeDb } from "./fakeSupabase";
import * as afl from "@/app/(app)/teams/[teamId]/games/[gameId]/live/actions";
import * as netball from "@/app/(app)/teams/[teamId]/games/[gameId]/live/netball-actions";
import * as league from "@/app/(app)/teams/[teamId]/games/[gameId]/live/league-actions";
import * as soccer from "@/app/(app)/teams/[teamId]/games/[gameId]/live/soccer-actions";
import * as basketball from "@/app/(app)/teams/[teamId]/games/[gameId]/live/basketball-actions";
import * as touch from "@/app/(app)/teams/[teamId]/games/[gameId]/live/touch-actions";
import * as gameActions from "@/app/(app)/teams/[teamId]/games/[gameId]/actions";

const state: { db: FakeDb; role: string } = { db: makeFakeDb(), role: "admin" };

vi.mock("react", async (importOriginal) => ({
  ...(await importOriginal<typeof import("react")>()),
  cache: <T,>(fn: T) => fn,
}));
vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
  revalidateTag: vi.fn(),
  unstable_cache: <T,>(fn: T) => fn,
  unstable_noStore: vi.fn(),
}));
vi.mock("next/navigation", () => ({ redirect: vi.fn(), notFound: vi.fn() }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => state.db.client }));
vi.mock("@/lib/supabase/server", () => ({
  createClient: () => state.db.client,
  getMembership: async () => ({ role: state.role }),
  getUser: async () => ({ data: { user: { id: "coach" } } }),
}));
vi.mock("@/lib/auth/userIdHeader", () => ({ readValidatedUserId: () => "coach" }));
vi.mock("@/lib/season", () => ({ invalidateSeasonEvents: vi.fn() }));
vi.mock("@/lib/notifications/gameStarted", () => ({ notifyGameStarted: async () => {} }));
vi.mock("@/lib/playbook/snapshot", () => ({ kickoffSnapshot: async () => null }));
vi.mock("@/lib/playbook/rollupStore", () => ({ writeGameRollup: async () => {}, clearGameRollup: async () => {} }));

const GAME = "game-1";
const TEAM = "team-1";
const auth = { kind: "token" as const, token: "tok" };
type Result = { success: boolean; error?: string; rejected?: boolean; stale?: boolean };

interface SportCase {
  sport: string;
  /** The first period's short name ("Q1", "H1"). */
  first: string;
  second: string;
  kickoff: () => Promise<Result>;
  startPeriod: (period: number) => Promise<Result>;
  endPeriod: (period: number) => Promise<Result>;
  breakLineup: (nextPeriod: number) => Promise<Result>;
  /** A whole-lineup change during `period` (none for AFL or netball). */
  liveLineup?: (period: number) => Promise<Result>;
  finalise: () => Promise<Result>;
}

const any = <T,>(v: unknown) => v as T;

const SPORTS: SportCase[] = [
  {
    sport: "afl",
    first: "Q1",
    second: "Q2",
    kickoff: () => afl.startGame(auth, GAME, any({ back: [], hback: [], mid: [], hfwd: [], fwd: [], bench: [] }), 600, 12, true),
    startPeriod: (q) => afl.startQuarter(auth, GAME, q),
    endPeriod: (q) => afl.endQuarter(auth, GAME, q, 600_000),
    breakLineup: () => afl.recordLineupSet(auth, GAME, any({ back: [], hback: [], mid: [], hfwd: [], fwd: [], bench: [] })),
    finalise: () => afl.finaliseGame(auth, GAME, 600_000),
  },
  {
    sport: "netball",
    first: "Q1",
    second: "Q2",
    kickoff: () => netball.startNetballGame(auth, GAME, any({ positions: {}, bench: [] }), 7, null, true),
    startPeriod: (q) => netball.startNetballQuarter(auth, GAME, q),
    endPeriod: (q) => netball.endNetballQuarter(auth, GAME, q, 600_000),
    breakLineup: (next) => netball.periodBreakSwap(auth, GAME, next, any({ positions: {}, bench: [] }), []),
    finalise: () => netball.finaliseNetballGame(auth, GAME, 600_000),
  },
  {
    sport: "rugby_league",
    first: "Q1",
    second: "Q2",
    kickoff: () => league.startLeagueGame(auth, GAME, any({ forwards: [], backs: [], bench: [] }), 8, true),
    startPeriod: (q) => league.startLeagueQuarter(auth, GAME, q),
    endPeriod: (q) => league.endLeagueQuarter(auth, GAME, q, 600_000),
    breakLineup: () => league.recordLeagueLineupSet(auth, GAME, any({ forwards: [], backs: [], bench: [] }), undefined),
    liveLineup: (q) => league.recordLeagueLineupSet(auth, GAME, any({ forwards: [], backs: [], bench: [] }), { quarter: q, elapsed_ms: 1000 }),
    finalise: () => league.finaliseLeagueGame(auth, GAME, 600_000),
  },
  {
    sport: "soccer",
    first: "H1",
    second: "H2",
    kickoff: () => soccer.startSoccerGame(auth, GAME, any({ keeper: null, lines: {}, bench: [] }), 7, true),
    startPeriod: (q) => soccer.startSoccerHalf(auth, GAME, q),
    endPeriod: (q) => soccer.endSoccerHalf(auth, GAME, q, 600_000),
    breakLineup: () => soccer.recordSoccerLineupSet(auth, GAME, any({ keeper: null, lines: {}, bench: [] }), undefined),
    liveLineup: (q) => soccer.recordSoccerLineupSet(auth, GAME, any({ keeper: null, lines: {}, bench: [] }), { quarter: q, elapsed_ms: 1000 }),
    finalise: () => soccer.finaliseSoccerGame(auth, GAME, 600_000),
  },
  {
    sport: "basketball",
    // Basketball U10 plays halves.
    first: "H1",
    second: "H2",
    kickoff: () => basketball.startBasketballGame(auth, GAME, any({ lines: {}, bench: [] }), 5, true),
    startPeriod: (q) => basketball.startBasketballPeriod(auth, GAME, q),
    endPeriod: (q) => basketball.endBasketballPeriod(auth, GAME, q, 600_000),
    breakLineup: () => basketball.recordBasketballLineupSet(auth, GAME, any({ lines: {}, bench: [] }), undefined),
    liveLineup: (q) => basketball.recordBasketballLineupSet(auth, GAME, any({ lines: {}, bench: [] }), { quarter: q, elapsed_ms: 1000 }),
    finalise: () => basketball.finaliseBasketballGame(auth, GAME, 600_000),
  },
  {
    sport: "touch",
    first: "H1",
    second: "H2",
    kickoff: () => touch.startTouchGame(auth, GAME, any({ lines: {}, bench: [] }), 6, true),
    startPeriod: (q) => touch.startTouchPeriod(auth, GAME, q),
    endPeriod: (q) => touch.endTouchPeriod(auth, GAME, q, 600_000),
    breakLineup: () => touch.recordTouchLineupSet(auth, GAME, any({ lines: {}, bench: [] }), undefined),
    liveLineup: (q) => touch.recordTouchLineupSet(auth, GAME, any({ lines: {}, bench: [] }), { quarter: q, elapsed_ms: 1000 }),
    finalise: () => touch.finaliseTouchGame(auth, GAME, 600_000),
  },
];

const AGE_GROUPS: Record<string, string> = {
  afl: "U10",
  netball: "11u",
  rugby_league: "U9",
  soccer: "U10",
  basketball: "U10",
  touch: "U10",
};

function seed(sport: string, status: string, events: { type: string; metadata?: Record<string, unknown>; player_id?: string | null; idempotency_key?: string }[]) {
  state.db = makeFakeDb({
    games: [
      {
        id: GAME,
        team_id: TEAM,
        share_token: "tok",
        status,
        on_field_size: 7,
        sub_interval_seconds: 300,
        opponent: "Kew",
      },
    ],
    teams: [{ id: TEAM, sport, age_group: AGE_GROUPS[sport], period_count: null, name: "Hornets" }],
    game_events: events.map((e) => ({ game_id: GAME, metadata: {}, ...e })),
  });
}

const kicked = (sport: string) => [
  { type: "lineup_set", metadata: { lineup: {}, sport } },
  { type: "quarter_start", metadata: { quarter: 1, sport } },
];
const atBreak = (sport: string) => [...kicked(sport), { type: "quarter_end", metadata: { quarter: 1, elapsed_ms: 600_000, sport } }];
const inSecond = (sport: string) => [
  ...atBreak(sport),
  { type: "lineup_set", metadata: { lineup: {}, sport } },
  { type: "quarter_start", metadata: { quarter: 2, sport } },
];

const events = () => state.db.rows("game_events");
const ofType = (type: string) => events().filter((e) => e.type === type);

beforeEach(() => {
  state.db = makeFakeDb();
  state.role = "admin";
});

describe.each(SPORTS)("$sport: a phone behind the game can't write a second kickoff or break", (s) => {
  it("refuses a second kickoff, and writes nothing", async () => {
    seed(s.sport, "in_progress", kicked(s.sport));
    const before = events().length;
    const r = await s.kickoff();
    expect(r).toMatchObject({ success: false, rejected: true, stale: true, error: `Another phone already started ${s.first}.` });
    expect(events().length).toBe(before);
  });

  it("refuses to start a period that has already started", async () => {
    seed(s.sport, "in_progress", inSecond(s.sport));
    const r = await s.startPeriod(2);
    expect(r).toMatchObject({ success: false, rejected: true, error: `Another phone already started ${s.second}.` });
    expect(ofType("quarter_start")).toHaveLength(2);
  });

  it("refuses a break lineup once the next period is under way", async () => {
    seed(s.sport, "in_progress", inSecond(s.sport));
    const before = events().length;
    const r = await s.breakLineup(2);
    expect(r).toMatchObject({ success: false, rejected: true, error: `Another phone already started ${s.second}.` });
    expect(events().length).toBe(before);
  });

  it("refuses to end a period the game has moved past", async () => {
    seed(s.sport, "in_progress", inSecond(s.sport));
    const r = await s.endPeriod(1);
    expect(r).toMatchObject({ success: false, rejected: true, error: `Another phone already started ${s.second}.` });
    expect(ofType("quarter_end")).toHaveLength(1);
  });

  it("ends a period once when both phones end it", async () => {
    seed(s.sport, "in_progress", atBreak(s.sport));
    const r = await s.endPeriod(1);
    expect(r.success).toBe(true);
    expect(ofType("quarter_end")).toHaveLength(1);
  });

  it("still takes the break lineup and the next start at the break", async () => {
    seed(s.sport, "in_progress", atBreak(s.sport));
    expect((await s.breakLineup(2)).success).toBe(true);
    expect((await s.startPeriod(2)).success).toBe(true);
    expect(ofType("quarter_start")).toHaveLength(2);
  });

  it("finishes the game once when both phones finish it", async () => {
    seed(s.sport, "in_progress", atBreak(s.sport));
    expect((await s.finalise()).success).toBe(true);
    expect((await s.finalise()).success).toBe(true);
    expect(ofType("game_finalised")).toHaveLength(1);
  });

  it.runIf(s.liveLineup)("refuses a lineup change stamped in a period that's over", async () => {
    seed(s.sport, "in_progress", inSecond(s.sport));
    const before = events().length;
    const r = await s.liveLineup!(1);
    expect(r).toMatchObject({ success: false, rejected: true, stale: true });
    expect(events().length).toBe(before);
    // In the period being played, it's taken.
    expect((await s.liveLineup!(2)).success).toBe(true);
  });
});

describe("a write the queue replays is done, not stale", () => {
  it("succeeds without a second row when the key has already landed", async () => {
    seed("netball", "in_progress", [...atBreak("netball"), { type: "quarter_start", metadata: { quarter: 2 }, idempotency_key: "op-2" }]);
    const r = await netball.startNetballQuarter(auth, GAME, 2, "op-2");
    expect(r.success).toBe(true);
    expect(ofType("quarter_start")).toHaveLength(2);
  });
});

// ─── Undo takes back the score its phone named ───────────────
interface UndoCase {
  sport: string;
  ours: string;
  theirs: string;
  undo: (target: { eventId?: string; key?: string } | null, key?: string) => Promise<Result>;
}

const UNDO: UndoCase[] = [
  {
    sport: "afl",
    ours: "goal",
    theirs: "goal",
    undo: (target, key) => afl.undoLastScore(auth, GAME, { kind: "goal", quarter: 1, playerId: "p1", target }, key),
  },
  { sport: "netball", ours: "goal", theirs: "opponent_goal", undo: (t, k) => netball.undoNetballScore(auth, GAME, t, k) },
  { sport: "rugby_league", ours: "try", theirs: "opponent_try", undo: (t, k) => league.undoLeagueScore(auth, GAME, t, k) },
  { sport: "soccer", ours: "goal", theirs: "opponent_goal", undo: (t, k) => soccer.undoSoccerScore(auth, GAME, t, k) },
  { sport: "basketball", ours: "two_pointer", theirs: "opponent_two_pointer", undo: (t, k) => basketball.undoBasketballScore(auth, GAME, t, k) },
  { sport: "touch", ours: "try", theirs: "opponent_try", undo: (t, k) => touch.undoTouchScore(auth, GAME, t, k) },
];

describe.each(UNDO)("$sport: undo takes back the score its phone named", (u) => {
  // This phone scored first; the other phone's score landed after it.
  const scores = (sport: string) => [
    ...kicked(sport),
    { type: u.ours, player_id: "p1", metadata: { quarter: 1, elapsed_ms: 1000, sport }, idempotency_key: "op-mine" },
    { type: u.theirs, player_id: u.theirs.startsWith("opponent") ? null : "p2", metadata: { quarter: 1, elapsed_ms: 2000, sport }, idempotency_key: "op-theirs" },
  ];
  const mine = () => events().find((e) => e.idempotency_key === "op-mine")!;
  const undos = () => ofType("score_undo");

  it("by the score's write key: not the other phone's later score", async () => {
    seed(u.sport, "in_progress", scores(u.sport));
    const r = await u.undo({ key: "op-mine" }, "op-undo");
    expect(r.success).toBe(true);
    expect(undos()).toHaveLength(1);
    expect(undos()[0].metadata).toMatchObject({ target_event_id: mine().id, original_type: u.ours });
    expect(undos()[0].player_id).toBe("p1");
  });

  it("by the score's event id", async () => {
    seed(u.sport, "in_progress", scores(u.sport));
    await u.undo({ eventId: mine().id as string }, "op-undo");
    expect(undos()[0].metadata).toMatchObject({ target_event_id: mine().id });
  });

  it("refuses when the other phone already took that score back, and writes nothing", async () => {
    seed(u.sport, "in_progress", scores(u.sport));
    await u.undo({ key: "op-mine" }, "op-undo-1");
    const r = await u.undo({ key: "op-mine" }, "op-undo-2");
    expect(r).toMatchObject({ success: false, rejected: true, stale: true });
    expect(undos()).toHaveLength(1);
  });

  it("refuses an undo whose score never saved, says so, and leaves the saved one", async () => {
    seed(u.sport, "in_progress", scores(u.sport));
    const r = await u.undo({ key: "op-never-saved" }, "op-undo");
    expect(r).toMatchObject({ success: false, rejected: true, error: "That score didn't save, so there's nothing to take back." });
    expect(undos()).toHaveLength(0);
  });

  it("an undo the queue replays is done, not refused", async () => {
    seed(u.sport, "in_progress", scores(u.sport));
    await u.undo({ key: "op-mine" }, "op-undo");
    const again = await u.undo({ key: "op-mine" }, "op-undo");
    expect(again.success).toBe(true);
    expect(undos()).toHaveLength(1);
  });
});

describe("an undo queued before undos named their score", () => {
  it("still takes back the latest score (the key arrives where the target now goes)", async () => {
    seed("soccer", "in_progress", [
      ...kicked("soccer"),
      { type: "goal", player_id: "p1", metadata: { quarter: 1 } },
      { type: "opponent_goal", metadata: { quarter: 1 }, idempotency_key: "op-theirs" },
    ]);
    const legacy = soccer.undoSoccerScore as unknown as (a: typeof auth, g: string, key: string) => Promise<Result>;
    expect((await legacy(auth, GAME, "op-old-undo")).success).toBe(true);
    const undo = ofType("score_undo")[0];
    expect(undo.idempotency_key).toBe("op-old-undo");
    expect(undo.metadata).toMatchObject({ original_type: "opponent_goal" });
  });
});

// ─── The game-day link can't wipe a game ─────────────────────
describe("resetGame", () => {
  it("refuses a game-day link and deletes nothing", async () => {
    seed("touch", "in_progress", kicked("touch"));
    const before = events().length;
    const r = await gameActions.resetGame(auth, GAME);
    expect(r).toMatchObject({ success: false });
    expect(events().length).toBe(before);
    expect(state.db.rows("games")[0].status).toBe("in_progress");
  });
});

// ─── A coach can take a game-day link back ───────────────────
describe("newGameDayLink", () => {
  it("replaces the link: the old one can't write any more, the new one can", async () => {
    seed("touch", "in_progress", atBreak("touch"));
    const r = await gameActions.newGameDayLink(TEAM, GAME);
    expect(r.success).toBe(true);
    const token = (r as { data?: { token: string } }).data!.token;
    expect(token).not.toBe("tok");
    expect(state.db.rows("games")[0].share_token).toBe(token);
    expect(await touch.startTouchPeriod(auth, GAME, 2)).toMatchObject({ success: false, error: "Invalid share link." });
    expect((await touch.startTouchPeriod({ kind: "token", token }, GAME, 2)).success).toBe(true);
  });

  it("is a team admin's: a manager can't replace it", async () => {
    seed("touch", "in_progress", atBreak("touch"));
    state.role = "game_manager";
    expect((await gameActions.newGameDayLink(TEAM, GAME)).success).toBe(false);
    expect(state.db.rows("games")[0].share_token).toBe("tok");
  });

  it("won't touch another team's game", async () => {
    seed("touch", "in_progress", atBreak("touch"));
    expect((await gameActions.newGameDayLink("other-team", GAME)).success).toBe(false);
    expect(state.db.rows("games")[0].share_token).toBe("tok");
  });
});
