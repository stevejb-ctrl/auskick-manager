// What a parent sees on the team and game pages (round 2 usability,
// 24 Oct 2026):
//
// 1. Parents saw the coach's "How we played" report, which names the
//    kids who played under a fair share. It's the coach's and managers'.
// 2. Parents got "Add your first game → Add a game", which dead-ends on
//    a games list they can't add to. And a coach after games still read
//    "Add your first game" above a "Get started · Add a game" card.
//
// Covers: src/app/(app)/teams/[teamId]/games/[gameId]/page.tsx (How we played gate)
//         src/app/(app)/teams/[teamId]/page.tsx (EmptyHero, Get started, to-do)

import { test, expect } from "@playwright/test";
import { deleteTestUser } from "../fixtures/supabase";
import { finishedGame, fullTime, playPeriod } from "../helpers/finished-game";
import { gotoStable } from "../helpers/navigation";
import { coachPhone, newPerson, signedInPhone } from "../helpers/people";

test.describe.configure({ mode: "parallel" });

test("parents see the finished game's summary, but not the coach's How we played", async ({ browser }) => {
  test.setTimeout(90_000);
  const { admin, team, game } = await finishedGame("rugby_league", 9, (ids) => [
    ...playPeriod(1, [{ type: "try", player_id: ids[0], metadata: { quarter: 1, elapsed_ms: 60_000 } }]),
    fullTime,
  ]);
  const parent = await newPerson(admin, "parent-howweplayed", "Pat Parent");
  try {
    await admin.from("team_memberships").insert({ team_id: team.id, user_id: parent.id, role: "parent" });

    const { context: coachContext, page: coachPage } = await coachPhone(browser);
    await gotoStable(coachPage, `/teams/${team.id}/games/${game.id}`);
    await expect(coachPage.locator("#summary")).toBeVisible({ timeout: 15_000 });
    await expect(coachPage.getByText(/how we played/i).first()).toBeVisible();
    await coachContext.close();

    const { context, page } = await signedInPhone(browser, parent);
    await gotoStable(page, `/teams/${team.id}/games/${game.id}`);
    await expect(page.locator("#summary")).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText(/how we played/i)).toHaveCount(0);
    await expect(page.getByText(/rules? (kept|missed)/i)).toHaveCount(0);
    await context.close();
  } finally {
    await deleteTestUser(admin, parent.id);
  }
});

test("nothing upcoming: a coach after a game gets one 'Add your next game', a parent gets none", async ({ browser }) => {
  test.setTimeout(90_000);
  const { admin, team } = await finishedGame("touch", 8, (ids) => [
    ...playPeriod(1, [{ type: "try", player_id: ids[0], metadata: { quarter: 1, elapsed_ms: 60_000 } }]),
    fullTime,
  ]);
  const parent = await newPerson(admin, "parent-team-home", "Pat Parent");
  try {
    await admin.from("team_memberships").insert({ team_id: team.id, user_id: parent.id, role: "parent" });

    const { context: coachContext, page: coachPage } = await coachPhone(browser);
    await gotoStable(coachPage, `/teams/${team.id}`);
    await expect(coachPage.getByRole("region", { name: /last result/i })).toBeVisible({ timeout: 15_000 });
    await expect(coachPage.getByRole("link", { name: /add your next game/i })).toHaveCount(1);
    await expect(coachPage.getByRole("link", { name: /^add a game$/i })).toHaveCount(0);
    await expect(coachPage.getByText(/first game/i)).toHaveCount(0);
    await expect(coachPage.getByText(/get started/i)).toHaveCount(0);
    await coachContext.close();

    const { context, page } = await signedInPhone(browser, parent);
    await gotoStable(page, `/teams/${team.id}`);
    await expect(page.getByRole("region", { name: /last result/i })).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText(/your coach will add the next one/i)).toBeVisible();
    await expect(page.getByRole("link", { name: /add (a|your next) game/i })).toHaveCount(0);
    await context.close();
  } finally {
    await deleteTestUser(admin, parent.id);
  }
});
