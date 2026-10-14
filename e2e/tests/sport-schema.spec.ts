// Sports are independent in the database, not just in the app
// (cross-sport audit, 14 Oct 2026). Each test pins one migration:
//   0061 sport_event_types   a game takes only its own sport's events
//   0062 sport_lines         positions and prefs sit on their sport's lines
//   0063 no AFL defaults     a team or game says its sport and size
// The live-game specs cover the other side of 0061: every event the
// three live screens write still lands.
//
// Covers: supabase/migrations/0061-0063, e2e/fixtures/factories.ts

import { test, expect } from "@playwright/test";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "../fixtures/supabase";
import { makeGame, makePlayers, makeTeam } from "../fixtures/factories";

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

test("0062: positions and prefs sit on their own sport's lines", async ({ page }) => {
  const admin = createAdminClient();
  const ownerId = await superAdminId(admin);

  // AFL named positions: AFL lines only.
  const afl = await makeTeam(admin, { ownerId, ageGroup: "U14" });
  const position = (line: string) => ({ team_id: afl.id, label: "TALL", line, sort: 1 });
  expect((await admin.from("team_positions").insert(position("fwd"))).error).toBeNull();
  expect((await admin.from("team_positions").insert(position("forwards"))).error?.message).toMatch(
    /afl teams have no "forwards" line/,
  );

  // League prefs: no AFL line.
  const league = await makeTeam(admin, { ownerId, sport: "rugby_league", ageGroup: "U10" });
  const [leaguePlayer] = await makePlayers(admin, { teamId: league.id, ownerId, count: 3 });
  const { error: aflLine } = await admin
    .from("player_position_prefs")
    .insert({ team_id: league.id, player_id: leaguePlayer.id, line: "fwd", kind: "never" });
  expect(aflLine?.message).toMatch(/rugby_league teams have no "fwd" line/);

  // Netball: the role sheet saves a third, and an AFL line is refused.
  const netball = await makeTeam(admin, { ownerId, sport: "netball", ageGroup: "11u" });
  const [kid] = await makePlayers(admin, { teamId: netball.id, ownerId, count: 3 });
  await admin.from("team_playbooks").insert({ team_id: netball.id, strategy: "by-thirds" });
  const { error: backLine } = await admin
    .from("player_position_prefs")
    .insert({ team_id: netball.id, player_id: kid.id, line: "back", kind: "never" });
  expect(backLine?.message).toMatch(/netball teams have no "back" line/);

  await page.goto(`/teams/${netball.id}/squad`);
  await page.getByRole("button", { name: `Role for ${kid.full_name}` }).click({ timeout: 15_000 });
  const sheet = page.getByRole("dialog", { name: `Role for ${kid.full_name}` });
  await sheet.getByRole("group", { name: "Never plays" }).getByRole("checkbox", { name: "Attack" }).click();
  await sheet.getByRole("button", { name: "Save role" }).click();
  await expect(sheet).toHaveCount(0);
  await expect
    .poll(async () => {
      const { data } = await admin.from("player_position_prefs").select("kind, line").eq("player_id", kid.id);
      return data;
    })
    .toEqual([{ kind: "never", line: "attack-third" }]);
});

test("0063: a team and a game say their own sport and size", async () => {
  const admin = createAdminClient();
  const ownerId = await superAdminId(admin);

  // No column quietly makes them AFL U10.
  const name = `No defaults ${Date.now() % 100000}`;
  const { error: noSport } = await admin.from("teams").insert({ name, age_group: "go", created_by: ownerId });
  expect(noSport?.message).toMatch(/"sport"/);
  const { error: noAge } = await admin.from("teams").insert({ name, sport: "netball", created_by: ownerId });
  expect(noAge?.message).toMatch(/"age_group"/);

  const team = await makeTeam(admin, { ownerId, sport: "netball", ageGroup: "go" });
  const base = { team_id: team.id, opponent: "Nobody", scheduled_at: new Date().toISOString(), created_by: ownerId };
  const { error: noSize } = await admin.from("games").insert({ ...base, sub_interval_seconds: 300 });
  expect(noSize?.message).toMatch(/"on_field_size"/);
  const { error: noInterval } = await admin.from("games").insert({ ...base, on_field_size: 7 });
  expect(noInterval?.message).toMatch(/"sub_interval_seconds"/);

  // The factory sizes a game from its own team, as createGame does.
  for (const [sport, ageGroup, onField, interval] of [
    ["netball", "go", 7, 300],
    ["rugby_league", "U13", 13, 250],
    ["afl", "U9", 9, 240],
  ] as const) {
    const t = await makeTeam(admin, { ownerId, sport, ageGroup });
    const game = await makeGame(admin, { teamId: t.id, ownerId });
    expect({ on_field_size: game.on_field_size, sub_interval_seconds: game.sub_interval_seconds }, `${sport} ${ageGroup}`)
      .toEqual({ on_field_size: onField, sub_interval_seconds: interval });
  }
});
