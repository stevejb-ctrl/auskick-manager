// The score chips are real sideline targets: at least 44 × 44 pt and
// never overlapping, in every sport (Stagehand union game day, 16 Oct
// 2026). Union shows four per side (+T, +C, +PG, +DG) and a tap meant
// for +T landed between it and +PG; the chips were about 36 px tall.

import { test, expect, type Locator, type Page } from "@playwright/test";
import { createAdminClient } from "../fixtures/supabase";
import { makeTeam, makePlayers, makeGame } from "../fixtures/factories";
import { waitForHydration } from "../helpers/navigation";

type Box = { x: number; y: number; width: number; height: number };

async function boxesOf(chips: Locator[]): Promise<Box[]> {
  const boxes: Box[] = [];
  for (const chip of chips) {
    await expect(chip).toBeVisible();
    boxes.push((await chip.boundingBox())!);
  }
  return boxes;
}

function expectTargets(boxes: Box[]) {
  for (const b of boxes) {
    expect(b.height).toBeGreaterThanOrEqual(44);
    expect(b.width).toBeGreaterThanOrEqual(44);
  }
  for (let i = 0; i < boxes.length; i++) {
    for (let j = i + 1; j < boxes.length; j++) {
      const a = boxes[i], b = boxes[j];
      const overlap = a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
      expect(overlap, `chips ${i} and ${j} overlap`).toBe(false);
    }
  }
}

async function kickOff(page: Page, period: "q" | "h") {
  await page.getByRole("button", { name: new RegExp(`^start ${period}1$`, "i") }).click({ timeout: 15_000 });
  await page.getByRole("button", { name: /^start [qh]\d+ now$/i }).click({ timeout: 10_000 });
  await expect(page.getByRole("button", { name: new RegExp(`^clock — ${period}1, running$`, "i") })).toBeVisible({ timeout: 15_000 });
}

async function scoringGame(sport: "afl" | "rugby_union", ageGroup: string, count: number) {
  const admin = createAdminClient();
  const { data: su } = await admin.auth.admin.listUsers();
  const ownerId = su.users.find((u) => u.email === process.env.TEST_SUPER_ADMIN_EMAIL)!.id;
  const team = await makeTeam(admin, { ownerId, sport, ageGroup, name: `Chips ${sport} ${Date.now() % 100000}` });
  await admin.from("teams").update({ track_scoring: true }).eq("id", team.id);
  const players = await makePlayers(admin, { teamId: team.id, ownerId, count });
  const game = await makeGame(admin, { teamId: team.id, ownerId });
  await admin.from("game_availability").insert(
    players.map((p) => ({ game_id: game.id, player_id: p.id, status: "available" as const, updated_by: ownerId })),
  );
  return { team, game };
}

test.use({ viewport: { width: 375, height: 740 } });

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    try {
      for (const k of ["gm-walkthrough-seen", "league-walkthrough-seen", "rl-walkthrough-seen"]) localStorage.setItem(k, "1");
    } catch {}
  });
});

test("union U12: all four score chips are 44 pt targets that don't overlap", async ({ page }) => {
  test.setTimeout(120_000);
  const { team, game } = await scoringGame("rugby_union", "U12", 17);
  await page.goto(`/teams/${team.id}/games/${game.id}/live`);
  await waitForHydration(page);
  await kickOff(page, "h");
  const ours = ["Record a try for our team", "Record a conversion for our team", "Record a penalty goal for our team", "Record a drop goal for our team"].map(
    (name) => page.getByRole("button", { name }),
  );
  expectTargets(await boxesOf(ours));
});

test("AFL: +G and +B are 44 pt targets", async ({ page }) => {
  test.setTimeout(120_000);
  const { team, game } = await scoringGame("afl", "U12", 14);
  await page.goto(`/teams/${team.id}/games/${game.id}/live`);
  await waitForHydration(page);
  await kickOff(page, "q");
  expectTargets(await boxesOf([page.getByRole("button", { name: "+G" }).first(), page.getByRole("button", { name: "+B" }).first()]));
});
