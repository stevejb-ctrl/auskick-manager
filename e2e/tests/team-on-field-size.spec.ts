// A team's own players on the field and period length (rugby union
// plan, phase 2; every sport). Competitions differ by state, so the
// coach sets their competition's size once: the setup wizard's Basics
// step and Team › Season both offer it, every new game starts from it,
// and a change of age group keeps it inside the new age's range.
//
// Covers: TeamBasicsForm, createTeam, createGame (newGameDefaults),
// OnFieldSizeInput / setTeamOnFieldSize, setTeamAgeGroup (re-clamp),
// migration 0067 (teams.on_field_size).

import { test, expect, type Page } from "@playwright/test";
import { createAdminClient } from "../fixtures/supabase";
import { makeTeam } from "../fixtures/factories";
import { gotoStable, waitForHydration } from "../helpers/navigation";

test.describe.configure({ mode: "parallel" });

async function superAdminId(): Promise<string> {
  const admin = createAdminClient();
  const { data } = await admin.auth.admin.listUsers();
  return data.users.find((u) => u.email === process.env.TEST_SUPER_ADMIN_EMAIL)!.id;
}

async function teamRow(teamId: string) {
  const admin = createAdminClient();
  const { data } = await admin
    .from("teams")
    .select("age_group, on_field_size, quarter_length_seconds")
    .eq("id", teamId)
    .single();
  return data;
}

async function createGameFromForm(page: Page, teamId: string, opponent: string) {
  await gotoStable(page, `/teams/${teamId}/games`);
  await page.getByRole("button", { name: /create manually/i }).click();
  await page.getByLabel(/opponent/i).fill(opponent);
  await page.getByLabel(/date.*time/i).fill(new Date(Date.now() + 7 * 86400_000).toISOString().slice(0, 16));
  await page.getByRole("button", { name: /^create game$/i }).click();
  await page.waitForURL(/\/teams\/.+\/games\/.+/, { timeout: 15_000 });
}

test("the wizard saves the team's own players on the field and quarter length, and a new game starts from them", async ({
  page,
}) => {
  const admin = createAdminClient();
  await page.goto("/teams/new");
  await waitForHydration(page);
  await page.getByRole("radio", { name: "Junior AFL" }).click();
  await page.getByLabel("Team name").fill(`On field ${Date.now()}`);
  await page.getByLabel("Age group").selectOption("U10");

  // They start at Under 10's own: 12 a side, 12-minute quarters.
  const players = page.getByLabel("Players on the field");
  const quarter = page.getByLabel(/quarter length/i);
  await expect(players).toHaveValue("12");
  await expect(quarter).toHaveValue("12");

  await players.selectOption("9");
  await quarter.fill("10");
  await page.getByRole("button", { name: "Continue" }).click();
  await page.waitForURL(/\/teams\/[^/]+\/setup/, { timeout: 15_000 });
  const teamId = page.url().match(/\/teams\/([^/?]+)\/setup/)![1];

  await expect.poll(() => teamRow(teamId)).toMatchObject({ on_field_size: 9, quarter_length_seconds: 600 });

  // A game made from the form starts with the team's 9, not Under 10's 12.
  const opponent = `Size Opp ${Date.now()}`;
  await createGameFromForm(page, teamId, opponent);
  const { data: games } = await admin.from("games").select("on_field_size").eq("team_id", teamId).eq("opponent", opponent);
  expect(games).toEqual([{ on_field_size: 9 }]);
  await expect(page.getByText("Under 10 · 9 on field")).toBeVisible();
});

test("a team's size follows the age group until set, and a new age keeps it in range", async ({ page }) => {
  const ownerId = await superAdminId();
  const team = await makeTeam(createAdminClient(), {
    ownerId,
    sport: "rugby_union",
    ageGroup: "U10",
    name: `Union size ${Date.now()}`,
  });

  await gotoStable(page, `/teams/${team.id}/settings`);
  await waitForHydration(page);
  const players = page.getByLabel("Players on the field");
  // Union U10 plays 10 to 15, 12 by default (the national pathway).
  await expect(players).toHaveValue("12");
  await expect(players.locator("option")).toHaveText([
    "10",
    "11",
    "12 (age-group default)",
    "13",
    "14",
    "15",
  ]);

  // Victoria plays 10 a side at U10.
  await players.selectOption("10");
  const card = players.locator("xpath=ancestor::div[contains(@class, 'rounded-lg')][1]");
  await card.getByRole("button", { name: /^save$/i }).click();
  const saved = card.getByText("Saved. New games start with 10 on the field.");
  await expect(saved).toBeVisible({ timeout: 10_000 });
  await expect.poll(() => teamRow(team.id)).toMatchObject({ on_field_size: 10 });
  // The save refreshes the page; the coach's confirmation stays. (It
  // was keyed on the saved size, so the card remounted and dropped it,
  // before WebKit even drew it.)
  await page.waitForLoadState("networkidle");
  await expect(saved).toBeVisible();

  // Moving up to U12 (12 to 15): 10 is out of range, so 12.
  await page.getByLabel("Age group", { exact: true }).selectOption("U12");
  await page.getByRole("button", { name: "Save age group" }).click();
  await expect.poll(() => teamRow(team.id)).toMatchObject({ age_group: "U12", on_field_size: 12 });
  // One card, redrawn for U12 (not the U10 one left beside it).
  await expect(page.getByLabel("Players on the field")).toHaveCount(1);
  await expect(page.getByLabel("Players on the field")).toHaveValue("12");
});

test("union's 35-minute halves fit the half length setting", async ({ page }) => {
  const ownerId = await superAdminId();
  const team = await makeTeam(createAdminClient(), {
    ownerId,
    sport: "rugby_union",
    ageGroup: "U17",
    name: `Union halves ${Date.now()}`,
  });

  await gotoStable(page, `/teams/${team.id}/settings`);
  await waitForHydration(page);
  const half = page.getByLabel(/half length/i);
  await expect(half).toHaveValue("35");
  await half.fill("40");
  const card = half.locator("xpath=ancestor::div[contains(@class, 'rounded-lg')][1]");
  await card.getByRole("button", { name: /^save$/i }).click();
  await expect.poll(() => teamRow(team.id)).toMatchObject({ quarter_length_seconds: 2400 });
});
