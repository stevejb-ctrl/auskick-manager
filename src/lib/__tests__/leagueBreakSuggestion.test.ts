// ─── League's break Suggested keeps its own Must rules ───────
// Round 2 usability, 24 Oct 2026 (league P1). The break's Suggested was
// the planner's cold projection of the next period, given no events or
// minutes, so it broke the rules its own check enforces:
//
//   - U10 half time: eleven kids still owed their unbroken half (Law 6)
//     after live subs in H1. Suggested benched two of them and kept on
//     two who'd had theirs; the check showed "can't reach 50%" and
//     "can't get 1 unbroken half", and Start read "2 rules".
//   - U9: Tyler sat out Q1 and played Q2. Suggested benched him at Q3
//     with no warning, and again at Q4: he finished on 8:00 of 32.
//   - The Q2 vest plan had Charlie in DH; Suggested benched him.
//
// Suggested now reads the game: who still owes their unbroken periods
// or 50% (least slack first), then the planned vest wearers, then fair
// time. The check warns when a bench move leaves a kid needing every
// period left.

import { describe, expect, it } from "vitest";
import type { GameEvent, GameEventType } from "@/lib/types";
import { getAgeGroupConfig } from "@/lib/sports";
import { rugbyBreakCheck } from "@/lib/sports/rugby/breakCheck";
import { leagueBreakSuggestion } from "@/lib/sports/rugby/breakSuggestion";
import {
  playerMsOnField,
  playerZoneMsOnField,
  replayLeagueGame,
  unbrokenPeriodLiveStatus,
  unbrokenPeriodsRequired,
} from "@/lib/sports/rugby_league/fairness";
import { currentVests } from "@/lib/sports/rugby_league/vests";

const MIN = 60_000;
let ts = 0;
function ev(type: GameEventType, metadata: Record<string, unknown> = {}, playerId: string | null = null): GameEvent {
  ts++;
  return {
    id: `e${ts}`,
    game_id: "g1",
    type,
    player_id: playerId,
    metadata,
    created_at: new Date(Date.UTC(2026, 9, 24, 9, 0, 0, ts)).toISOString(),
    created_by: null,
  } as GameEvent;
}
const swap = (quarter: number, minutes: number, off: string, on: string) =>
  ev("swap", { quarter, elapsed_ms: minutes * MIN, off_player_id: off, on_player_id: on });

type Lineup = { forwards: string[]; backs: string[]; bench: string[] };
const onField = (l: Lineup) => [...l.forwards, ...l.backs];

/** What LeagueBreak hands the suggester and the check at the break after `period`. */
function atBreak(events: GameEvent[], ageGroupId: string, period: number) {
  const ageGroup = getAgeGroupConfig("rugby_league", ageGroupId);
  const state = replayLeagueGame(events);
  const lineup = state.lineup as Lineup;
  const squad = [...onField(lineup), ...lineup.bench].map((id) => ({ id }));
  const required = unbrokenPeriodsRequired(ageGroup);
  const status = unbrokenPeriodLiveStatus(events, required);
  const unbroken = { required, done: Object.fromEntries(Object.entries(status).map(([pid, s]) => [pid, s.unbrokenPeriods.length])) };
  const msByPlayer = playerMsOnField(events, period, 0);
  const zoneMs = playerZoneMsOnField(events, period, 0);
  const periodMs = ageGroup.periodSeconds * 1000;
  const suggested = leagueBreakSuggestion({
    sport: "rugby_league",
    ageGroup,
    squad,
    previousLineup: lineup,
    injured: new Set(),
    loaned: new Set(),
    onFieldSize: ageGroup.defaultOnFieldSize,
    currentQuarter: period,
    msByPlayer,
    lineMs: zoneMs,
    periodMs,
    unbroken,
    vests: currentVests(events, period + 1),
  } as Parameters<typeof leagueBreakSuggestion>[0]);
  const check = (l: Lineup) =>
    rugbyBreakCheck({
      lineup: l,
      ageGroup,
      names: Object.fromEntries(squad.map(({ id }) => [id, id])),
      playedThisGame: Object.fromEntries(
        squad.map(({ id }) => [id, { forwards: zoneMs[id]?.forwards ?? 0, backs: zoneMs[id]?.backs ?? 0, vest: zoneMs[id]?.centre ?? 0 }]),
      ),
      benchedLastPeriod: lineup.bench,
      period: period + 1,
      periodMs,
      periodWord: ageGroup.periodCount === 4 ? "quarter" : "half",
      unbroken,
    });
  return { suggested, check, lineup };
}

describe("U10 half time: the kids who owe their unbroken half start H2", () => {
  // 13 kids, 11 on, 2 × 20 min. Two bench kids rolled through H1, so
  // only Isla and Jayden played it unbroken.
  const start: Lineup = {
    forwards: ["isla", "jayden", "a", "b", "c"],
    backs: ["d", "e", "f", "g", "h", "i"],
    bench: ["mia", "eli"],
  };
  const events = [
    ev("lineup_set", { lineup: start }),
    ev("quarter_start", { quarter: 1 }),
    swap(1, 2, "a", "mia"),
    swap(1, 4, "b", "eli"),
    swap(1, 6, "c", "a"),
    swap(1, 8, "d", "b"),
    swap(1, 10, "e", "c"),
    swap(1, 12, "f", "d"),
    swap(1, 14, "g", "e"),
    swap(1, 16, "h", "f"),
    swap(1, 18, "i", "g"),
    ev("quarter_end", { quarter: 1, elapsed_ms: 20 * MIN }),
  ];

  it("benches the two who've had theirs, and keeps every Must", () => {
    const { suggested, check } = atBreak(events, "U10", 1);
    expect([...suggested.bench].sort()).toEqual(["isla", "jayden"]);
    expect(onField(suggested)).toHaveLength(11);
    expect(check(suggested).filter((i) => i.status === "fail")).toEqual([]);
  });
});

describe("U9: Tyler sat out Q1 and played Q2", () => {
  // 10 kids, 8 on, 4 × 8 min, 2 unbroken quarters each.
  const q1: Lineup = { forwards: ["a", "b", "c", "d"], backs: ["e", "f", "g", "h"], bench: ["tyler", "noah"] };
  const q2: Lineup = { forwards: ["a", "b", "c", "d"], backs: ["e", "f", "tyler", "noah"], bench: ["g", "h"] };
  const toQ2 = [
    ev("lineup_set", { lineup: q1 }),
    ev("quarter_start", { quarter: 1 }),
    ev("quarter_end", { quarter: 1, elapsed_ms: 8 * MIN }),
    ev("lineup_set", { lineup: q2 }),
    ev("quarter_start", { quarter: 2 }),
    ev("quarter_end", { quarter: 2, elapsed_ms: 8 * MIN }),
  ];

  it("Q3: Suggested keeps on everyone who still needs a quarter, Tyler among them", () => {
    const { suggested, check } = atBreak(toQ2, "U9", 2);
    for (const pid of ["tyler", "noah", "g", "h"]) expect(onField(suggested), pid).toContain(pid);
    expect(check(suggested).filter((i) => i.status !== "ok")).toEqual([]);
  });

  it("Q3: benching Tyler warns that he must now play all of Q4", () => {
    const { check } = atBreak(toQ2, "U9", 2);
    const benched: Lineup = { forwards: ["a", "b", "c", "d"], backs: ["g", "h", "noah", "e"], bench: ["tyler", "f"] };
    const items = check(benched);
    expect(items.filter((i) => i.status === "fail")).toEqual([]);
    const warn = items.find((i) => i.status === "warn" && i.playerIds?.includes("tyler"));
    expect(warn?.text).toBe("tyler must play all of the last quarter");
  });

  it("Q4, after Q3 benched him: Suggested puts him on", () => {
    const q3: Lineup = { forwards: ["a", "b", "c", "d"], backs: ["g", "h", "noah", "e"], bench: ["tyler", "f"] };
    const events = [
      ...toQ2,
      ev("lineup_set", { lineup: q3 }),
      ev("quarter_start", { quarter: 3 }),
      ev("quarter_end", { quarter: 3, elapsed_ms: 8 * MIN }),
    ];
    const { suggested, check } = atBreak(events, "U9", 3);
    expect(onField(suggested)).toContain("tyler");
    expect(check(suggested).filter((i) => i.status === "fail")).toEqual([]);
  });
});

describe("U9 Q1 break: the planned vest wearers stay on", () => {
  // Eight kids played Q1; a and Zoe sat it out. On time alone two of the
  // eight sit Q2, whoever the Q2 plan has in DH (a is in FR).
  const q1: Lineup = { forwards: ["charlie", "b", "c", "d"], backs: ["e", "f", "g", "h"], bench: ["a", "zoe"] };
  for (const dh of onField(q1)) {
    it(`${dh} (DH) and a (FR) start Q2`, () => {
      const events = [
        ev("lineup_set", { lineup: q1 }),
        ev("quarter_start", { quarter: 1 }),
        ev("quarter_end", { quarter: 1, elapsed_ms: 8 * MIN }),
        ev("vest_assigned", { vest: "fr", period: 2 }, "a"),
        ev("vest_assigned", { vest: "dh", period: 2 }, dh),
      ];
      const { suggested, check } = atBreak(events, "U9", 1);
      expect(onField(suggested)).toContain(dh);
      expect(onField(suggested)).toContain("a");
      expect(check(suggested).filter((i) => i.status === "fail")).toEqual([]);
    });
  }
});
