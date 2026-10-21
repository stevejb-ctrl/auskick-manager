// The role sheet speaks only in positive terms, in every sport (Steve,
// 21 Oct 2026: "Check all the sports and make sure this negative state
// does not exist"). A basketball coach was asked which lines a kid
// "Never plays" when they meant to pick the kid's line. Now the sheet
// asks where a kid plays; underneath, the same rows are stored (the
// spots left out as `never`), so old records read back positively.

import { test, expect, type Page } from "@playwright/test";
import { createAdminClient } from "../fixtures/supabase";
import { makeTeam, makePlayers } from "../fixtures/factories";
import { waitForHydration } from "../helpers/navigation";

async function superAdminId(admin: ReturnType<typeof createAdminClient>) {
  const { data } = await admin.auth.admin.listUsers();
  return data.users.find((u) => u.email === process.env.TEST_SUPER_ADMIN_EMAIL)!.id;
}

async function openRole(page: Page, teamId: string, name: string) {
  await page.goto(`/teams/${teamId}/squad`);
  await waitForHydration(page);
  await page.getByRole("button", { name: `Role for ${name}` }).click({ timeout: 15_000 });
  const sheet = page.getByRole("dialog", { name: `Role for ${name}` });
  await expect(sheet).toBeVisible();
  // No negative framing anywhere on the sheet.
  await expect(sheet).not.toContainText(/never|won.t suggest|not here/i);
  return sheet;
}

async function prefsOf(admin: ReturnType<typeof createAdminClient>, playerId: string) {
  const { data } = await admin
    .from("player_position_prefs")
    .select("kind, line, position_key")
    .eq("player_id", playerId)
    .order("kind")
    .order("line");
  return data;
}

test("basketball: a kid's lines are picked as Plays as Guards / Forwards", async ({ page }) => {
  const admin = createAdminClient();
  const ownerId = await superAdminId(admin);
  // U12 plays Guards and forwards by default: the sheet Steve hit.
  const team = await makeTeam(admin, { ownerId, sport: "basketball", ageGroup: "U12" });
  const [kid] = await makePlayers(admin, { teamId: team.id, ownerId, count: 6 });

  const sheet = await openRole(page, team.id, kid.full_name);
  const playsAs = sheet.getByRole("group", { name: "Plays as" });
  await expect(playsAs.getByRole("checkbox")).toHaveText(["Guards", "Forwards"]);
  await expect(sheet.getByRole("switch", { name: "Plays every minute" })).toBeVisible();
  // Basketball's positions are the five spots on court: no custom ones.
  await expect(sheet.getByRole("link", { name: "+ Add a position" })).toHaveCount(0);
  await playsAs.getByRole("checkbox", { name: "Guards" }).click();
  await sheet.getByRole("button", { name: "Save role" }).click();
  await expect(sheet).toHaveCount(0);

  await expect(page.getByTestId(`player-role-${kid.id}`)).toHaveText("Plays Guards");
  await expect.poll(() => prefsOf(admin, kid.id)).toEqual([{ kind: "never", line: "forward", position_key: null }]);
});

test("basketball: a kid picked as both Guards and Forwards saves, and reopens with both ticked", async ({ page }) => {
  // Steve, 21 Oct 2026: "Selecting a player as both a guard and a
  // forward does not save either." Every spot ticked stored nothing, so
  // the sheet reopened blank and the squad list said nothing.
  const admin = createAdminClient();
  const ownerId = await superAdminId(admin);
  const team = await makeTeam(admin, { ownerId, sport: "basketball", ageGroup: "U12" });
  const [kid] = await makePlayers(admin, { teamId: team.id, ownerId, count: 6 });

  let sheet = await openRole(page, team.id, kid.full_name);
  await sheet.getByRole("group", { name: "Plays as" }).getByRole("checkbox", { name: "Guards" }).click();
  await sheet.getByRole("button", { name: "Save role" }).click();
  await expect(page.getByTestId(`player-role-${kid.id}`)).toHaveText("Plays Guards");

  sheet = await openRole(page, team.id, kid.full_name);
  let playsAs = sheet.getByRole("group", { name: "Plays as" });
  await expect(playsAs.getByRole("checkbox", { name: "Guards" })).toHaveAttribute("aria-checked", "true");
  await playsAs.getByRole("checkbox", { name: "Forwards" }).click();
  await sheet.getByRole("button", { name: "Save role" }).click();
  await expect(page.getByTestId(`player-role-${kid.id}`)).toHaveText("Plays Guards, Forwards");

  sheet = await openRole(page, team.id, kid.full_name);
  playsAs = sheet.getByRole("group", { name: "Plays as" });
  await expect(playsAs.getByRole("checkbox", { name: "Guards" })).toHaveAttribute("aria-checked", "true");
  await expect(playsAs.getByRole("checkbox", { name: "Forwards" })).toHaveAttribute("aria-checked", "true");
});

test("AFL U11: a stored never: Forward shows as Plays as Centre, Back, and saves back unchanged", async ({ page }) => {
  const admin = createAdminClient();
  const ownerId = await superAdminId(admin);
  const team = await makeTeam(admin, { ownerId, sport: "afl", ageGroup: "U11" });
  const [kid] = await makePlayers(admin, { teamId: team.id, ownerId, count: 3 });
  // A role saved by the old sheet: "Never plays: Forward".
  await admin.from("player_position_prefs").insert({ team_id: team.id, player_id: kid.id, line: "fwd", kind: "never" });

  await page.goto(`/teams/${team.id}/squad`);
  await expect(page.getByTestId(`player-role-${kid.id}`)).toHaveText("Plays Centre, Back", { timeout: 15_000 });

  const sheet = await openRole(page, team.id, kid.full_name);
  const playsAs = sheet.getByRole("group", { name: "Plays as" });
  await expect(playsAs.getByRole("checkbox", { name: "Forward" })).toHaveAttribute("aria-checked", "false");
  await expect(playsAs.getByRole("checkbox", { name: "Centre" })).toHaveAttribute("aria-checked", "true");
  await expect(playsAs.getByRole("checkbox", { name: "Back" })).toHaveAttribute("aria-checked", "true");
  await sheet.getByRole("button", { name: "Save role" }).click();
  await expect(sheet).toHaveCount(0);
  await expect.poll(() => prefsOf(admin, kid.id)).toEqual([{ kind: "never", line: "fwd", position_key: null }]);
});

test("soccer: the sheet asks whether a kid takes a turn in goal, on by default", async ({ page }) => {
  const admin = createAdminClient();
  const ownerId = await superAdminId(admin);
  const team = await makeTeam(admin, { ownerId, sport: "soccer", ageGroup: "U9" });
  const [kid] = await makePlayers(admin, { teamId: team.id, ownerId, count: 8 });

  const sheet = await openRole(page, team.id, kid.full_name);
  const turn = sheet.getByRole("switch", { name: "Takes a turn in goal" });
  await expect(turn).toBeChecked();
  await expect(sheet.getByRole("group", { name: "Plays as" })).toHaveCount(0);
  await turn.click();
  await sheet.getByRole("button", { name: "Save role" }).click();
  await expect(sheet).toHaveCount(0);

  await expect(page.getByTestId(`player-role-${kid.id}`)).toHaveText("No turns in goal");
  await expect.poll(() => prefsOf(admin, kid.id)).toEqual([{ kind: "never", line: "gk", position_key: null }]);
});

test("an old 'also plays' shows ticked, with a note that saving keeps them there", async ({ page }) => {
  const admin = createAdminClient();
  const ownerId = await superAdminId(admin);
  const team = await makeTeam(admin, { ownerId, sport: "afl", ageGroup: "U12" });
  const [kid] = await makePlayers(admin, { teamId: team.id, ownerId, count: 3 });
  await admin.from("team_playbooks").insert({ team_id: team.id, strategy: "preferred-lines" });
  await admin.from("player_position_prefs").insert([
    { team_id: team.id, player_id: kid.id, line: "fwd", kind: "home", rank: 0 },
    { team_id: team.id, player_id: kid.id, line: "mid", kind: "also", rank: 1 },
  ]);

  const sheet = await openRole(page, team.id, kid.full_name);
  await expect(sheet.getByTestId("role-picked-plays")).toHaveText("Forward, Centre");
  await expect(sheet.getByTestId("role-restrict-note")).toHaveText("Re-saving will keep them to these lines.");
  await expect(sheet.getByTestId("role-picked-main")).toHaveText("Forward");
});

test("AFL Set positions links to the positions editor to add a position", async ({ page }) => {
  const admin = createAdminClient();
  const ownerId = await superAdminId(admin);
  const team = await makeTeam(admin, { ownerId, sport: "afl", ageGroup: "U14" });
  const [kid] = await makePlayers(admin, { teamId: team.id, ownerId, count: 3 });
  await admin.from("team_playbooks").insert({ team_id: team.id, strategy: "set-positions" });

  const sheet = await openRole(page, team.id, kid.full_name);
  await sheet.getByRole("link", { name: "+ Add a position" }).click();
  await expect(page).toHaveURL(new RegExp(`/teams/${team.id}/settings#positions$`));
  await expect(page.locator("#positions")).toBeVisible({ timeout: 15_000 });
});
