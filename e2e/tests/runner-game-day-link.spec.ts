// The game-day link (/run/<token>), as a parent runs the game from it
// (UX round 2, 24 Oct 2026):
//   - the first screen names the game, and its steps match the screen;
//   - "Update availability" opens the who's-here list (it reloaded the
//     same lineup, so a no-show couldn't be marked out);
//   - no Restart, which wiped a live game from a link in a group chat;
//   - EXIT goes somewhere (it linked to the page it was on);
//   - league's try sheet can count a try without a name;
//   - the coach can replace the link, and the old one stops working;
//   - the runner's picker starts from the coach's saved plan, as the
//     coach's does, so both phones show the same lineup.
//
// Covers: src/app/run/[token]/page.tsx, src/app/run/[token]/left/page.tsx,
// RunnerWelcomeBanner, LiveAdminUtilityRow, LeagueScorerPicker,
// GameDayLinkDialog + newGameDayLink.

import { test, expect, type Browser, type Page } from "@playwright/test";
import { createAdminClient } from "../fixtures/supabase";
import { makeTeam, makePlayers, makeGame } from "../fixtures/factories";
import type { SportId } from "../../src/lib/sports";

test.describe.configure({ mode: "parallel" });

const OPPONENT = "Kew Kestrels";
type Admin = ReturnType<typeof createAdminClient>;

async function ownerIdOf(admin: Admin): Promise<string> {
  const { data } = await admin.auth.admin.listUsers({ perPage: 1000 });
  return data.users.find((u) => u.email === process.env.TEST_SUPER_ADMIN_EMAIL)!.id;
}

async function teamWithGame(admin: Admin, sport: SportId, ageGroup: string, count: number) {
  const ownerId = await ownerIdOf(admin);
  const team = await makeTeam(admin, {
    ownerId,
    ageGroup,
    sport,
    name: `R1-RUN-${sport}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
  });
  await admin.from("teams").update({ track_scoring: true }).eq("id", team.id);
  const players = await makePlayers(admin, { teamId: team.id, ownerId, count, ageGroup: "U10" });
  const game = await makeGame(admin, { teamId: team.id, ownerId, opponent: OPPONENT });
  await admin
    .from("game_availability")
    .insert(players.map((p) => ({ game_id: game.id, player_id: p.id, status: "available" as const })));
  return { team, players, game, ownerId };
}

async function runnerPhone(browser: Browser): Promise<Page> {
  const context = await browser.newContext({ storageState: undefined });
  await context.addInitScript(() => {
    try {
      localStorage.setItem("nb-walkthrough-seen", "1");
      localStorage.setItem("gm-walkthrough-seen", "1");
    } catch {}
  });
  return context.newPage();
}

test("touch: the runner's first screen names the game, and a no-show can be marked out before kickoff", async ({ browser }) => {
  const admin = createAdminClient();
  const { team, players, game } = await teamWithGame(admin, "touch", "U10", 10);
  const runner = await runnerPhone(browser);
  await runner.goto(`/run/${game.share_token}`);

  const welcome = runner.getByRole("region", { name: /welcome/i });
  await expect(welcome).toContainText(`You're running today's game for ${team.name} vs ${OPPONENT}.`, { timeout: 15_000 });
  // The steps describe this screen: the lineup's Update availability, and Start H1.
  await expect(welcome).toContainText(/Tap "Update availability" above the lineup/);
  await expect(welcome).toContainText("just tap Start H1");
  await expect(runner.getByRole("button", { name: /^start h1$/i })).toBeVisible();

  // Update availability opens the who's-here list.
  const noShow = players[players.length - 1];
  await runner.getByRole("link", { name: /update availability/i }).click();
  await expect(runner).toHaveURL(new RegExp(`/run/${game.share_token}\\?step=availability$`));
  const row = runner.getByRole("radiogroup", { name: `${noShow.full_name} availability` });
  await row.getByRole("radio", { name: "Out" }).click();
  await expect(row.getByRole("radio", { name: "Out" })).toHaveAttribute("aria-checked", "true");
  await expect
    .poll(async () => {
      const { data } = await admin
        .from("game_availability")
        .select("status")
        .eq("game_id", game.id)
        .eq("player_id", noShow.id)
        .maybeSingle();
      return (data as { status?: string } | null)?.status;
    })
    .toBe("unavailable");

  // Back to the lineup: the no-show isn't in it.
  await runner.getByRole("link", { name: /back to the lineup/i }).click();
  await expect(runner.getByRole("button", { name: /^start h1$/i })).toBeVisible({ timeout: 15_000 });
  await expect(runner.getByText(noShow.full_name, { exact: true })).toHaveCount(0);
  await runner.context().close();
});

test("touch: the runner can't restart the game, and EXIT leaves it", async ({ browser }) => {
  const admin = createAdminClient();
  const { game } = await teamWithGame(admin, "touch", "U10", 10);
  const runner = await runnerPhone(browser);
  await runner.goto(`/run/${game.share_token}`);
  await runner.getByRole("button", { name: /^start h1$/i }).click({ timeout: 15_000 });
  await runner.getByRole("button", { name: /^start h1 now$/i }).click();
  await expect(runner.getByRole("button", { name: /exit live game/i })).toBeVisible({ timeout: 15_000 });
  await expect(runner.getByRole("button", { name: /add late arrival|game settings/i }).first()).toBeVisible();

  // No Restart on a game-day link.
  await expect(runner.getByRole("button", { name: /restart game/i })).toHaveCount(0);

  await runner.getByRole("button", { name: /exit live game/i }).click();
  await expect(runner).toHaveURL(new RegExp(`/run/${game.share_token}/left$`), { timeout: 15_000 });
  await expect(runner.getByRole("heading", { name: "You've left the game" })).toBeVisible();
  await runner.getByRole("link", { name: "Back to the game" }).click();
  await expect(runner.getByRole("button", { name: /exit live game/i })).toBeVisible({ timeout: 15_000 });
  await runner.context().close();
});

test("netball: the runner's first screen names the game", async ({ browser }) => {
  // Netball's banner only showed when too few kids were marked in, so it
  // never showed: the runner never saw which team or game it was.
  const admin = createAdminClient();
  const { team, game } = await teamWithGame(admin, "netball", "go", 9);
  const runner = await runnerPhone(browser);
  await runner.goto(`/run/${game.share_token}`);
  await expect(runner.getByRole("region", { name: /welcome/i })).toContainText(
    `You're running today's game for ${team.name} vs ${OPPONENT}.`,
    { timeout: 15_000 },
  );
  await expect(runner.getByRole("button", { name: /^start q1$/i })).toBeVisible();
  await runner.context().close();
});

test("netball: the runner's picker starts from the coach's saved plan, as the coach's does", async ({ page, browser }) => {
  // The two phones suggested different lineups for the same kickoff.
  const admin = createAdminClient();
  const { team, players, game, ownerId } = await teamWithGame(admin, "netball", "go", 9);
  const keys = ["gs", "ga", "wa", "c", "wd", "gd", "gk"];
  // The plan: the last two kids shoot.
  const order = [players[8], players[7], ...players.slice(0, 7)];
  await admin.from("game_lineup_drafts").insert({
    game_id: game.id,
    lineup: { positions: Object.fromEntries(keys.map((k, i) => [k, [order[i].id]])), bench: order.slice(7).map((p) => p.id) },
    on_field_size: game.on_field_size,
    sub_interval_seconds: game.sub_interval_seconds,
    updated_by: ownerId,
  });

  await page.addInitScript(() => localStorage.setItem("nb-walkthrough-seen", "1"));
  await page.goto(`/teams/${team.id}/games/${game.id}/live`);
  const runner = await runnerPhone(browser);
  await runner.goto(`/run/${game.share_token}`);
  for (const phone of [page, runner]) {
    await expect(phone.getByRole("button", { name: new RegExp(`^${players[8].full_name}, Goal Shooter`, "i") })).toBeVisible({
      timeout: 15_000,
    });
    await expect(phone.getByRole("button", { name: new RegExp(`^${players[7].full_name}, Goal Attack`, "i") })).toBeVisible();
  }
  await runner.context().close();
});

test("league: the runner can count a try without a name (Not sure who)", async ({ browser }) => {
  const admin = createAdminClient();
  const { players, game, ownerId } = await teamWithGame(admin, "rugby_league", "U10", 13);
  await admin.from("games").update({ on_field_size: 11, status: "in_progress" }).eq("id", game.id);
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
    { game_id: game.id, type: "quarter_start", metadata: { quarter: 1, sport: "rugby_league" }, created_by: ownerId },
  ]);

  const runner = await runnerPhone(browser);
  await runner.goto(`/run/${game.share_token}`);
  await runner.getByRole("button", { name: "Record a try for our team" }).click({ timeout: 15_000 });
  const sheet = runner.getByRole("dialog", { name: /who scored/i });
  await expect(sheet).toBeVisible();
  await sheet.getByRole("button", { name: /^Not sure who/ }).click();
  await expect
    .poll(
      async () => {
        const { data } = await admin.from("game_events").select("player_id").eq("game_id", game.id).eq("type", "try");
        return data ?? [];
      },
      { timeout: 15_000 },
    )
    .toEqual([{ player_id: null }]);
  await runner.context().close();
});

test("the coach replaces the game-day link, and the old one stops working", async ({ page, browser }) => {
  const admin = createAdminClient();
  const { team, game } = await teamWithGame(admin, "touch", "U10", 10);
  const oldToken = game.share_token;

  await page.goto(`/teams/${team.id}/games/${game.id}`);
  await page.getByRole("button", { name: "More actions" }).click({ timeout: 15_000 });
  await page.getByRole("button", { name: /game-day link/i }).click();
  await expect(page.getByLabel("Game-day link")).toHaveValue(new RegExp(`/run/${oldToken}$`));
  await page.getByRole("button", { name: "Get a new link" }).click();
  await expect(page.getByRole("heading", { name: "Get a new link?" })).toBeVisible();
  await page.getByRole("button", { name: "Get a new link" }).click();
  await expect(page.getByText("New link ready.", { exact: false })).toBeVisible({ timeout: 15_000 });

  const { data } = await admin.from("games").select("share_token").eq("id", game.id).single();
  const newToken = (data as { share_token: string }).share_token;
  expect(newToken).not.toBe(oldToken);
  await expect(page.getByLabel("Game-day link")).toHaveValue(new RegExp(`/run/${newToken}$`));

  const runner = await runnerPhone(browser);
  expect((await runner.goto(`/run/${oldToken}`))?.status()).toBe(404);
  expect((await runner.goto(`/run/${newToken}`))?.status()).toBe(200);
  await expect(runner.getByRole("button", { name: /^start h1$/i })).toBeVisible({ timeout: 15_000 });
  await runner.context().close();
});
