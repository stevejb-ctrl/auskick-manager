// The event catalogue is the contract for what Siren may send PostHog.
// Squads are lists of children's names, so no property may hold free
// text: every string is an enum, a row id, an age-group id or the host.
import { describe, expect, it } from "vitest";
import { cleanProps, EVENT_CATALOGUE, type EventName, type EventProps } from "@/lib/analytics/events";
import { sameLineup } from "@/lib/analytics/game-day";
import { ALL_SPORT_IDS } from "@/lib/sports/registry";

const SNAKE = /^[a-z][a-z0-9]*(_[a-z0-9]+)*$/;
const events = Object.keys(EVENT_CATALOGUE) as EventName[];
const UUID = "1b4e28ba-2fa1-41d2-883f-0016d3cca427";

describe("EVENT_CATALOGUE", () => {
  it("names every event and property in snake_case", () => {
    for (const event of events) {
      expect(event).toMatch(SNAKE);
      for (const key of Object.keys(EVENT_CATALOGUE[event])) expect(key).toMatch(SNAKE);
    }
  });

  it("never starts with $, which PostHog keeps for its own events", () => {
    for (const event of events) expect(event.startsWith("$")).toBe(false);
  });

  it("has no property that sounds like a name, a note or free text", () => {
    const banned = /name|note|text|comment|email|title|label|message|query|url|path/;
    for (const event of events) {
      for (const key of Object.keys(EVENT_CATALOGUE[event])) expect(`${event}.${key}`).not.toMatch(banned);
    }
  });

  it("lets strings through only as enums, ids, age groups or the host", () => {
    const allowed = new Set(["count", "number", "boolean", "uuid", "age_group", "host"]);
    for (const event of events) {
      for (const raw of Object.values(EVENT_CATALOGUE[event]) as unknown[]) {
        const spec = typeof raw === "object" && raw && !Array.isArray(raw) ? (raw as { optional: unknown }).optional : raw;
        if (Array.isArray(spec)) {
          expect(spec.length).toBeGreaterThan(0);
          for (const v of spec) expect(v).toMatch(SNAKE);
        } else {
          expect(allowed.has(spec as string)).toBe(true);
        }
      }
    }
  });

  it("tags every game-day and lifecycle event with the sport, in every sport", () => {
    const sportless = new Set<EventName>(["signup_completed", "offline_queue_flushed", "invite_sent", "invite_accepted"]);
    for (const event of events) {
      if (sportless.has(event)) continue;
      expect((EVENT_CATALOGUE[event] as Record<string, unknown>).sport).toEqual(ALL_SPORT_IDS);
    }
  });
});

describe("cleanProps", () => {
  it("passes a well-formed event through untouched", () => {
    const { props, problems } = cleanProps("sub_made", { sport: "netball", source: "due_prompt", count: 2 });
    expect(props).toEqual({ sport: "netball", source: "due_prompt", count: 2 });
    expect(problems).toEqual([]);
  });

  it("drops a value outside the enum, so free text can't ride along", () => {
    const { props, problems } = cleanProps("score_recorded", {
      sport: "afl",
      kind: "Goal by Zebedee Quillfeather",
      via: "dock",
      side: "own",
    });
    expect(props).toEqual({ sport: "afl", via: "dock", side: "own" });
    expect(JSON.stringify(props)).not.toContain("Quillfeather");
    expect(problems).toHaveLength(1);
  });

  it("drops a property the catalogue doesn't list", () => {
    const { props, problems } = cleanProps("late_arrival_added", {
      sport: "afl",
      player_name: "Zebedee",
    } as Record<string, unknown>);
    expect(props).toEqual({ sport: "afl" });
    expect(problems[0]).toContain("player_name");
  });

  it("accepts ids only when they are uuids", () => {
    expect(cleanProps("team_created", { team_id: UUID, sport: "afl", age_group: "U10" }).props).toEqual({
      team_id: UUID,
      sport: "afl",
      age_group: "U10",
    });
    const named = cleanProps("team_created", { team_id: "Kotara Koalas", sport: "afl", age_group: "U10" });
    expect(named.props).not.toHaveProperty("team_id");
  });

  it("accepts age groups only from a sport's list", () => {
    expect(cleanProps("team_created", { team_id: UUID, sport: "afl", age_group: "Zeb's team" }).props).not.toHaveProperty(
      "age_group",
    );
  });

  it("takes counts as whole, non-negative numbers", () => {
    expect(cleanProps("squad_built", { team_id: UUID, sport: "afl", player_count: 15 }).props.player_count).toBe(15);
    expect(cleanProps("squad_built", { team_id: UUID, sport: "afl", player_count: -1 }).props).not.toHaveProperty(
      "player_count",
    );
    expect(cleanProps("squad_built", { team_id: UUID, sport: "afl", player_count: "15" }).props).not.toHaveProperty(
      "player_count",
    );
  });

  it("leaves optional properties out quietly, and reports a missing required one", () => {
    expect(cleanProps("game_created", { team_id: UUID, sport: "afl", source: "manual", days_until_game: null })).toEqual({
      props: { team_id: UUID, sport: "afl", source: "manual" },
      problems: [],
    });
    expect(cleanProps("sub_made", { sport: "afl", count: 1 }).problems).toEqual(['sub_made: missing "source"']);
  });
});

describe("EventProps", () => {
  it("only types the catalogue's values (tsc checks the expect-errors)", () => {
    const ok: EventProps<"score_recorded"> = { sport: "soccer", kind: "goal", via: "chip", side: "opponent" };
    // @ts-expect-error: not one of sub_made's sources
    const freeText: EventProps<"sub_made"> = { sport: "afl", source: "typed by hand", count: 1 };
    // @ts-expect-error: not a property of late_arrival_added
    const extra: EventProps<"late_arrival_added"> = { sport: "afl", player_name: "Zebedee" };
    expect([ok, freeText, extra]).toHaveLength(3);
  });
});

describe("sameLineup", () => {
  it("ignores the order within a spot", () => {
    expect(sameLineup({ fwd: ["a", "b"], bench: ["c"] }, { bench: ["c"], fwd: ["b", "a"] })).toBe(true);
  });

  it("sees a kid moved to another spot", () => {
    expect(sameLineup({ fwd: ["a", "b"], bench: ["c"] }, { fwd: ["a", "c"], bench: ["b"] })).toBe(false);
  });
});
