// ─── Touch and Oztag: a coach makes a team, every page opens, settings save ──
// Four-sports plan, track B. The setup wizard offers Junior Touch
// football and Junior Oztag, marked Beta, with a "Mixed team" toggle that
// starts the team on its sport's rule; none of the team's pages stops for
// them or borrows another sport's screen; and the team's settings from
// migration 0071 save from the Team tab and the squad: one period, the
// mixed rule, Oztag's girl's try, and each kid's group (shown only on a
// mixed team).

import { test, expect } from "@playwright/test";
import { createAdminClient } from "../fixtures/supabase";
import { makePlayers } from "../fixtures/factories";
import { gotoStable, waitForHydration } from "../helpers/navigation";

async function ownerIdOf() {
  const admin = createAdminClient();
  const { data: su } = await admin.auth.admin.listUsers();
  return { admin, ownerId: su.users.find((u) => u.email === process.env.TEST_SUPER_ADMIN_EMAIL)!.id };
}

test("touch: the wizard makes a mixed U11 team, every page opens, one period and the mixed rule save, Girl/Boy on the squad", async ({ page }) => {
  test.setTimeout(240_000);
  const errors: string[] = [];
  page.on("pageerror", (err) => errors.push(`pageerror: ${err.message}`));
  const { admin, ownerId } = await ownerIdOf();

  await gotoStable(page, "/teams/new");
  await waitForHydration(page);
  const pill = page.getByRole("radio", { name: "Junior Touch football" });
  await expect(pill).toContainText("Beta");
  await expect(page.getByRole("radio", { name: "Junior Oztag" })).toContainText("Beta");
  await pill.click();
  const teamName = `TCH-WIZ-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  await page.getByLabel(/team name/i).fill(teamName);
  await page.getByLabel(/age group/i).selectOption("U11");
  await expect(page.getByText(/at most 3 boys on the field, at least 1 girl and 1 boy/i)).toBeVisible();
  await page.getByRole("switch", { name: "Mixed team" }).click();
  await page.getByRole("button", { name: /continue/i }).click();
  // The wizard replaces itself with the setup; let it settle (and its
  // prefetches finish) before leaving, or WebKit reports the cut-off
  // fetch as a page error.
  await page.waitForURL(/\/teams\/[0-9a-f-]+\/setup/, { timeout: 15_000 });
  await waitForHydration(page);
  const teamId = page.url().match(/\/teams\/([0-9a-f-]+)/)![1];

  // U11 keeps score; a mixed team starts on TFA's rule (3 / 1 / 1).
  await expect
    .poll(async () => (await admin.from("teams").select("sport, track_scoring, period_count, mixed_max_boys, mixed_min_girls, mixed_min_boys").eq("id", teamId).single()).data)
    .toMatchObject({ sport: "touch", track_scoring: true, period_count: null, mixed_max_boys: 3, mixed_min_girls: 1, mixed_min_boys: 1 });

  // Wizard step 3: the squad asks Girl or Boy, as Team basics promised
  // (audit 23 Oct, P1: the wizard never asked), and All set says how
  // many are marked.
  await gotoStable(page, `/teams/${teamId}/setup?step=squad`);
  await waitForHydration(page);
  await expect(page.getByRole("heading", { name: "Add the squad" })).toBeVisible({ timeout: 15_000 });
  await page.getByLabel("Player name").fill("Wizard Willa");
  await page.getByRole("radiogroup", { name: "For the mixed rule, counts as" }).getByRole("radio", { name: "Girl" }).click();
  await page.getByRole("button", { name: "Add player" }).click();
  await expect
    .poll(async () => (await admin.from("players").select("full_name, mixed_group").eq("team_id", teamId)).data)
    .toEqual([{ full_name: "Wizard Willa", mixed_group: "girl" }]);
  // Two more from a pasted list (no group yet): each row asks.
  await admin.from("players").insert(
    ["Wizard Rowan", "Wizard Sage"].map((full_name) => ({ team_id: teamId, full_name, is_active: true, created_by: ownerId })),
  );
  await gotoStable(page, `/teams/${teamId}/setup?step=squad`);
  await waitForHydration(page);
  await expect(page.getByRole("radiogroup", { name: "Wizard Rowan counts as" })).toBeVisible({ timeout: 15_000 });
  await expect(page.getByRole("radiogroup", { name: "Wizard Willa counts as" }).getByRole("radio", { name: "Girl" })).toHaveAttribute(
    "aria-checked",
    "true",
  );
  await gotoStable(page, `/teams/${teamId}/setup?step=done`);
  await waitForHydration(page);
  const nudge = page.getByTestId("setup-mixed-nudge");
  await expect(nudge).toContainText("1 of 3 marked Girl or Boy", { timeout: 15_000 });
  await nudge.getByRole("link", { name: /mark the squad/i }).click();
  await page.waitForURL(/step=squad/, { timeout: 15_000 });
  await waitForHydration(page);
  await page.getByRole("radiogroup", { name: "Wizard Rowan counts as" }).getByRole("radio", { name: "Boy" }).click();
  await page.getByRole("radiogroup", { name: "Wizard Sage counts as" }).getByRole("radio", { name: "Boy" }).click();
  await expect
    .poll(async () => ((await admin.from("players").select("mixed_group").eq("team_id", teamId)).data ?? []).filter((p) => p.mixed_group).length)
    .toBe(3);
  await gotoStable(page, `/teams/${teamId}/setup?step=done`);
  await waitForHydration(page);
  await expect(page.getByRole("heading", { name: /all set/i })).toBeVisible({ timeout: 15_000 });
  await expect(page.getByTestId("setup-mixed-nudge")).toHaveCount(0);

  // Wizard step 2: How we play, with touch's rotations and laws.
  await gotoStable(page, `/teams/${teamId}/setup?step=config`);
  await waitForHydration(page);
  await expect(page.getByRole("heading", { name: "How we play" })).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText("Rotate positions").first()).toBeVisible();
  await expect(page.getByText(/change when you have the ball/i).first()).toBeVisible();

  // Every team page opens for touch.
  for (const path of ["", "/games", "/squad", "/settings", "/stats"]) {
    const res = await gotoStable(page, `/teams/${teamId}${path}`);
    expect(res?.status() ?? 200, path || "/").toBeLessThan(400);
    await waitForHydration(page);
    await expect(page.getByText(/isn't built yet|something went wrong/i)).toHaveCount(0);
  }
  await expect(page.getByText(/no completed games yet/i)).toBeVisible();

  // Settings: one continuous period (0071's period_count 1).
  await gotoStable(page, `/teams/${teamId}/settings`);
  await waitForHydration(page);
  await page.getByRole("radio", { name: /one period/i }).click({ timeout: 15_000 });
  await expect
    .poll(async () => (await admin.from("teams").select("period_count").eq("id", teamId).single()).data?.period_count)
    .toBe(1);

  // The mixed rule: a local one (at least 2 girls), then back to TFA's.
  const mixedCard = page.getByTestId("mixed-rule-settings");
  await expect(mixedCard).toContainText("At most 3 boys on the field, at least 1 girl and 1 boy.");
  await mixedCard.getByLabel("Fewest girls").selectOption("2");
  await mixedCard.getByRole("button", { name: "Save rule" }).click();
  await expect
    .poll(async () => (await admin.from("teams").select("mixed_min_girls").eq("id", teamId).single()).data?.mixed_min_girls)
    .toBe(2);
  await mixedCard.getByRole("button", { name: "Use Touch's rule" }).click();
  await expect
    .poll(async () => (await admin.from("teams").select("mixed_min_girls").eq("id", teamId).single()).data?.mixed_min_girls)
    .toBe(1);

  // A new game for a one-period team: 6 on, its own sub interval.
  await gotoStable(page, `/teams/${teamId}/games`);
  await waitForHydration(page);
  await page.getByRole("button", { name: /create manually/i }).click({ timeout: 15_000 });
  await page.getByLabel(/opponent/i).fill("Maitland Magic");
  await page.getByLabel(/date.*time/i).fill(new Date(Date.now() + 7 * 86400_000).toISOString().slice(0, 16));
  await page.getByRole("button", { name: /^create game$/i }).click();
  await page.waitForURL(/\/teams\/.+\/games\/.+/, { timeout: 15_000 });
  await expect
    .poll(async () => (await admin.from("games").select("on_field_size").eq("team_id", teamId)).data)
    .toEqual([{ on_field_size: 6 }]);
  // The game page opens (no plan preview for touch).
  await expect(page.getByText(/isn't built yet|something went wrong/i)).toHaveCount(0);

  // The squad: Girl / Boy, on a mixed team.
  const [kid] = await makePlayers(admin, { teamId, ownerId, count: 1 });
  await gotoStable(page, `/teams/${teamId}/squad`);
  await waitForHydration(page);
  await page.getByRole("radiogroup", { name: `${kid.full_name} counts as` }).getByRole("radio", { name: "Boy" }).click({ timeout: 15_000 });
  await expect
    .poll(async () => (await admin.from("players").select("mixed_group").eq("id", kid.id).single()).data?.mixed_group)
    .toBe("boy");

  // Not mixed any more: the squad asks nobody.
  await gotoStable(page, `/teams/${teamId}/settings`);
  await waitForHydration(page);
  await page.getByTestId("mixed-rule-settings").getByRole("switch", { name: "Mixed team" }).click();
  await expect
    .poll(async () => (await admin.from("teams").select("mixed_max_boys").eq("id", teamId).single()).data?.mixed_max_boys)
    .toBeNull();
  await gotoStable(page, `/teams/${teamId}/squad`);
  await waitForHydration(page);
  await expect(page.getByText(/counts as/i)).toHaveCount(0);

  expect(errors).toEqual([]);
});

test("oztag: the wizard makes a mixed U12 team, every page opens, and the girl's try turns off", async ({ page }) => {
  test.setTimeout(180_000);
  const errors: string[] = [];
  page.on("pageerror", (err) => errors.push(`pageerror: ${err.message}`));
  const { admin } = await ownerIdOf();

  await gotoStable(page, "/teams/new");
  await waitForHydration(page);
  await page.getByRole("radio", { name: "Junior Oztag" }).click();
  const teamName = `OZT-WIZ-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  await page.getByLabel(/team name/i).fill(teamName);
  await page.getByLabel(/age group/i).selectOption("U12");
  await page.getByRole("switch", { name: "Mixed team" }).click();
  await page.getByRole("button", { name: /continue/i }).click();
  // The wizard replaces itself with the setup; let it settle (and its
  // prefetches finish) before leaving, or WebKit reports the cut-off
  // fetch as a page error.
  await page.waitForURL(/\/teams\/[0-9a-f-]+\/setup/, { timeout: 15_000 });
  await waitForHydration(page);
  const teamId = page.url().match(/\/teams\/([0-9a-f-]+)/)![1];
  await expect
    .poll(async () => (await admin.from("teams").select("sport, mixed_max_boys, mixed_min_girls, mixed_min_boys, girls_try_double").eq("id", teamId).single()).data)
    .toMatchObject({ sport: "oztag", mixed_max_boys: 4, mixed_min_girls: 1, mixed_min_boys: 0, girls_try_double: null });

  for (const path of ["", "/games", "/squad", "/settings", "/stats"]) {
    const res = await gotoStable(page, `/teams/${teamId}${path}`);
    expect(res?.status() ?? 200, path || "/").toBeLessThan(400);
    await waitForHydration(page);
    await expect(page.getByText(/isn't built yet|something went wrong/i)).toHaveCount(0);
  }

  // How we play on Settings: Oztag's equal-time line; the girl's try is on.
  await gotoStable(page, `/teams/${teamId}/settings`);
  await waitForHydration(page);
  await expect(page.getByText(/equal game time: 50 %, give or take 10 %/i).first()).toBeVisible({ timeout: 15_000 });
  const girlsTry = page.getByRole("switch", { name: "A girl's try counts 2" });
  await expect(girlsTry).toHaveAttribute("aria-checked", "true");
  await girlsTry.click();
  await expect
    .poll(async () => (await admin.from("teams").select("girls_try_double").eq("id", teamId).single()).data?.girls_try_double)
    .toBe(false);

  expect(errors).toEqual([]);
});
