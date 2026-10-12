// How we play (UX plan §7, Phase 3): the age group's policy, how kids
// rotate, and season balance — set on the Team tab and in the wizard,
// stored in team_playbooks (migration 0053).
//
// Covers: src/components/playbook/*, src/lib/playbook/team.ts,
//         src/app/(app)/teams/[teamId]/settings/howWePlayActions.ts

import { test, expect, type Page } from "@playwright/test";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient, createTestUser, deleteTestUser } from "../fixtures/supabase";
import { makeGame, makePlayers, makeTeam } from "../fixtures/factories";

test.describe.configure({ mode: "parallel" });

async function superAdminId(admin: SupabaseClient): Promise<string> {
  const { data } = await admin.auth.admin.listUsers();
  return data.users.find((u) => u.email === process.env.TEST_SUPER_ADMIN_EMAIL)!.id;
}

async function playbookRow(admin: SupabaseClient, teamId: string) {
  const { data } = await admin
    .from("team_playbooks")
    .select("strategy, policy_overrides, season_balance, season_balance_since")
    .eq("team_id", teamId)
    .maybeSingle();
  return data;
}

function rotation(page: Page) {
  return page.getByRole("radiogroup", { name: "How kids rotate" });
}

test("an AFL U12 coach picks a strategy and season balance on the Team tab", async ({ page }) => {
  const admin = createAdminClient();
  const ownerId = await superAdminId(admin);
  const team = await makeTeam(admin, { ownerId, ageGroup: "U12" });

  await page.goto(`/teams/${team.id}/settings`);
  await expect(page.getByText("Under 12 AFL")).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText(/No zones at this age/)).toBeVisible();
  await expect(page.getByText("Everyone plays at least 50% of the game")).toBeVisible();

  // Today's behaviour until the coach chooses; the age group's
  // suggestion is marked.
  const free = rotation(page).getByRole("radio", { name: /Free rotation/ });
  const preferred = rotation(page).getByRole("radio", { name: /Preferred lines/ });
  await expect(free).toHaveAttribute("aria-checked", "true");
  await expect(preferred).toContainText("Suggested for Under 12");

  await preferred.click();
  await expect(preferred).toHaveAttribute("aria-checked", "true");
  await expect(page.getByText("Saved.")).toBeVisible();
  await expect.poll(async () => (await playbookRow(admin, team.id))?.strategy).toBe("preferred-lines");

  // Season balance: on (Balanced) for a rotating strategy.
  const balance = page.getByRole("radiogroup", { name: "Season balance" });
  await expect(balance.getByRole("radio", { name: "Balanced" })).toHaveAttribute("aria-checked", "true");
  await balance.getByRole("radio", { name: "Strong" }).click();
  await expect.poll(async () => (await playbookRow(admin, team.id))?.season_balance).toBe("strong");

  await page.getByRole("button", { name: "Reset season balance" }).click();
  await page.getByRole("button", { name: "Reset", exact: true }).click();
  await expect(page.getByText(/Counting games since/)).toBeVisible();
  await expect
    .poll(async () => (await playbookRow(admin, team.id))?.season_balance_since)
    .not.toBeNull();

  // Survives a reload.
  await page.reload();
  await expect(rotation(page).getByRole("radio", { name: /Preferred lines/ })).toHaveAttribute(
    "aria-checked",
    "true",
  );
  await expect(
    page.getByRole("radiogroup", { name: "Season balance" }).getByRole("radio", { name: "Strong" }),
  ).toHaveAttribute("aria-checked", "true");
});

test("our league is different: zones back on for U12, and a higher game-time floor", async ({ page }) => {
  const admin = createAdminClient();
  const ownerId = await superAdminId(admin);
  const team = await makeTeam(admin, { ownerId, ageGroup: "U12" });

  await page.goto(`/teams/${team.id}/settings`);
  await page.getByRole("button", { name: /Our league is different/ }).click();

  await page.getByRole("switch", { name: "Play in zones" }).click();
  await expect(page.getByText(/Kids play in zones/)).toBeVisible();
  // Zoned strategies replace the open-age ones.
  await expect(rotation(page).getByRole("radio", { name: /Rotate lines/ })).toBeVisible();
  await expect(rotation(page).getByRole("radio", { name: /Set positions/ })).toHaveCount(0);
  await expect
    .poll(async () => (await playbookRow(admin, team.id))?.policy_overrides)
    .toEqual({ zonesEnforced: true });

  await page.getByRole("combobox", { name: "Minimum game time" }).selectOption("60");
  await expect(page.getByText("Everyone plays at least 60% of the game")).toBeVisible();
  await expect
    .poll(async () => (await playbookRow(admin, team.id))?.policy_overrides)
    .toEqual({ zonesEnforced: true, minGameTimePct: 60 });
});

test("a netball coach picks Position cycle", async ({ page }) => {
  const admin = createAdminClient();
  const ownerId = await superAdminId(admin);
  const team = await makeTeam(admin, { ownerId, ageGroup: "11u", sport: "netball" });

  await page.goto(`/teams/${team.id}/settings`);
  await expect(page.getByText(/Positions follow the rules of play/)).toBeVisible({ timeout: 15_000 });
  for (const name of ["By thirds", "Position by position", "Position cycle", "Partners", "Set positions"]) {
    await expect(rotation(page).getByRole("radio", { name: new RegExp(name) })).toBeVisible();
  }
  await rotation(page).getByRole("radio", { name: /Position cycle/ }).click();
  await expect.poll(async () => (await playbookRow(admin, team.id))?.strategy).toBe("position-cycle");
  // Season balance evens out positions (bibs) for a cycle.
  await expect(page.getByText(/time in each position across the season/)).toBeVisible();
});

test("the wizard's How we play step saves the strategy", async ({ page }) => {
  const admin = createAdminClient();
  const ownerId = await superAdminId(admin);
  const team = await makeTeam(admin, { ownerId, ageGroup: "U14" });

  await page.goto(`/teams/${team.id}/setup?step=config`);
  await expect(page.getByRole("heading", { name: "How we play" })).toBeVisible({ timeout: 15_000 });
  const setPositions = rotation(page).getByRole("radio", { name: /Set positions/ });
  await expect(setPositions).toContainText("Suggested for Under 14");
  await setPositions.click();
  await expect.poll(async () => (await playbookRow(admin, team.id))?.strategy).toBe("set-positions");
  // Set positions keeps kids home, so season balance starts off — and a
  // brand-new team has no season to reset.
  await expect(
    page.getByRole("radiogroup", { name: "Season balance" }).getByRole("radio", { name: "Off" }),
  ).toHaveAttribute("aria-checked", "true");
  await expect(page.getByRole("button", { name: "Reset season balance" })).toHaveCount(0);
});

test("only a coach can change how the team plays", async () => {
  const admin = createAdminClient();
  const ownerId = await superAdminId(admin);
  const team = await makeTeam(admin, { ownerId, ageGroup: "U12" });
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

  const manager = await createTestUser(admin, {
    email: `hwp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@siren.test`,
    password: "how-we-play-pw-1234",
  });
  try {
    await admin
      .from("team_memberships")
      .insert({ team_id: team.id, user_id: manager.id, role: "game_manager" });
    const client = createClient(url, anonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    await client.auth.signInWithPassword({ email: manager.email, password: manager.password });

    const { error } = await client
      .from("team_playbooks")
      .insert({ team_id: team.id, strategy: "set-positions" });
    expect(error).not.toBeNull();
    // Managers can still read it (game day needs it).
    const { error: readError } = await client
      .from("team_playbooks")
      .select("team_id")
      .eq("team_id", team.id);
    expect(readError).toBeNull();
    expect(await playbookRow(admin, team.id)).toBeNull();
  } finally {
    await deleteTestUser(admin, manager.id);
  }
});

test("an AFL U14 coach names the team's positions on the field", async ({ page }) => {
  const admin = createAdminClient();
  const ownerId = await superAdminId(admin);
  const team = await makeTeam(admin, { ownerId, ageGroup: "U14" });
  const activePositions = async () => {
    const { data } = await admin
      .from("team_positions")
      .select("label, name, line, sort")
      .eq("team_id", team.id)
      .is("archived_at", null)
      .order("sort");
    return data ?? [];
  };

  await page.goto(`/teams/${team.id}/settings`);
  // Positions appear once the strategy uses them.
  await expect(page.getByRole("group", { name: "Team positions" })).toHaveCount(0);
  await rotation(page).getByRole("radio", { name: /Set positions/ }).click();
  const field = page.getByRole("group", { name: "Team positions" });
  await expect(field.getByRole("button")).toHaveCount(15);
  await expect(page.getByText("15 positions · 15 on the field")).toBeVisible();

  // Rename CHB and give it a full name.
  await field.getByRole("button", { name: "Centre half-back (CHB)" }).click();
  await page.getByLabel("Short label (up to 4 letters)").fill("key");
  await page.getByLabel("Full name (optional)").fill("Key back");
  await page.getByRole("button", { name: "Done" }).click();
  await expect(field.getByRole("button", { name: "Key back (KEY)" })).toBeVisible();

  // Remove a forward pocket.
  await field.getByRole("button", { name: "Forward pocket (FP)" }).first().click();
  await page.getByRole("button", { name: "Remove position" }).click();
  await expect(page.getByText(/14 positions · 15 on the field\. Add 1 more/)).toBeVisible();

  await page.getByRole("button", { name: "Save positions" }).click();
  await expect.poll(async () => (await activePositions()).length).toBe(14);
  const saved = await activePositions();
  expect(saved.find((p) => p.label === "KEY")).toMatchObject({ name: "Key back", line: "back" });

  // Survives a reload, laid out on the field.
  await page.reload();
  await expect(
    page.getByRole("group", { name: "Team positions" }).getByRole("button", { name: "Key back (KEY)" }),
  ).toBeVisible({ timeout: 15_000 });
  await expect(page.getByRole("group", { name: "Team positions" }).getByRole("button")).toHaveCount(14);
});

test("a coach sets a player's role from the squad", async ({ page }) => {
  const admin = createAdminClient();
  const ownerId = await superAdminId(admin);
  const team = await makeTeam(admin, { ownerId, ageGroup: "U12" });
  const [player] = await makePlayers(admin, { teamId: team.id, ownerId, count: 3 });
  await admin.from("team_playbooks").insert({ team_id: team.id, strategy: "preferred-lines" });

  await page.goto(`/teams/${team.id}/squad`);
  await page.getByRole("button", { name: `Role for ${player.full_name}` }).click();
  await page.getByRole("radiogroup", { name: "Preferred line" }).getByRole("radio", { name: "Forward" }).click();
  await page.getByRole("group", { name: "Never plays" }).getByRole("checkbox", { name: "Back" }).click();
  await page.getByRole("switch", { name: "Keep on" }).click();
  await page.getByRole("button", { name: "Save role" }).click();

  await expect(page.getByTestId(`player-role-${player.id}`)).toHaveText("Prefers Forward · not Back · keep on");
  const { data: prefs } = await admin
    .from("player_position_prefs")
    .select("kind, line, position_key")
    .eq("player_id", player.id)
    .order("kind");
  expect(prefs).toEqual([
    { kind: "home", line: "fwd", position_key: null },
    { kind: "keep_on", line: null, position_key: null },
    { kind: "never", line: "back", position_key: null },
  ]);
});

test("a home position follows the position when the coach renames it", async ({ page }) => {
  const admin = createAdminClient();
  const ownerId = await superAdminId(admin);
  const team = await makeTeam(admin, { ownerId, ageGroup: "U14" });
  const [player] = await makePlayers(admin, { teamId: team.id, ownerId, count: 3 });
  await admin.from("team_playbooks").insert({ team_id: team.id, strategy: "set-positions" });

  await page.goto(`/teams/${team.id}/squad`);
  await page.getByRole("button", { name: `Role for ${player.full_name}` }).click();
  await page
    .getByRole("radiogroup", { name: "Home position" })
    .getByRole("radio", { name: "Full forward (FF)" })
    .click();
  await page.getByRole("button", { name: "Save role" }).click();
  await expect(page.getByTestId(`player-role-${player.id}`)).toHaveText("Home FF");

  // Rename FF on the Team tab; the first save turns defaults into rows.
  await page.goto(`/teams/${team.id}/settings`);
  const field = page.getByRole("group", { name: "Team positions" });
  await field.getByRole("button", { name: "Full forward (FF)" }).click();
  await page.getByLabel("Short label (up to 4 letters)").fill("TALL");
  await page.getByLabel("Full name (optional)").fill("Tall forward");
  await page.getByRole("button", { name: "Done" }).click();
  await page.getByRole("button", { name: "Save positions" }).click();
  await expect
    .poll(async () => {
      const { count } = await admin
        .from("team_positions")
        .select("id", { count: "exact", head: true })
        .eq("team_id", team.id);
      return count;
    })
    .toBe(15);

  await page.goto(`/teams/${team.id}/squad`);
  await expect(page.getByTestId(`player-role-${player.id}`)).toHaveText("Home TALL");
});

test("set positions: game day puts kids in their home line, labelled", async ({ page }) => {
  const admin = createAdminClient();
  const ownerId = await superAdminId(admin);
  const team = await makeTeam(admin, { ownerId, ageGroup: "U14" });
  const players = await makePlayers(admin, { teamId: team.id, ownerId, count: 15 });
  const game = await makeGame(admin, { teamId: team.id, ownerId });
  await admin.from("game_availability").insert(
    players.map((p) => ({ game_id: game.id, player_id: p.id, status: "available" as const, updated_by: ownerId })),
  );
  await admin.from("team_playbooks").insert({ team_id: team.id, strategy: "set-positions" });
  const homes: [number, string, string, string][] = [
    [0, "ff", "Forward", "FF"],
    [1, "fb", "Back", "FB"],
    [2, "c", "Centre", "C"],
  ];
  await admin.from("player_position_prefs").insert(
    homes.map(([i, key]) => ({ team_id: team.id, player_id: players[i].id, position_key: key, kind: "home" })),
  );

  await page.goto(`/teams/${team.id}/games/${game.id}/live`);
  await expect(page.getByRole("button", { name: /^start q1$/i })).toBeVisible({ timeout: 15_000 });
  for (const [i, , line, label] of homes) {
    const tile = page.getByRole("group", { name: line, exact: true }).getByTestId(`player-tile-${players[i].id}`);
    await expect(tile).toBeVisible();
    await expect(tile).toContainText(label);
  }
});
