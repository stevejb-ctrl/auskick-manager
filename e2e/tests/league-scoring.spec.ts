// ─── Rugby league scoring rules ─────────────────────────────────
// Stagehand round 2 (2026-10): a league game held a made conversion
// and no try. The scorebug's +C opened the kicker picker at any time
// and the server took the kick. A conversion now needs a try still
// waiting for one; Force (the laws §15 fouled-try-scorer extra kick)
// is the only way past that.
//
// The same run found league Undo did nothing: the write queue appends
// its idempotency key as the last argument, which landed in
// undoLeagueScore's optional `kind` filter, so the server looked for
// a score of type "<uuid>" and gave up.

import { test, expect, type Page } from "@playwright/test";
import { createAdminClient } from "../fixtures/supabase";
import { makeTeam, makePlayers, makeGame } from "../fixtures/factories";

test.describe.configure({ mode: "serial" });

async function seedLeagueGame() {
  const admin = createAdminClient();
  const { data: superAdmin } = await admin.auth.admin.listUsers();
  const ownerId = superAdmin.users.find(
    (u) => u.email === process.env.TEST_SUPER_ADMIN_EMAIL,
  )!.id;
  const team = await makeTeam(admin, {
    ownerId,
    ageGroup: "U10",
    sport: "rugby_league",
    name: `RL-Score-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
  });
  await admin.from("teams").update({ track_scoring: true }).eq("id", team.id);
  const players = await makePlayers(admin, {
    teamId: team.id,
    ownerId,
    count: 13,
    ageGroup: "U10",
  });
  const game = await makeGame(admin, { teamId: team.id, ownerId, ageGroup: "U10" });
  await admin.from("games").update({ on_field_size: 11 }).eq("id", game.id);
  await admin.from("game_availability").insert(
    players.map((p) => ({
      game_id: game.id,
      player_id: p.id,
      status: "available",
      updated_by: ownerId,
    })),
  );
  await admin.from("game_events").insert([
    {
      game_id: game.id,
      type: "lineup_set",
      metadata: {
        lineup: {
          forwards: players.slice(0, 5).map((p) => p.id),
          backs: players.slice(5, 11).map((p) => p.id),
          bench: players.slice(11).map((p) => p.id),
        },
        sport: "rugby_league",
      },
      created_by: ownerId,
    },
    {
      game_id: game.id,
      type: "quarter_start",
      metadata: { quarter: 1, sport: "rugby_league" },
      created_by: ownerId,
    },
  ]);
  await admin.from("games").update({ status: "in_progress" }).eq("id", game.id);
  return { admin, team, players, game };
}

async function eventsOfType(
  admin: ReturnType<typeof createAdminClient>,
  gameId: string,
  type: string,
) {
  const { data } = await admin
    .from("game_events")
    .select("id, player_id, metadata")
    .eq("game_id", gameId)
    .eq("type", type)
    .order("created_at", { ascending: true });
  return data ?? [];
}

function kickerRow(page: Page, name: string) {
  return page
    .getByRole("dialog", { name: /record conversion/i })
    .locator("div.rounded-lg")
    .filter({ hasText: name });
}

test("a conversion needs a try to convert, and Undo takes back the latest score", async ({ page }) => {
  test.setTimeout(120_000);
  const { admin, team, players, game } = await seedLeagueGame();
  const kicker = players[1];

  await page.goto(`/teams/${team.id}/games/${game.id}/live`);
  await expect(page.getByText(/half\s*1/i).first()).toBeVisible({ timeout: 15_000 });

  // No try yet: +C still opens the picker (Force needs a way in), but
  // it says why it can't record a kick, and Made / Missed are off.
  await page.getByRole("button", { name: "Record a conversion for our team" }).click();
  const dialog = page.getByRole("dialog", { name: /record conversion/i });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText(/no try to convert/i)).toBeVisible();
  await expect(kickerRow(page, kicker.full_name).getByRole("button", { name: /^made$/i })).toBeDisabled();
  // Force is the fouled-try-scorer carve-out: it opens the rows up.
  await dialog.getByRole("checkbox").check();
  await expect(kickerRow(page, kicker.full_name).getByRole("button", { name: /^made$/i })).toBeEnabled();
  await dialog.getByRole("button", { name: /^cancel$/i }).click();
  await expect(dialog).toBeHidden();

  // A try opens the picker with its try named on the kick.
  await page.getByTestId(`league-player-tile-${players[0].id}`).click();
  await page.getByRole("button", { name: /^\+\s*try$/i }).click();
  await expect.poll(async () => (await eventsOfType(admin, game.id, "try")).length).toBe(1);
  const [tryEvent] = await eventsOfType(admin, game.id, "try");
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText(/no try to convert/i)).toBeHidden();
  await kickerRow(page, kicker.full_name).getByRole("button", { name: /^made$/i }).click();
  await expect.poll(async () => (await eventsOfType(admin, game.id, "conversion_attempt")).length).toBe(1);
  const [conversion] = await eventsOfType(admin, game.id, "conversion_attempt");
  expect((conversion.metadata as { try_event_id?: string }).try_event_id).toBe(tryEvent.id);

  // The try is converted now, so a second +C is back to Force only.
  await page.getByRole("button", { name: "Record a conversion for our team" }).click();
  await expect(dialog.getByText(/no try to convert/i)).toBeVisible();
  await dialog.getByRole("button", { name: /^cancel$/i }).click();

  // Undo takes back the conversion (the latest score), not nothing.
  await page.getByRole("button", { name: /^undo$/i }).click();
  await expect.poll(async () => (await eventsOfType(admin, game.id, "score_undo")).length).toBe(1);
  const [undo] = await eventsOfType(admin, game.id, "score_undo");
  expect((undo.metadata as { target_event_id?: string }).target_event_id).toBe(conversion.id);

  // With the kick undone, the try is waiting for its conversion again.
  await page.reload();
  await page.getByRole("button", { name: "Record a conversion for our team" }).click();
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText(/no try to convert/i)).toBeHidden();
  await expect(kickerRow(page, kicker.full_name).getByRole("button", { name: /^made$/i })).toBeEnabled();
});
