// The forwards / backs time bar speaks the grade's own words (Stagehand
// sideline-chaos-union, 16 Oct 2026). Its centre segment is time wearing
// league's First Receiver or Dummy Half vest; union wears no vests, yet
// its Game settings sheet and team settings said "Centre = time wearing
// the FR or DH vest" and the colour key listed a Centre it never fills.
//
//   - Union: key is Fwd / Back; neither settings surface names a vest.
//   - League U10 (FR and DH vests): Fwd / Centre / Back, and the vest
//     is still explained.

import { test, expect, type Page } from "@playwright/test";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "../fixtures/supabase";
import { makeTeam, makePlayers, makeGame } from "../fixtures/factories";
import { waitForHydration } from "../helpers/navigation";

test.describe.configure({ mode: "parallel" });

async function ownerOf(admin: SupabaseClient): Promise<string> {
  const { data } = await admin.auth.admin.listUsers();
  return data.users.find((u) => u.email === process.env.TEST_SUPER_ADMIN_EMAIL)!.id;
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    try {
      for (const k of ["league-walkthrough-seen", "rl-walkthrough-seen", "gm-walkthrough-seen"]) localStorage.setItem(k, "1");
    } catch {}
  });
});

/** A side mid-first-period with the zone-time bar on. */
async function gameUnderWay(admin: SupabaseClient, sport: "rugby_union" | "rugby_league") {
  const ownerId = await ownerOf(admin);
  const union = sport === "rugby_union";
  const ageGroup = union ? "U12" : "U10";
  const team = await makeTeam(admin, { ownerId, sport, ageGroup, name: `ZONE-${sport}-${Date.now()}` });
  await admin.from("teams").update({ track_zone_time: true }).eq("id", team.id);
  const players = await makePlayers(admin, { teamId: team.id, ownerId, count: union ? 17 : 13, ageGroup });
  const game = await makeGame(admin, { teamId: team.id, ownerId });
  const onField = union ? 15 : 11;
  const { error } = await admin
    .from("games")
    .update({ on_field_size: onField, sub_interval_seconds: 900, status: "in_progress", track_zone_time: true })
    .eq("id", game.id);
  if (error) throw new Error(error.message);
  await admin.from("game_availability").insert(
    players.map((p) => ({ game_id: game.id, player_id: p.id, status: "available" as const, updated_by: ownerId })),
  );
  const ids = players.map((p) => p.id);
  const forwards = union ? 8 : 5;
  const lineup = { forwards: ids.slice(0, forwards), backs: ids.slice(forwards, onField), bench: ids.slice(onField) };
  const t = (secAgo: number) => new Date(Date.now() - secAgo * 1000).toISOString();
  const events: Array<Record<string, unknown>> = [
    { type: "lineup_set", metadata: { lineup, sport }, created_at: t(20) },
    { type: "quarter_start", metadata: { quarter: 1, sport }, created_at: t(19) },
  ];
  if (!union) {
    events.push(
      { type: "vest_assigned", player_id: ids[0], metadata: { vest: "fr", period: 1, replacement: false, sport }, created_at: t(18) },
      { type: "vest_assigned", player_id: ids[1], metadata: { vest: "dh", period: 1, replacement: false, sport }, created_at: t(18) },
      { type: "kickoff_taken", player_id: ids[2], metadata: { period: 1, sport }, created_at: t(17) },
    );
  }
  const { error: evErr } = await admin
    .from("game_events")
    .insert(events.map((e) => ({ ...e, game_id: game.id, created_by: ownerId })));
  if (evErr) throw new Error(evErr.message);
  return { team, game };
}

async function settingsSheetText(page: Page): Promise<string> {
  await page.getByRole("button", { name: "Game settings", exact: true }).click();
  const row = page.getByRole("dialog").getByText("Track forward and back time", { exact: true }).locator("..");
  await expect(row).toBeVisible();
  return row.innerText();
}

test("union: the zone-time bar is forwards and backs, and no setting names a vest", async ({ page }) => {
  test.setTimeout(120_000);
  const admin = createAdminClient();
  const { team, game } = await gameUnderWay(admin, "rugby_union");

  await page.goto(`/teams/${team.id}/games/${game.id}/live`);
  await waitForHydration(page);
  await expect(page.getByRole("group", { name: "Colour key: Fwd, Back" })).toBeVisible({ timeout: 15_000 });
  const sheet = await settingsSheetText(page);
  expect(sheet).not.toMatch(/vest|centre|F\/C\/B/i);

  await page.goto(`/teams/${team.id}/settings`);
  await waitForHydration(page);
  const card = page.getByText("Track forward and back time", { exact: true }).locator("..");
  await expect(card).toBeVisible({ timeout: 15_000 });
  expect(await card.innerText()).not.toMatch(/vest|centre/i);
});

test("league U10: the centre segment is still the FR or DH vest", async ({ page }) => {
  test.setTimeout(120_000);
  const admin = createAdminClient();
  const { team, game } = await gameUnderWay(admin, "rugby_league");

  await page.goto(`/teams/${team.id}/games/${game.id}/live`);
  await waitForHydration(page);
  await expect(page.getByRole("group", { name: "Colour key: Fwd, Centre, Back" })).toBeVisible({ timeout: 15_000 });
  expect(await settingsSheetText(page)).toMatch(/Centre = time wearing the FR or DH vest/);

  await page.goto(`/teams/${team.id}/settings`);
  await waitForHydration(page);
  const card = page.getByText("Track forward and back time", { exact: true }).locator("..");
  await expect(card).toBeVisible({ timeout: 15_000 });
  expect(await card.innerText()).toMatch(/FR or DH vest/);
});
