// Sports are independent in the database, not just in the app
// (cross-sport audit, 14 Oct 2026). Each test pins one migration:
//   0061 sport_event_types   a game takes only its own sport's events
// The live-game specs cover the other side of 0061: every event the
// three live screens write still lands.
//
// Covers: supabase/migrations/0061

import { test, expect } from "@playwright/test";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "../fixtures/supabase";
import { makeGame, makeTeam } from "../fixtures/factories";

test.describe.configure({ mode: "parallel" });

type Sport = "afl" | "netball" | "rugby_league";

async function superAdminId(admin: SupabaseClient): Promise<string> {
  const { data } = await admin.auth.admin.listUsers();
  return data.users.find((u) => u.email === process.env.TEST_SUPER_ADMIN_EMAIL)!.id;
}

async function addEvent(admin: SupabaseClient, gameId: string, type: string, ownerId: string) {
  const { error } = await admin.from("game_events").insert({ game_id: gameId, type, metadata: {}, created_by: ownerId });
  return error;
}

// What each sport's live actions write (live/actions.ts,
// netball-actions.ts, league-actions.ts). A new event type lands here
// and in a migration together.
const SHARED = ["lineup_set", "quarter_start", "quarter_end", "game_finalised", "player_arrived", "injury", "player_loan", "score_undo"];
const EVENT_TYPES: Record<Sport, string[]> = {
  afl: [...SHARED, "swap", "field_zone_swap", "player_lock", "roster_shrink", "goal", "behind", "opponent_goal", "opponent_behind"],
  netball: [...SHARED, "period_break_swap", "player_lock", "goal", "opponent_goal"],
  rugby_league: [
    ...SHARED,
    "swap", "league_position_change", "roster_shrink",
    "try", "opponent_try", "conversion_attempt", "opponent_conversion",
    "penalty_goal", "field_goal", "opponent_penalty_goal", "opponent_field_goal",
    "kickoff_taken", "vest_assigned",
  ],
};

test("0061: each sport's games take only that sport's events", async () => {
  const admin = createAdminClient();
  const ownerId = await superAdminId(admin);

  const { data: rows, error } = await admin.from("sport_event_types").select("sport, type");
  expect(error).toBeNull();
  for (const sport of Object.keys(EVENT_TYPES) as Sport[]) {
    const listed = rows!.filter((r) => r.sport === sport).map((r) => r.type as string);
    expect(listed.sort(), sport).toEqual([...EVENT_TYPES[sport]].sort());
  }

  const cases: { sport: Sport; ageGroup: string; own: string; foreign: string[] }[] = [
    { sport: "afl", ageGroup: "U10", own: "behind", foreign: ["try", "period_break_swap", "vest_assigned"] },
    { sport: "netball", ageGroup: "go", own: "period_break_swap", foreign: ["behind", "swap", "field_zone_swap"] },
    { sport: "rugby_league", ageGroup: "U10", own: "try", foreign: ["goal", "behind", "player_lock", "period_break_swap"] },
  ];
  for (const c of cases) {
    const team = await makeTeam(admin, { ownerId, sport: c.sport, ageGroup: c.ageGroup });
    const game = await makeGame(admin, { teamId: team.id, ownerId });

    expect(await addEvent(admin, game.id, "quarter_start", ownerId), `${c.sport} quarter_start`).toBeNull();
    expect(await addEvent(admin, game.id, c.own, ownerId), `${c.sport} ${c.own}`).toBeNull();
    for (const type of [...c.foreign, "not_an_event"]) {
      const refused = await addEvent(admin, game.id, type, ownerId);
      expect(refused?.message, `${c.sport} ${type}`).toMatch(new RegExp(`${c.sport} games don't record "${type}" events`));
    }

    // Nor can an event become another sport's afterwards.
    const { error: retype } = await admin
      .from("game_events")
      .update({ type: c.foreign[0] })
      .eq("game_id", game.id)
      .eq("type", c.own);
    expect(retype?.message).toMatch(/don't record/);
  }
});
