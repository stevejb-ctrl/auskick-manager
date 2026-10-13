// ─── Pre-game rotation planner (GamePlanModal) ───────────────
// The coach's pre-kickoff "Game plan" affordance: auto-suggests a
// fair full-game rotation, lets the coach tweak it tap-to-swap, and
// hands over copy/paste text for the team chat. Pure client compute —
// no DB write, no change to how the live game runs (see the locked
// scope in src/lib/game-plan + src/components/game-plan).
//
// This spec exercises the feature through the UI on both mount
// surfaces and all three sports, per CLAUDE.md "reuse before you
// fork" (one planner, mounted consistently AFL / netball / RL):
//
//   1. AFL, game-detail entry — full interaction: open, rows render,
//      copy text is populated, tap-to-swap re-projects, close.
//   2. AFL, pre-kickoff /live breadcrumb entry — same button opens
//      the same planner from the lineup picker.
//   3. Netball, game-detail entry — netball projection drives the
//      single shared modal.
//   4. Rugby league, game-detail entry — RL projection drives it too.
//
// Covers: src/components/game-plan/{GamePlanButton,GamePlanModal}.tsx,
//         the game-detail upcoming action row + the LineupPicker
//         breadcrumb `action` slot.

import { test, expect } from "@playwright/test";
import { createAdminClient } from "../fixtures/supabase";
import { makeTeam, makePlayers, makeGame } from "../fixtures/factories";

/** Player ids of the tiles in a lineup's bench, sorted. */
async function benchIds(scope: import("@playwright/test").Locator, prefix: string): Promise<string[]> {
  const ids = await scope
    .locator(`[data-testid^="${prefix}"]`)
    .evaluateAll((els, p) => els.map((e) => (e.getAttribute("data-testid") ?? "").slice((p as string).length)), prefix);
  return Array.from(new Set(ids)).sort();
}

/** Player ids listed in a Game plan card, sorted. */
async function planIds(card: import("@playwright/test").Locator): Promise<string[]> {
  const ids = await card.locator("[data-player-id]").evaluateAll((els) => els.map((e) => e.getAttribute("data-player-id") ?? ""));
  return ids.sort();
}

/** In the open Game plan, swap the first on-field kid with the first one resting. */
async function swapInPlan(page: import("@playwright/test").Page) {
  const fieldRow = page.locator('[data-testid^="game-plan-group-"] [data-player-id]').first();
  const benchRow = page.locator('[data-testid="game-plan-bench"] [data-player-id]').first();
  const fieldKid = (await fieldRow.getAttribute("data-player-id"))!;
  const benchKid = (await benchRow.getAttribute("data-player-id"))!;
  await fieldRow.click();
  await benchRow.click();
  await expect(page.locator(`[data-testid="game-plan-bench"] [data-player-id="${fieldKid}"]`)).toBeVisible();
  return { fieldKid, benchKid };
}

test.describe.configure({ mode: "parallel" });

function ownerIdFinder() {
  return async () => {
    const admin = createAdminClient();
    const { data } = await admin.auth.admin.listUsers();
    return data.users.find(
      (u) => u.email === process.env.TEST_SUPER_ADMIN_EMAIL,
    )!.id;
  };
}
const getOwnerId = ownerIdFinder();

test("AFL game-detail: planner opens, rows render, copy text populates, tap-to-swap re-projects", async ({
  page,
}) => {
  const admin = createAdminClient();
  const ownerId = await getOwnerId();

  const team = await makeTeam(admin, {
    ownerId,
    ageGroup: "U10",
    name: `GP-AFL-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
  });
  // 15 active players → 12 on field (U10) + a 3-player bench, so the
  // tap-to-swap below can swap an on-field player with a bench player
  // and the projected text is guaranteed to change.
  await makePlayers(admin, { teamId: team.id, ownerId, count: 15 });
  const game = await makeGame(admin, {
    teamId: team.id,
    ownerId,
    opponent: "Eagles",
  });

  await page.goto(`/teams/${team.id}/games/${game.id}`);

  // The "Game plan" opener sits in the upcoming-game action row,
  // alongside "Start game" / "Set lineup".
  await page
    .getByRole("button", { name: /^game plan$/i })
    .click({ timeout: 15_000 });

  // Modal open — the heading is the cleanest signal (the opener button
  // shares the "Game plan" label but is a button, not a heading).
  await expect(
    page.getByRole("heading", { name: /^game plan$/i }),
  ).toBeVisible({ timeout: 10_000 });

  // Every available player is placed somewhere (a group or the bench)
  // in the active period — 15 squad → 15 tappable rows.
  const rows = page.getByTestId("game-plan-player");
  await expect(rows).toHaveCount(15);

  // Copy block is live-populated with the formatted plan.
  const planText = page.locator("#game-plan-text");
  await expect(planText).toContainText("Game plan —");
  await expect(planText).toContainText(team.name);
  await expect(planText).toContainText("Eagles");

  // AFL rolls subs, so the plan reads as an interchange queue with a sub
  // cadence — who is where each quarter, not whole-quarter blocks.
  await expect(planText).toContainText("Interchange (on first → last):");
  await expect(planText).toContainText(/subs ~every \d+ min/);
  // The plan is who-is-where only — no per-player game-time footer.
  await expect(planText).not.toContainText(/planned game time/i);
  // The editor's bench card is relabelled to the interchange queue.
  await expect(
    page.getByRole("heading", { name: /^interchange$/i }),
  ).toBeVisible();

  const before = (await planText.textContent()) ?? "";

  // Tap-to-swap: tap the first on-field row to arm it ("Swapping…"),
  // then the last (bench) row to exchange them. Swapping an on-field
  // player with a bench player re-projects, so the plan text changes.
  await rows.first().click();
  await expect(page.getByText(/swapping…/i)).toBeVisible();
  await rows.last().click();
  await expect(page.getByText(/swapping…/i)).toHaveCount(0);

  await expect(async () => {
    const after = (await planText.textContent()) ?? "";
    expect(after).not.toBe(before);
  }).toPass({ timeout: 5_000 });

  // Close via the footer "Done" button → modal dismissed.
  await page.getByRole("button", { name: /^done$/i }).click();
  await expect(
    page.getByRole("heading", { name: /^game plan$/i }),
  ).toHaveCount(0);
});

test("AFL pre-kickoff: planner opens from the lineup-picker breadcrumb on /live", async ({
  page,
}) => {
  const admin = createAdminClient();
  const ownerId = await getOwnerId();

  const team = await makeTeam(admin, {
    ownerId,
    ageGroup: "U10",
    name: `GP-LIVE-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
  });
  const players = await makePlayers(admin, {
    teamId: team.id,
    ownerId,
    count: 15,
  });
  const game = await makeGame(admin, { teamId: team.id, ownerId });

  // /live short-circuits to "No players marked available" unless there
  // are available rows — seed availability so the LineupPicker (and its
  // breadcrumb action slot) renders. Mirrors lineup.spec.ts.
  await admin.from("game_availability").insert(
    players.map((p) => ({
      game_id: game.id,
      player_id: p.id,
      status: "available" as const,
      updated_by: ownerId,
    })),
  );

  await page.goto(`/teams/${team.id}/games/${game.id}/live`);

  // Wait for the picker to render (its commit CTA) before reaching for
  // the breadcrumb-mounted planner button.
  await expect(
    page.getByRole("button", { name: /^start q1$/i }),
  ).toBeVisible({ timeout: 15_000 });

  // Usability run: Game plan's Q1 disagreed with the lineup, and changes
  // made in it went nowhere. Before kickoff its Q1 IS the lineup, and
  // "Use this plan" puts changes back.
  const lineupBench = await benchIds(page.getByRole("group", { name: "Bench", exact: true }), "player-tile-");
  await page.getByRole("button", { name: /^game plan$/i }).click();

  await expect(
    page.getByRole("heading", { name: /^game plan$/i }),
  ).toBeVisible({ timeout: 10_000 });
  await expect(page.getByTestId("game-plan-player").first()).toBeVisible();
  await expect(page.locator("#game-plan-text")).toContainText("Game plan —");
  expect(await planIds(page.getByTestId("game-plan-bench"))).toEqual(lineupBench);

  const { fieldKid, benchKid } = await swapInPlan(page);
  await page.getByRole("button", { name: "Use this plan" }).click();
  await expect(page.getByRole("heading", { name: /^game plan$/i })).toHaveCount(0);
  const bench = page.getByRole("group", { name: "Bench", exact: true });
  await expect(bench.getByTestId(`player-tile-${fieldKid}`)).toBeVisible();
  await expect(bench.getByTestId(`player-tile-${benchKid}`)).toHaveCount(0);
});

test("AFL pre-kickoff: Game plan follows the lineup's field size and sub interval", async ({ page }) => {
  // Stagehand round 2: the plan used the game's stored field size and
  // the age-group sub cadence ("every 4 min") while the lineup said 11
  // on field and "Sub every 10m".
  const admin = createAdminClient();
  const ownerId = await getOwnerId();
  const team = await makeTeam(admin, { ownerId, ageGroup: "U10" });
  const players = await makePlayers(admin, { teamId: team.id, ownerId, count: 15 });
  const game = await makeGame(admin, { teamId: team.id, ownerId });
  await admin.from("game_availability").insert(
    players.map((p) => ({ game_id: game.id, player_id: p.id, status: "available" as const, updated_by: ownerId })),
  );
  await page.goto(`/teams/${team.id}/games/${game.id}/live`);
  await expect(page.getByRole("button", { name: /^start q1$/i })).toBeVisible({ timeout: 15_000 });

  await page.getByRole("button", { name: /game settings/i }).click();
  const size = page.locator("#on-field-size");
  const fewer = Number(await size.inputValue()) - 1;
  await size.selectOption(String(fewer));
  await page.locator("#sub-minutes").fill("10");
  await expect(page.getByText("Sub every 10m")).toBeVisible();

  await page.getByRole("button", { name: /^game plan$/i }).click();
  await expect(page.getByRole("heading", { name: /^game plan$/i })).toBeVisible({ timeout: 10_000 });
  await expect(page.locator("#game-plan-text")).toContainText("subs ~every 10 min");
  // Q1 is the lineup itself; Q2 on is projected, at the lineup's size.
  const onField = page.locator('[data-testid^="game-plan-group-"] [data-player-id]');
  await expect(onField).toHaveCount(fewer);
  await page.getByRole("tab", { name: "Q2" }).click();
  await expect(onField).toHaveCount(fewer);
});

test("netball pre-kickoff: Game plan's first quarter is the lineup, and Use this plan applies changes", async ({
  page,
}) => {
  const admin = createAdminClient();
  const ownerId = await getOwnerId();
  const team = await makeTeam(admin, { ownerId, ageGroup: "go", sport: "netball" });
  const players = await makePlayers(admin, { teamId: team.id, ownerId, count: 9, ageGroup: "U10" });
  const game = await makeGame(admin, { teamId: team.id, ownerId, ageGroup: "U10" });
  await admin.from("game_availability").insert(
    players.map((p) => ({ game_id: game.id, player_id: p.id, status: "available" as const, updated_by: ownerId })),
  );
  await page.addInitScript(() => {
    try {
      localStorage.setItem("nb-walkthrough-seen", "1");
    } catch {}
  });
  await page.goto(`/teams/${team.id}/games/${game.id}/live`);
  await expect(page.locator('[data-testid^="bench-chip-"]').first()).toBeVisible({ timeout: 15_000 });
  const lineupBench = await benchIds(page.locator("body"), "bench-chip-");

  await page.getByRole("button", { name: /^game plan$/i }).click();
  await expect(page.getByRole("heading", { name: /^game plan$/i })).toBeVisible({ timeout: 10_000 });
  expect(await planIds(page.getByTestId("game-plan-bench"))).toEqual(lineupBench);

  const { fieldKid, benchKid } = await swapInPlan(page);
  await page.getByRole("button", { name: "Use this plan" }).click();
  await expect(page.getByTestId(`bench-chip-${fieldKid}`)).toBeVisible();
  await expect(page.getByTestId(`bench-chip-${benchKid}`)).toHaveCount(0);
});

test("league pre-kickoff: Game plan's first half is the lineup, and Use this plan applies changes", async ({
  page,
}) => {
  const admin = createAdminClient();
  const ownerId = await getOwnerId();
  const team = await makeTeam(admin, { ownerId, ageGroup: "U9", sport: "rugby_league" });
  const players = await makePlayers(admin, { teamId: team.id, ownerId, count: 11, ageGroup: "U9" });
  const game = await makeGame(admin, { teamId: team.id, ownerId, ageGroup: "U9" });
  await admin.from("game_availability").insert(
    players.map((p) => ({ game_id: game.id, player_id: p.id, status: "available" as const, updated_by: ownerId })),
  );
  await page.addInitScript(() => {
    try {
      localStorage.setItem("rl-walkthrough-seen", "1");
    } catch {}
  });
  await page.goto(`/teams/${team.id}/games/${game.id}/live`);
  const benchGroup = page.getByRole("group", { name: "Bench", exact: true });
  await expect(benchGroup.locator('[data-testid^="league-player-tile-"]').first()).toBeVisible({ timeout: 15_000 });
  const lineupBench = await benchIds(benchGroup, "league-player-tile-");

  await page.getByRole("button", { name: /^game plan$/i }).click();
  await expect(page.getByRole("heading", { name: /^game plan$/i })).toBeVisible({ timeout: 10_000 });
  expect(await planIds(page.getByTestId("game-plan-bench"))).toEqual(lineupBench);

  const { fieldKid, benchKid } = await swapInPlan(page);
  await page.getByRole("button", { name: "Use this plan" }).click();
  await expect(benchGroup.getByTestId(`league-player-tile-${fieldKid}`)).toBeVisible();
  await expect(benchGroup.getByTestId(`league-player-tile-${benchKid}`)).toHaveCount(0);
});

test("Netball game-detail: the shared planner is driven by the netball projection", async ({
  page,
}) => {
  const admin = createAdminClient();
  const ownerId = await getOwnerId();

  const team = await makeTeam(admin, {
    ownerId,
    ageGroup: "go",
    sport: "netball",
    name: `GP-NB-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
  });
  await makePlayers(admin, {
    teamId: team.id,
    ownerId,
    count: 9,
    ageGroup: "U10",
  });
  const game = await makeGame(admin, {
    teamId: team.id,
    ownerId,
    ageGroup: "U10",
    opponent: "Comets",
  });

  await page.goto(`/teams/${team.id}/games/${game.id}`);

  await page
    .getByRole("button", { name: /^game plan$/i })
    .click({ timeout: 15_000 });

  await expect(
    page.getByRole("heading", { name: /^game plan$/i }),
  ).toBeVisible({ timeout: 10_000 });
  await expect(page.getByTestId("game-plan-player").first()).toBeVisible();
  await expect(page.locator("#game-plan-text")).toContainText("Game plan —");
  await expect(page.locator("#game-plan-text")).toContainText(team.name);
  // Netball subs only at the break → whole-quarter bench, so no rolling-sub
  // interchange queue (the AFL-only treatment must not leak across sports).
  await expect(page.locator("#game-plan-text")).toContainText("Bench:");
  // From the game page it's a preview to share; the lineup is set on game day.
  await expect(page.getByText(/A preview to share/)).toBeVisible();
  await expect(page.locator("#game-plan-text")).not.toContainText(
    "Interchange",
  );
});

test("Rugby league game-detail: the shared planner is driven by the RL projection", async ({
  page,
}) => {
  const admin = createAdminClient();
  const ownerId = await getOwnerId();

  const team = await makeTeam(admin, {
    ownerId,
    ageGroup: "U9",
    sport: "rugby_league",
    name: `GP-RL-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
  });
  await makePlayers(admin, {
    teamId: team.id,
    ownerId,
    count: 13,
    ageGroup: "U9",
  });
  const game = await makeGame(admin, {
    teamId: team.id,
    ownerId,
    ageGroup: "U9",
    opponent: "Sharks",
  });

  await page.goto(`/teams/${team.id}/games/${game.id}`);

  await page
    .getByRole("button", { name: /^game plan$/i })
    .click({ timeout: 15_000 });

  await expect(
    page.getByRole("heading", { name: /^game plan$/i }),
  ).toBeVisible({ timeout: 10_000 });
  await expect(page.getByTestId("game-plan-player").first()).toBeVisible();
  await expect(page.locator("#game-plan-text")).toContainText("Game plan —");
  await expect(page.locator("#game-plan-text")).toContainText(team.name);
});

test("set positions: Game plan names each kid's position, on screen and in the chat text", async ({ page }) => {
  // Stagehand round 3: the plan listed kids under Back / Centre / Forward
  // only, so a ruck sat under "Centre" and parents couldn't read it.
  const admin = createAdminClient();
  const ownerId = await getOwnerId();
  const team = await makeTeam(admin, { ownerId, ageGroup: "U13" });
  const players = await makePlayers(admin, { teamId: team.id, ownerId, count: 15 });
  const game = await makeGame(admin, { teamId: team.id, ownerId, ageGroup: "U13", opponent: "Eagles" });
  await admin.from("team_playbooks").insert({ team_id: team.id, strategy: "set-positions" });
  const ruck = players[3];
  const fullForward = players[0];
  await admin.from("player_position_prefs").insert([
    { team_id: team.id, player_id: ruck.id, position_key: "r", kind: "home" },
    { team_id: team.id, player_id: fullForward.id, position_key: "ff", kind: "home" },
  ]);

  await page.goto(`/teams/${team.id}/games/${game.id}`);
  await page.getByRole("button", { name: /^game plan$/i }).click({ timeout: 15_000 });
  await expect(page.getByRole("heading", { name: /^game plan$/i })).toBeVisible({ timeout: 10_000 });

  const row = (id: string) => page.locator(`[data-testid="game-plan-player"][data-player-id="${id}"]`);
  await expect(row(ruck.id).getByTestId("game-plan-position")).toHaveText("R");
  await expect(row(fullForward.id).getByTestId("game-plan-position")).toHaveText("FF");
  await expect(page.locator("#game-plan-text")).toContainText(`${ruck.full_name} (R)`);
});

test("before kickoff, Game plan keeps the later quarters and the break opens on them", async ({ page }) => {
  // Stagehand round 3: edits to Q2–Q4 in the pre-kickoff Game plan
  // vanished — "Use for Q1" kept only Q1.
  const admin = createAdminClient();
  const ownerId = await getOwnerId();
  const team = await makeTeam(admin, { ownerId, ageGroup: "U10" });
  const players = await makePlayers(admin, { teamId: team.id, ownerId, count: 15 });
  const game = await makeGame(admin, { teamId: team.id, ownerId });
  await admin.from("game_availability").insert(
    players.map((p) => ({ game_id: game.id, player_id: p.id, status: "available" as const, updated_by: ownerId })),
  );
  await page.addInitScript(() => {
    try {
      localStorage.setItem("gm-walkthrough-seen", "1");
    } catch {}
  });
  await page.goto(`/teams/${team.id}/games/${game.id}/live`);
  await expect(page.getByRole("button", { name: /^start q1$/i })).toBeVisible({ timeout: 15_000 });

  // Plan Q2: put the first kid resting in Q2 onto the field.
  await page.getByRole("button", { name: /^game plan$/i }).click();
  await expect(page.getByRole("heading", { name: /^game plan$/i })).toBeVisible({ timeout: 10_000 });
  await page.getByRole("tab", { name: "Q2" }).click();
  const { fieldKid, benchKid } = await swapInPlan(page);
  await page.getByRole("button", { name: "Use this plan" }).click();
  await expect(page.getByRole("heading", { name: /^game plan$/i })).toHaveCount(0);

  // Reopening keeps the Q2 change.
  await page.getByRole("button", { name: /^game plan$/i }).click();
  await page.getByRole("tab", { name: "Q2" }).click();
  await expect(page.locator(`[data-testid="game-plan-bench"] [data-player-id="${fieldKid}"]`)).toBeVisible();
  await expect(page.locator(`[data-testid^="game-plan-group-"] [data-player-id="${benchKid}"]`)).toBeVisible();
  await page.getByRole("button", { name: "Use this plan" }).click();

  // Play Q1, end it: the break opens on the planned Q2.
  await page.getByRole("button", { name: /^start q1$/i }).click();
  await page.getByRole("button", { name: /^start clock$/i }).click();
  await page.getByRole("button", { name: /^clock — q1, running$/i }).click({ timeout: 15_000 });
  await page.getByRole("button", { name: /^end q1 now$/i }).click();
  await page.getByRole("button", { name: /^end\s*q\s*1$/i }).click();
  const selectQ2 = page.getByRole("button", { name: /select team for q2/i });
  if (await selectQ2.isVisible({ timeout: 5_000 }).catch(() => false)) await selectQ2.click();
  await expect(page.getByTestId("planned-seed-banner")).toBeVisible({ timeout: 15_000 });
  const bench = page.getByRole("group", { name: "Bench", exact: true });
  await expect(bench.getByTestId(`player-tile-${fieldKid}`)).toBeVisible();
  await expect(bench.getByTestId(`player-tile-${benchKid}`)).toHaveCount(0);
});
