// Steve 2026-10-16: "The scroll goes too low, big gaps." On phones the
// live views scrolled well past their content: live play stacked a
// page-level pb-[9rem] ON TOP of LiveStickyScoreBar's own measured
// spacer, and the netball pre-start picker kept a pb-[6rem] reserved
// for a footer that has been `sticky` (in flow) since the
// LineupPickerFooter extraction — plus the (app) layout's Help footer
// sat in flow under the fixed bar where it could never be seen.
//
// These tests pin the geometry: after scrolling to the bottom, the
// dead space BELOW the last in-flow content must be a small margin,
// not a third of the viewport.
//
// Covers: src/app/(app)/teams/[teamId]/games/[gameId]/live/page.tsx
//         (page-level sticky-bar clearance), netball LineupPicker's
//         own padding, and the layout footer's live-route hiding.

import { test, expect } from "@playwright/test";
import { createAdminClient } from "../fixtures/supabase";
import { makeTeam, makePlayers, makeGame } from "../fixtures/factories";
import { ALL_ZONES, zoneCapsFor } from "../../src/lib/fairness";
import { aflPositionModel, getAgeGroupConfig } from "../../src/lib/sports";
import type { Lineup } from "../../src/lib/types";

test.describe.configure({ mode: "parallel" });

async function startAflGameInDb(opts: {
  admin: import("@supabase/supabase-js").SupabaseClient;
  gameId: string;
  playerIds: string[];
  onFieldSize: number;
  ageGroup: string;
  createdBy: string;
}) {
  const { admin, gameId, playerIds, onFieldSize, ageGroup, createdBy } = opts;
  const positionModel = aflPositionModel(getAgeGroupConfig("afl", ageGroup));
  const zoneCaps = zoneCapsFor(onFieldSize, positionModel);
  const lineup: Lineup = { back: [], hback: [], mid: [], hfwd: [], fwd: [], bench: [] };
  let cursor = 0;
  for (const z of ALL_ZONES) {
    for (let i = 0; i < zoneCaps[z]; i++) lineup[z].push(playerIds[cursor++]);
  }
  lineup.bench = playerIds.slice(cursor);
  await admin.from("game_events").insert([
    { game_id: gameId, type: "lineup_set", metadata: { lineup }, created_by: createdBy },
    { game_id: gameId, type: "quarter_start", metadata: { quarter: 1 }, created_by: createdBy },
  ]);
  await admin.from("games").update({ status: "in_progress" }).eq("id", gameId);
}

/** Scroll to the very bottom and measure the dead space (px) between
 *  the end of the page's in-flow content and document scrollHeight.
 *  "In-flow content" is the bottom of the LAST element inside <main>
 *  that is not pure padding — we take main's last element child's
 *  bottom edge in document coordinates. */
async function deadSpaceBelowContent(page: import("@playwright/test").Page): Promise<number> {
  return page.evaluate(() => {
    window.scrollTo(0, document.documentElement.scrollHeight);
    const main = document.querySelector("main")!;
    // Deepest last in-flow element: walk last element children down
    // from main, skipping fixed-position elements (the sticky score
    // bar's fixed half doesn't occupy flow space).
    let el: Element = main;
    for (;;) {
      const kids = Array.from(el.children).filter(
        (k) => getComputedStyle(k).position !== "fixed" && (k as HTMLElement).offsetHeight > 0,
      );
      const last = kids[kids.length - 1];
      if (!last) break;
      el = last;
    }
    const bottom = el.getBoundingClientRect().bottom + window.scrollY;
    // A page shorter than the screen can't scroll into blank space: only
    // overflow past both the content and the viewport counts.
    return Math.round(document.documentElement.scrollHeight - Math.max(bottom, window.innerHeight));
  });
}

test("AFL live play: the page doesn't scroll far past the content", async ({ page }) => {
  const admin = createAdminClient();
  const { data: superAdmin } = await admin.auth.admin.listUsers();
  const ownerId = superAdmin.users.find(
    (u) => u.email === process.env.TEST_SUPER_ADMIN_EMAIL,
  )!.id;

  const team = await makeTeam(admin, { ownerId, ageGroup: "U10", sport: "afl" });
  const players = await makePlayers(admin, { teamId: team.id, ownerId, count: 15 });
  const game = await makeGame(admin, { teamId: team.id, ownerId });
  await startAflGameInDb({
    admin,
    gameId: game.id,
    playerIds: players.map((p) => p.id),
    onFieldSize: game.on_field_size,
    ageGroup: team.ageGroup,
    createdBy: ownerId,
  });

  await page.goto(`/teams/${team.id}/games/${game.id}/live`);
  await expect(page.getByRole("button", { name: /exit live game/i })).toBeVisible({ timeout: 15_000 });

  // The sticky scorebug reserves its own height with a measured
  // in-flow spacer; nothing else may pad below it. Pre-fix this gap
  // was ~210px (page pb-[9rem] + main padding + the hidden footer).
  expect(await deadSpaceBelowContent(page)).toBeLessThanOrEqual(48);
});

test("netball pre-start: the picker ends at its sticky footer, no ghost scroll", async ({ page }) => {
  const admin = createAdminClient();
  const { data: superAdmin } = await admin.auth.admin.listUsers();
  const ownerId = superAdmin.users.find(
    (u) => u.email === process.env.TEST_SUPER_ADMIN_EMAIL,
  )!.id;

  const team = await makeTeam(admin, { ownerId, ageGroup: "11u", sport: "netball" });
  const players = await makePlayers(admin, { teamId: team.id, ownerId, count: 10 });
  const game = await makeGame(admin, { teamId: team.id, ownerId });
  // Everyone available so the picker renders a full court.
  await admin.from("game_availability").insert(
    players.map((p) => ({
      game_id: game.id,
      player_id: p.id,
      status: "available" as const,
      updated_by: ownerId,
    })),
  );

  await page.goto(`/teams/${team.id}/games/${game.id}/live`);
  await expect(page.getByRole("region", { name: /starting lineup/i })).toBeVisible({ timeout: 15_000 });

  // The Save/Start footer is sticky — in flow at the end of the
  // picker — so no reservation below it is needed at all. Pre-fix
  // this gap was ~260px (picker pb-[6rem] + page pb-[6rem] + the
  // layout footer).
  expect(await deadSpaceBelowContent(page)).toBeLessThanOrEqual(48);
});

// Steve 2026-10-21 (basketball): "Some blank space when scrolling" —
// blank under Restart game. Basketball and league never got the
// 16 Oct fix: each still padded the live view with pb-[7rem] on top of
// LiveStickyScoreBar's measured spacer.
async function ownerOf(admin: ReturnType<typeof createAdminClient>) {
  const { data } = await admin.auth.admin.listUsers();
  return data.users.find((u) => u.email === process.env.TEST_SUPER_ADMIN_EMAIL)!.id;
}

test("basketball live play: the page doesn't scroll far past the content", async ({ page }) => {
  const admin = createAdminClient();
  const ownerId = await ownerOf(admin);
  const team = await makeTeam(admin, { ownerId, ageGroup: "U12", sport: "basketball" });
  await admin.from("teams").update({ track_scoring: true }).eq("id", team.id);
  const players = await makePlayers(admin, { teamId: team.id, ownerId, count: 7 });
  const game = await makeGame(admin, { teamId: team.id, ownerId });
  const ids = players.map((p) => p.id);
  const lineup = { lines: { guard: ids.slice(0, 2), forward: ids.slice(2, 5), court: [] }, bench: ids.slice(5) };
  await admin.from("game_events").insert([
    { game_id: game.id, type: "lineup_set", metadata: { lineup, sport: "basketball" }, created_by: ownerId },
    { game_id: game.id, type: "quarter_start", metadata: { quarter: 1, sport: "basketball" }, created_by: ownerId },
  ]);
  await admin.from("games").update({ status: "in_progress" }).eq("id", game.id);

  await page.goto(`/teams/${team.id}/games/${game.id}/live`);
  await expect(page.getByRole("button", { name: /^clock — h1/i })).toBeVisible({ timeout: 15_000 });
  expect(await deadSpaceBelowContent(page)).toBeLessThanOrEqual(48);
});

test("rugby league live play: the page doesn't scroll far past the content", async ({ page }) => {
  const admin = createAdminClient();
  const ownerId = await ownerOf(admin);
  const team = await makeTeam(admin, { ownerId, ageGroup: "U10", sport: "rugby_league" });
  const players = await makePlayers(admin, { teamId: team.id, ownerId, count: 13, ageGroup: "U10" });
  const game = await makeGame(admin, { teamId: team.id, ownerId });
  await admin.from("games").update({ on_field_size: 11, status: "in_progress" }).eq("id", game.id);
  const ids = players.map((p) => p.id);
  const lineup = { forwards: ids.slice(0, 5), backs: ids.slice(5, 11), bench: ids.slice(11) };
  await admin.from("game_events").insert([
    { game_id: game.id, type: "lineup_set", metadata: { lineup, sport: "rugby_league" }, created_by: ownerId },
    { game_id: game.id, type: "quarter_start", metadata: { quarter: 1, sport: "rugby_league" }, created_by: ownerId },
  ]);

  await page.goto(`/teams/${team.id}/games/${game.id}/live`);
  await expect(page.getByRole("button", { name: /exit live game/i })).toBeVisible({ timeout: 15_000 });
  await expect(page.getByRole("button", { name: /^clock — h1/i })).toBeVisible({ timeout: 15_000 });
  expect(await deadSpaceBelowContent(page)).toBeLessThanOrEqual(48);
});
