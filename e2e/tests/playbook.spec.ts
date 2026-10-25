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
import { gotoStable, waitForHydration } from "../helpers/navigation";
import { closeGameSettings, openGameSettings } from "../helpers/break";

test.describe.configure({ mode: "parallel" });

async function superAdminId(admin: SupabaseClient): Promise<string> {
  const { data } = await admin.auth.admin.listUsers();
  return data.users.find((u) => u.email === process.env.TEST_SUPER_ADMIN_EMAIL)!.id;
}

async function playbookRow(admin: SupabaseClient, teamId: string) {
  const { data } = await admin
    .from("team_playbooks")
    .select("strategy, policy_overrides, season_balance, season_balance_since, rules")
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
  const team = await makeTeam(admin, { ownerId, ageGroup: "U12", sport: "afl" });

  await page.goto(`/teams/${team.id}/settings`);
  await expect(page.getByText("Under 12 AFL")).toBeVisible({ timeout: 15_000 });
  const policy = page.getByRole("list", { name: "Age group rules" });
  await expect(policy).toContainText(/No zones at this age/);
  await expect(policy).toContainText("Everyone plays at least 50% of the game");

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
  const team = await makeTeam(admin, { ownerId, ageGroup: "U12", sport: "afl" });

  await page.goto(`/teams/${team.id}/settings`);
  await page.getByRole("button", { name: /Our league is different/ }).click();

  await page.getByRole("switch", { name: "Play in zones" }).click();
  const policy = page.getByRole("list", { name: "Age group rules" });
  await expect(policy).toContainText(/Kids play in zones/);
  // Zoned strategies replace the open-age ones.
  await expect(rotation(page).getByRole("radio", { name: /Rotate lines/ })).toBeVisible();
  await expect(rotation(page).getByRole("radio", { name: /Set positions/ })).toHaveCount(0);
  await expect
    .poll(async () => (await playbookRow(admin, team.id))?.policy_overrides)
    .toEqual({ zonesEnforced: true });

  await page.getByRole("combobox", { name: "Minimum game time" }).selectOption("60");
  await expect(policy).toContainText("Everyone plays at least 60% of the game");
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
  await expect(page.getByText(/time in each position across the season. It decides/)).toBeVisible();
});

// Round 5 (setup-netball-rotation): the "Add a rule" list said "every
// line" on a netball team, whose units are thirds. Titles use the
// sport's word, as the rule sentences already did.
test("a netball team's Add a rule list talks about thirds, not lines", async ({ page }) => {
  const admin = createAdminClient();
  const ownerId = await superAdminId(admin);
  const team = await makeTeam(admin, { ownerId, ageGroup: "11u", sport: "netball" });

  await page.goto(`/teams/${team.id}/settings`);
  await page.getByRole("button", { name: "+ Add a rule" }).click({ timeout: 15_000 });
  const list = page.getByRole("dialog", { name: "Add a rule" });
  await expect(list).toContainText("Everyone plays every third each game");
  await expect(list).not.toContainText(/every line|different lines/);
});

// Sports are independent (14 Oct 2026): league was offered every
// catalogue rule though its engine acts on none but "subs only at the
// breaks". Its Add a rule list now holds only what league does.
test("a league team's Add a rule list holds only what league acts on", async ({ page }) => {
  const admin = createAdminClient();
  const ownerId = await superAdminId(admin);
  const team = await makeTeam(admin, { ownerId, ageGroup: "U11", sport: "rugby_league" });

  await page.goto(`/teams/${team.id}/settings`);
  await waitForHydration(page);
  await page.getByRole("button", { name: "+ Add a rule" }).click({ timeout: 15_000 });
  const list = page.getByRole("dialog", { name: "Add a rule" });
  await expect(list.getByRole("listitem")).toHaveText(["Subs only at the breaks"]);
  await expect(list).not.toContainText(/Mod League/);
});

test("the wizard's How we play step saves the strategy", async ({ page }) => {
  const admin = createAdminClient();
  const ownerId = await superAdminId(admin);
  const team = await makeTeam(admin, { ownerId, ageGroup: "U14", sport: "afl" });

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
  const team = await makeTeam(admin, { ownerId, ageGroup: "U12", sport: "afl" });
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
  const team = await makeTeam(admin, { ownerId, ageGroup: "U14", sport: "afl" });
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

  // Rename CHB and give it a full name. Typing replaces the old label
  // (usability run: it used to append, "CHB" + "KEY" → "CHBK").
  await field.getByRole("button", { name: "Centre half-back (CHB)" }).click();
  const shortLabel = page.getByLabel("Short label (up to 4 letters)");
  await shortLabel.click();
  // The tap selects the label on the next frame (after the browser places
  // the cursor); a person types after that. WebKit's typing is faster.
  await expect
    .poll(() => shortLabel.evaluate((el: HTMLInputElement) => el.selectionStart === 0 && el.selectionEnd === el.value.length))
    .toBe(true);
  await page.keyboard.type("key");
  await expect(page.getByLabel("Short label (up to 4 letters)")).toHaveValue("KEY");
  await page.getByLabel("Full name (optional)").fill("Key back");
  await page.getByRole("button", { name: "Done" }).click();
  await expect(field.getByRole("button", { name: "Key back (KEY)" })).toBeVisible();

  // Remove a forward pocket.
  await field.getByRole("button", { name: "Left forward pocket (LFP)" }).click();
  await page.getByRole("button", { name: "Remove position" }).click();
  await expect(page.getByText(/14 positions · 15 on the field\. Add 1 more/)).toBeVisible();

  // Every position is its own: two can't share a label.
  await field.getByRole("button", { name: "Full back (FB)" }).click();
  await page.getByLabel("Short label (up to 4 letters)").fill("key");
  await page.getByRole("button", { name: "Done" }).click();
  await page.getByRole("button", { name: "Save positions" }).click();
  await expect(page.getByText("Each position needs its own label: KEY is used twice.")).toBeVisible();
  expect(await activePositions()).toHaveLength(0);
  await field.getByRole("button", { name: "Full back (KEY)" }).click();
  await page.getByLabel("Short label (up to 4 letters)").fill("fb");
  await page.getByRole("button", { name: "Done" }).click();

  await page.getByRole("button", { name: "Save positions" }).click();
  await expect.poll(async () => (await activePositions()).length).toBe(14);
  // The editor says it saved (usability run: a greyed button alone left
  // the coach unsure).
  await expect(page.getByText("Positions saved.")).toBeVisible();
  const saved = await activePositions();
  expect(saved.find((p) => p.label === "KEY")).toMatchObject({ name: "Key back", line: "back" });

  // Survives a reload, laid out on the field.
  await page.reload();
  await expect(
    page.getByRole("group", { name: "Team positions" }).getByRole("button", { name: "Key back (KEY)" }),
  ).toBeVisible({ timeout: 15_000 });
  await expect(page.getByRole("group", { name: "Team positions" }).getByRole("button")).toHaveCount(14);
});

// Steve 2026-10-16: a new rugby team choosing "Named positions" had no
// way to create its preferred positions — the standard catalogue
// applied silently with no editor (AFL open ages had one). Rugby's
// named-position ages now get the same editor, seeded from the
// standard list, saving on rugby's own forwards/backs lines.
test("a league U12 coach creates the team's preferred positions", async ({ page }) => {
  const admin = createAdminClient();
  const ownerId = await superAdminId(admin);
  const team = await makeTeam(admin, { ownerId, ageGroup: "U12", sport: "rugby_league" });
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
  await rotation(page).getByRole("radio", { name: /Named positions/ }).click();
  const field = page.getByRole("group", { name: "Team positions" });
  // U12 Mod League: the 13-a-side standard catalogue seeds the list.
  await expect(field.getByRole("button")).toHaveCount(13);

  // Rename the hooker to the club's own word for it.
  await field.getByRole("button", { name: "Hooker (HK)" }).click();
  await page.getByLabel("Short label (up to 4 letters)").fill("rake");
  await page.getByLabel("Full name (optional)").fill("Rake");
  await page.getByRole("button", { name: "Done" }).click();
  await expect(field.getByRole("button", { name: "Rake (RAKE)" })).toBeVisible();

  // The line control speaks rugby: Forwards and Backs, no AFL Centre.
  // (exact — the strategy radios' blurbs also say "forwards".)
  await field.getByRole("button", { name: "Fullback (FB)" }).click();
  await expect(page.getByRole("radio", { name: "Forwards", exact: true })).toBeVisible();
  await expect(page.getByRole("radio", { name: "Backs", exact: true })).toBeVisible();
  await expect(page.getByRole("radio", { name: "Centre", exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Cancel" }).click();

  await page.getByRole("button", { name: "Save positions" }).click();
  await expect.poll(async () => (await activePositions()).length).toBe(13);
  await expect(page.getByText("Positions saved.")).toBeVisible();
  const saved = await activePositions();
  expect(saved.find((p) => p.label === "RAKE")).toMatchObject({ name: "Rake", line: "forwards" });

  // Survives a reload, laid out on the pitch.
  await page.reload();
  await expect(
    page.getByRole("group", { name: "Team positions" }).getByRole("button", { name: "Rake (RAKE)" }),
  ).toBeVisible({ timeout: 15_000 });
});

test("a coach sets a player's role from the squad", async ({ page }) => {
  const admin = createAdminClient();
  const ownerId = await superAdminId(admin);
  const team = await makeTeam(admin, { ownerId, ageGroup: "U12", sport: "afl" });
  const [player] = await makePlayers(admin, { teamId: team.id, ownerId, count: 3 });
  await admin.from("team_playbooks").insert({ team_id: team.id, strategy: "preferred-lines" });

  await page.goto(`/teams/${team.id}/squad`);
  await page.getByRole("button", { name: `Role for ${player.full_name}` }).click();
  const playsAs = page.getByRole("group", { name: "Plays as" });
  await playsAs.getByRole("checkbox", { name: "Forward" }).click();
  await playsAs.getByRole("checkbox", { name: "Centre" }).click();
  await page.getByRole("radiogroup", { name: "Main line" }).getByRole("radio", { name: "Forward" }).click();
  await page.getByRole("switch", { name: "Plays every minute" }).click();
  await page.getByRole("button", { name: "Save role" }).click();

  await expect(page.getByTestId(`player-role-${player.id}`)).toHaveText(
    "Plays Forward, Centre · main Forward · every minute",
  );
  // "Plays as" is stored as before: Back, the line left out, is a never row.
  const { data: prefs } = await admin
    .from("player_position_prefs")
    .select("kind, line, position_key")
    .eq("player_id", player.id)
    .order("kind");
  expect(prefs).toEqual([
    { kind: "also", line: "mid", position_key: null },
    { kind: "home", line: "fwd", position_key: null },
    { kind: "keep_on", line: null, position_key: null },
    { kind: "never", line: "back", position_key: null },
  ]);
});

test("a home position follows the position when the coach renames it", async ({ page }) => {
  const admin = createAdminClient();
  const ownerId = await superAdminId(admin);
  const team = await makeTeam(admin, { ownerId, ageGroup: "U14", sport: "afl" });
  const [player] = await makePlayers(admin, { teamId: team.id, ownerId, count: 3 });
  await admin.from("team_playbooks").insert({ team_id: team.id, strategy: "set-positions" });

  await page.goto(`/teams/${team.id}/squad`);
  await page.getByRole("button", { name: `Role for ${player.full_name}` }).click();
  await page
    .getByRole("radiogroup", { name: "Main position" })
    .getByRole("radio", { name: "Full forward (FF)" })
    .click();
  await page.getByRole("button", { name: "Save role" }).click();
  await expect(page.getByTestId(`player-role-${player.id}`)).toHaveText("Main FF");

  // Rename FF on the Team tab; the first save turns defaults into rows.
  await page.goto(`/teams/${team.id}/settings`);
  await waitForHydration(page);
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
  // The pref moves to the new row once the positions are in.
  await expect
    .poll(async () => {
      const { data } = await admin
        .from("player_position_prefs")
        .select("position_key")
        .eq("player_id", player.id)
        .eq("kind", "home")
        .single();
      return data?.position_key;
    })
    .not.toBe("ff");

  await gotoStable(page, `/teams/${team.id}/squad`);
  await expect(page.getByTestId(`player-role-${player.id}`)).toHaveText("Main TALL");
});

test("set positions: game day puts kids in their home line, labelled", async ({ page }) => {
  const admin = createAdminClient();
  const ownerId = await superAdminId(admin);
  const team = await makeTeam(admin, { ownerId, ageGroup: "U14", sport: "afl" });
  const players = await makePlayers(admin, { teamId: team.id, ownerId, count: 15 });
  const game = await makeGame(admin, { teamId: team.id, ownerId });
  await admin.from("game_availability").insert(
    players.map((p) => ({ game_id: game.id, player_id: p.id, status: "available" as const, updated_by: ownerId })),
  );
  await admin.from("team_playbooks").insert({ team_id: team.id, strategy: "set-positions" });
  // Nine on the field, six on the bench: kids with a home position
  // still start (usability run: "home kids start"), even at the end of
  // the jersey order.
  await admin.from("games").update({ on_field_size: 9 }).eq("id", game.id);
  const homes: [number, string, string, string][] = [
    [12, "ff", "Forward", "FF"],
    [13, "fb", "Back", "FB"],
    [14, "c", "Centre", "C"],
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

test("kickoff freezes How we play onto the game", async ({ page }) => {
  const admin = createAdminClient();
  const ownerId = await superAdminId(admin);
  const team = await makeTeam(admin, { ownerId, ageGroup: "U12", sport: "afl" });
  const players = await makePlayers(admin, { teamId: team.id, ownerId, count: 14 });
  const game = await makeGame(admin, { teamId: team.id, ownerId });
  await admin.from("game_availability").insert(
    players.map((p) => ({ game_id: game.id, player_id: p.id, status: "available" as const, updated_by: ownerId })),
  );
  await admin
    .from("team_playbooks")
    .insert({ team_id: team.id, strategy: "preferred-lines", season_balance: "strong" });

  await page.addInitScript(() => {
    try {
      localStorage.setItem("gm-walkthrough-seen", "1");
    } catch {}
  });
  await page.goto(`/teams/${team.id}/games/${game.id}/live`);
  await page.getByRole("button", { name: /^start q1$/i }).click({ timeout: 15_000 });
  await expect(page.getByRole("heading", { name: /^start q1$/i })).toBeVisible();
  await page.getByRole("button", { name: /^start [qh]\d+ now$/i }).click();

  const snapshot = async () => {
    const { data } = await admin.from("games").select("playbook_snapshot").eq("id", game.id).single();
    return data?.playbook_snapshot as { strategy: string; seasonBalance: string; policy: { minGameTimePct: number } } | null;
  };
  await expect.poll(async () => (await snapshot())?.strategy, { timeout: 15_000 }).toBe("preferred-lines");
  expect((await snapshot())?.seasonBalance).toBe("strong");
  expect((await snapshot())?.policy.minGameTimePct).toBe(50);

  // A change on the Team tab afterwards doesn't rewrite the game.
  await admin.from("team_playbooks").update({ strategy: "free" }).eq("team_id", team.id);
  expect((await snapshot())?.strategy).toBe("preferred-lines");
});

test("a coach adds rules and a local rule pack", async ({ page }) => {
  const admin = createAdminClient();
  const ownerId = await superAdminId(admin);
  const team = await makeTeam(admin, { ownerId, ageGroup: "U12", sport: "afl" });
  const [mia, jack] = await makePlayers(admin, { teamId: team.id, ownerId, count: 4 });
  const rules = async () =>
    ((await playbookRow(admin, team.id)) as { rules?: { kind: string; params: Record<string, unknown>; strength: string; source?: string }[] } | null)?.rules ?? [];

  await page.goto(`/teams/${team.id}/settings`);
  const list = page.getByRole("list", { name: "Rules", exact: true });
  // The game-time floor is always there, locked, with its source.
  await expect(list).toContainText("Everyone plays at least 50% of the game");
  // The source is the sport's own (its age policy), not a name check.
  await expect(list).toContainText("AFL Junior Rules (May 2024)");

  // Add "nobody sits out twice in a row", make it Prefer.
  await page.getByRole("button", { name: "+ Add a rule" }).click();
  await page.getByRole("listitem").filter({ hasText: "Nobody sits out twice in a row" }).click();
  const bench = page.getByTestId("rule-max-bench-in-row");
  await expect(bench).toContainText("Nobody sits on the bench 2 stints in a row");
  await bench.getByRole("radio", { name: "Prefer" }).click();
  await expect
    .poll(async () => (await rules()).map((r) => [r.kind, r.strength]))
    .toEqual([["max-bench-in-row", "prefer"]]);

  // Keep two players apart.
  await page.getByRole("button", { name: "+ Add a rule" }).click();
  await page.getByRole("listitem").filter({ hasText: "Keep players apart" }).click();
  const picker = page.getByRole("group", { name: "Players" });
  await picker.getByRole("checkbox", { name: mia.full_name }).click();
  await picker.getByRole("checkbox", { name: jack.full_name }).click();
  await page.getByRole("button", { name: "Done" }).click();
  await expect(page.getByTestId("rule-keep-apart")).toContainText(`Keep ${mia.full_name} and ${jack.full_name} apart`);
  await expect
    .poll(async () => (await rules()).find((r) => r.kind === "keep-apart")?.params.playerIds)
    .toEqual([mia.id, jack.id]);

  // A local pack: its rules join, and its 60% floor applies.
  await page.getByRole("button", { name: "+ Add a rule" }).click();
  await page.getByRole("button", { name: /Club development/ }).click();
  await expect(page.getByTestId("rule-every-line-per-game")).toContainText("Local rules (added by you)");
  await expect(page.getByText("Everyone plays at least 60% of the game").first()).toBeVisible();
  await expect
    .poll(async () => (await rules()).map((r) => r.kind).sort())
    .toEqual(["every-line-per-game", "keep-apart", "max-bench-in-row"]);
  expect((await playbookRow(admin, team.id))?.policy_overrides).toEqual({ minGameTimePct: 60 });

  // Remove a rule.
  await page.getByRole("button", { name: /Remove rule: Keep/ }).click();
  await expect.poll(async () => (await rules()).some((r) => r.kind === "keep-apart")).toBe(false);
});

test("Must rules shape the game-day lineup", async ({ page }) => {
  const admin = createAdminClient();
  const ownerId = await superAdminId(admin);
  const team = await makeTeam(admin, { ownerId, ageGroup: "U12", sport: "afl" });
  const players = await makePlayers(admin, { teamId: team.id, ownerId, count: 14 });
  const game = await makeGame(admin, { teamId: team.id, ownerId });
  await admin.from("game_availability").insert(
    players.map((p) => ({ game_id: game.id, player_id: p.id, status: "available" as const, updated_by: ownerId })),
  );
  const homeBack = players.slice(0, 3);
  const apart = [players[3], players[4]];
  await admin.from("team_playbooks").insert({
    team_id: team.id,
    strategy: "free",
    rules: [
      { id: "r1", kind: "stays-home", params: { playerIds: homeBack.map((p) => p.id) }, strength: "must", enabled: true },
      { id: "r2", kind: "keep-apart", params: { playerIds: apart.map((p) => p.id) }, strength: "must", enabled: true },
    ],
  });
  await admin.from("player_position_prefs").insert(
    homeBack.map((p) => ({ team_id: team.id, player_id: p.id, line: "back", kind: "home" })),
  );

  await page.goto(`/teams/${team.id}/games/${game.id}/live`);
  await expect(page.getByRole("button", { name: /^start q1$/i })).toBeVisible({ timeout: 15_000 });
  // Staying home is about where they play, not whether: on the field
  // means the Back line (with 14 kids, two start on the bench).
  for (const p of homeBack) {
    for (const line of ["Centre", "Forward"]) {
      await expect(
        page.getByRole("group", { name: line, exact: true }).getByTestId(`player-tile-${p.id}`),
      ).toHaveCount(0);
    }
  }
  await expect(
    page.getByRole("group", { name: "Back", exact: true }).getByTestId(new RegExp(homeBack.map((p) => p.id).join("|"))),
  ).not.toHaveCount(0);
  for (const line of ["Back", "Centre", "Forward"]) {
    const group = page.getByRole("group", { name: line, exact: true });
    const both = (await group.getByTestId(`player-tile-${apart[0].id}`).count()) + (await group.getByTestId(`player-tile-${apart[1].id}`).count());
    expect(both).toBeLessThan(2);
  }
});

test("the rule check reads the lineup, and the break says why kids move", async ({ page }) => {
  const admin = createAdminClient();
  const ownerId = await superAdminId(admin);
  const team = await makeTeam(admin, { ownerId, ageGroup: "U12", sport: "afl" });
  const players = await makePlayers(admin, { teamId: team.id, ownerId, count: 14 });
  const game = await makeGame(admin, { teamId: team.id, ownerId });
  await admin.from("game_availability").insert(
    players.map((p) => ({ game_id: game.id, player_id: p.id, status: "available" as const, updated_by: ownerId })),
  );
  await admin.from("team_playbooks").insert({
    team_id: team.id,
    strategy: "free",
    season_balance: "off",
    rules: [{ id: "r1", kind: "max-bench-in-row", params: { count: 2 }, strength: "must", enabled: true }],
  });
  await page.addInitScript(() => {
    try {
      localStorage.setItem("gm-walkthrough-seen", "1");
    } catch {}
  });

  // Pre-game: everything's kept.
  await page.goto(`/teams/${team.id}/games/${game.id}/live`);
  await expect(page.getByTestId("rule-check-summary")).toHaveText("All rules kept", { timeout: 15_000 });
  await page.getByTestId("rule-check").getByRole("button").first().click();
  await expect(page.getByTestId("rule-check")).toContainText("Nobody sits out twice in a row");
  await expect(page.getByTestId("rule-check")).toContainText("Everyone can play at least 50%");

  // Q1 played with two on the bench; at the break the suggestion brings
  // them on and says why.
  const ids = players.map((p) => p.id);
  const lineup = { back: ids.slice(0, 4), hback: [], mid: ids.slice(4, 8), hfwd: [], fwd: ids.slice(8, 12), bench: ids.slice(12) };
  const t = new Date(Date.now() - 16 * 60_000).toISOString();
  await admin.from("game_events").insert([
    { game_id: game.id, type: "lineup_set", metadata: { lineup }, created_by: ownerId, created_at: t },
    { game_id: game.id, type: "quarter_start", metadata: { quarter: 1 }, created_by: ownerId, created_at: t },
    { game_id: game.id, type: "quarter_end", metadata: { quarter: 1, elapsed_ms: 15 * 60_000 }, created_by: ownerId, created_at: t },
  ]);
  await admin.from("games").update({ status: "in_progress" }).eq("id", game.id);
  await page.goto(`/teams/${team.id}/games/${game.id}/live`);
  // At the break (the shared period break screen) the suggestion brings
  // Q1's bench kids on: every rule kept, so there's no issues card.
  await expect(page.getByRole("heading", { name: /^q2 lineup$/i })).toBeVisible({ timeout: 15_000 });
  await expect(page.getByTestId("break-issues")).toHaveCount(0);

  // Round 5 (rushed-coach, chaotic-substitution): lending a kid at the
  // break left a spot empty while the check said "All rules kept". The
  // empty spot is a warning now. (A lent kid isn't held to the rules, so
  // "sits out twice" stays kept.)
  await openGameSettings(page);
  await page.getByRole("button", { name: /^\+?\s*lend a player$/i }).click();
  await page
    .getByRole("dialog", { name: /lend/i })
    .getByRole("button", { name: new RegExp(players[12].full_name) })
    .click();
  await closeGameSettings(page);
  const issues = page.getByTestId("break-issues");
  await expect(issues.getByTestId("break-broken-rule")).toHaveCount(0);
  await issues.getByRole("button", { name: /^1 warning/ }).click();
  await expect(issues).toContainText("1 spot is empty");
});

test("stats show season balance, backfilled, with since-reset", async ({ page }) => {
  const admin = createAdminClient();
  const ownerId = await superAdminId(admin);
  const team = await makeTeam(admin, { ownerId, ageGroup: "U12", sport: "afl" });
  const players = await makePlayers(admin, { teamId: team.id, ownerId, count: 12 });
  const game = await makeGame(admin, { teamId: team.id, ownerId });
  const ids = players.map((p) => p.id);
  // A finished game from before the rollup existed: events only.
  const lineup = { back: ids.slice(0, 4), hback: [], mid: ids.slice(4, 8), hfwd: [], fwd: ids.slice(8, 12), bench: [] };
  const t = (min: number) => new Date(Date.now() - min * 60_000).toISOString();
  await admin.from("game_events").insert([
    { game_id: game.id, type: "lineup_set", metadata: { lineup }, created_by: ownerId, created_at: t(70) },
    { game_id: game.id, type: "quarter_start", metadata: { quarter: 1 }, created_by: ownerId, created_at: t(70) },
    { game_id: game.id, type: "quarter_end", metadata: { quarter: 1, elapsed_ms: 15 * 60_000 }, created_by: ownerId, created_at: t(55) },
    { game_id: game.id, type: "game_finalised", metadata: { quarter: 4 }, created_by: ownerId, created_at: t(50) },
  ]);
  await admin.from("games").update({ status: "completed", scheduled_at: t(80) }).eq("id", game.id);

  await page.goto(`/teams/${team.id}/stats`);
  const section = page.getByRole("region", { name: "Season balance" });
  await expect(section).toBeVisible({ timeout: 15_000 });
  await expect(page.getByTestId("season-balance-summary")).toContainText("of 12 kids within a quarter of even");
  await expect(section.getByRole("table", { name: "Season balance" })).toContainText(players[0].full_name);
  // The rollup was backfilled for that game.
  await expect
    .poll(async () => (await admin.from("player_game_time").select("player_id").eq("game_id", game.id)).data?.length ?? 0)
    .toBe(12);

  // After a reset, "Since reset" counts nothing yet.
  await admin.from("team_playbooks").insert({ team_id: team.id, season_balance_since: new Date().toISOString() });
  await page.reload();
  await waitForHydration(page);
  await page.getByRole("link", { name: "Since reset" }).click();
  // The stats page renders on the server; under a loaded test run that
  // takes more than the 5 s default (the link is tapped, the page lags).
  await expect(page).toHaveURL(/balance=since/, { timeout: 15_000 });
  await expect(section.getByText("No data yet")).toBeVisible();
  await page.getByRole("link", { name: "Whole season" }).click();
  await expect(page.getByTestId("season-balance-summary")).toContainText("of 12 kids");
});

// Sideline combos in season zone time (the season balance rollup): a
// mid-quarter zone switch counts in both zones, and a kid injured then
// replaced is counted once. Pre-fix the rollup's replay ignored the
// switch and credited the injured kid's stint twice.
test("season zone time follows a zone switch and an injury replacement", async ({ page }) => {
  const admin = createAdminClient();
  const ownerId = await superAdminId(admin);
  const team = await makeTeam(admin, { ownerId, ageGroup: "U12", sport: "afl" });
  const players = await makePlayers(admin, { teamId: team.id, ownerId, count: 14 });
  const game = await makeGame(admin, { teamId: team.id, ownerId });
  const ids = players.map((p) => p.id);
  const lineup = { back: ids.slice(0, 4), hback: [], mid: ids.slice(4, 8), hfwd: [], fwd: ids.slice(8, 12), bench: ids.slice(12) };
  const t = (min: number) => new Date(Date.now() - min * 60_000).toISOString();
  const MIN = 60_000;
  const [switchBack, hurt, switchFwd, replacement] = [ids[0], ids[4], ids[8], ids[12]];
  await admin.from("game_events").insert(
    [
      { type: "lineup_set", metadata: { lineup }, created_at: t(70) },
      { type: "quarter_start", metadata: { quarter: 1 }, created_at: t(69) },
      { type: "injury", player_id: hurt, metadata: { injured: true, quarter: 1, elapsed_ms: 5 * MIN }, created_at: t(64) },
      { type: "swap", metadata: { off_player_id: hurt, on_player_id: replacement, zone: "mid", quarter: 1, elapsed_ms: 5 * MIN }, created_at: t(63.9) },
      {
        type: "field_zone_swap",
        metadata: { player_a_id: switchBack, zone_a: "back", player_b_id: switchFwd, zone_b: "fwd", quarter: 1, elapsed_ms: 6 * MIN },
        created_at: t(63),
      },
      { type: "quarter_end", metadata: { quarter: 1, elapsed_ms: 15 * MIN }, created_at: t(54) },
      { type: "game_finalised", metadata: { quarter: 4 }, created_at: t(50) },
    ].map((e) => ({ ...e, game_id: game.id, created_by: ownerId })),
  );
  await admin.from("games").update({ status: "completed", scheduled_at: t(80) }).eq("id", game.id);

  // Stats backfill the rollup for the finished game.
  await page.goto(`/teams/${team.id}/stats`);
  await expect(page.getByRole("region", { name: "Season balance" })).toBeVisible({ timeout: 15_000 });
  const zoneMs = async () => {
    const { data } = await admin
      .from("player_game_time")
      .select("player_id, unit_key, ms")
      .eq("game_id", game.id)
      .eq("unit_kind", "zone");
    const out: Record<string, Record<string, number>> = {};
    for (const r of data ?? []) (out[r.player_id] ??= {})[r.unit_key] = r.ms;
    return out;
  };
  await expect.poll(async () => Object.keys(await zoneMs()).length, { timeout: 15_000 }).toBeGreaterThan(0);
  const ms = await zoneMs();
  expect(ms[switchBack]).toMatchObject({ back: 6 * MIN, fwd: 9 * MIN });
  expect(ms[switchFwd]).toMatchObject({ fwd: 6 * MIN, back: 9 * MIN });
  expect(ms[hurt]).toEqual({ mid: 5 * MIN });
  expect(ms[replacement]).toEqual({ mid: 10 * MIN });
});

test("a finished game says how we played against the rules", async ({ page }) => {
  const admin = createAdminClient();
  const ownerId = await superAdminId(admin);
  const team = await makeTeam(admin, { ownerId, ageGroup: "U12", sport: "afl" });
  const players = await makePlayers(admin, { teamId: team.id, ownerId, count: 14 });
  const game = await makeGame(admin, { teamId: team.id, ownerId });
  await admin.from("team_playbooks").insert({
    team_id: team.id,
    strategy: "free",
    rules: [{ id: "r1", kind: "max-bench-in-row", params: { count: 2 }, strength: "must", enabled: true }],
  });
  // Two kids sit out Q1 and Q2.
  const ids = players.map((p) => p.id);
  const lineup = { back: ids.slice(0, 4), hback: [], mid: ids.slice(4, 8), hfwd: [], fwd: ids.slice(8, 12), bench: ids.slice(12) };
  const t = (min: number) => new Date(Date.now() - min * 60_000).toISOString();
  const Q = 15 * 60_000;
  await admin.from("game_events").insert([
    { game_id: game.id, type: "lineup_set", metadata: { lineup }, created_by: ownerId, created_at: t(70) },
    { game_id: game.id, type: "quarter_start", metadata: { quarter: 1 }, created_by: ownerId, created_at: t(69) },
    { game_id: game.id, type: "quarter_end", metadata: { quarter: 1, elapsed_ms: Q }, created_by: ownerId, created_at: t(54) },
    { game_id: game.id, type: "quarter_start", metadata: { quarter: 2 }, created_by: ownerId, created_at: t(53) },
    { game_id: game.id, type: "quarter_end", metadata: { quarter: 2, elapsed_ms: Q }, created_by: ownerId, created_at: t(38) },
    { game_id: game.id, type: "game_finalised", metadata: { quarter: 4 }, created_by: ownerId, created_at: t(37) },
  ]);
  await admin.from("games").update({ status: "completed" }).eq("id", game.id);

  await page.goto(`/teams/${team.id}/games/${game.id}`);
  const card = page.getByTestId("how-we-played");
  await expect(card).toBeVisible({ timeout: 15_000 });
  await expect(card).toContainText(`${players[12].full_name} and ${players[13].full_name} sat out 2 in a row`);
  await expect(card).toContainText(`${players[12].full_name} and ${players[13].full_name} played under 50%`);
  await expect(card).toContainText("2 rules missed");
  // A team's first game has no season to compare with.
  await expect(card).not.toContainText("Season balance");
  // Stagehand round 3: the game-time list left out the kids How we played
  // flagged. They're listed at 0:00.
  const summary = page.locator("#summary");
  for (const p of [players[12], players[13]]) {
    await expect(summary).toContainText(`${p.full_name.split(" ")[0]} — 0:00 (didn't get on)`);
  }
  // Round 4: and the headline counts them, so it matches the list
  // (it said "12 players" over 14 rows).
  await expect(summary).toContainText("12 players · 2 didn't get on");
});

test("how we played judges game time on the quarters as they ran", async ({ page }) => {
  // Stagehand round 2: quarters ended early and kids who played exactly
  // half the time played were flagged under 50% (measured against the
  // full quarter length).
  const admin = createAdminClient();
  const ownerId = await superAdminId(admin);
  const team = await makeTeam(admin, { ownerId, ageGroup: "U12", sport: "afl" });
  const players = await makePlayers(admin, { teamId: team.id, ownerId, count: 14 });
  const game = await makeGame(admin, { teamId: team.id, ownerId });
  const ids = players.map((p) => p.id);
  // Q1: kids 0-11 on, 12-13 bench. Q2: 12-13 on for 10-11. Each of the
  // four swapped kids plays one of two 8-minute quarters: exactly half.
  const q1 = { back: ids.slice(0, 4), hback: [], mid: ids.slice(4, 8), hfwd: [], fwd: ids.slice(8, 12), bench: ids.slice(12) };
  const q2 = { ...q1, fwd: [...ids.slice(8, 10), ...ids.slice(12)], bench: ids.slice(10, 12) };
  const t = (min: number) => new Date(Date.now() - min * 60_000).toISOString();
  const ran = 8 * 60_000;
  await admin.from("game_events").insert([
    { game_id: game.id, type: "lineup_set", metadata: { lineup: q1 }, created_by: ownerId, created_at: t(40) },
    { game_id: game.id, type: "quarter_start", metadata: { quarter: 1 }, created_by: ownerId, created_at: t(39) },
    { game_id: game.id, type: "quarter_end", metadata: { quarter: 1, elapsed_ms: ran }, created_by: ownerId, created_at: t(31) },
    { game_id: game.id, type: "lineup_set", metadata: { lineup: q2 }, created_by: ownerId, created_at: t(30) },
    { game_id: game.id, type: "quarter_start", metadata: { quarter: 2 }, created_by: ownerId, created_at: t(29) },
    { game_id: game.id, type: "quarter_end", metadata: { quarter: 2, elapsed_ms: ran }, created_by: ownerId, created_at: t(21) },
    { game_id: game.id, type: "game_finalised", metadata: { quarter: 2 }, created_by: ownerId, created_at: t(20) },
  ]);
  await admin.from("games").update({ status: "completed" }).eq("id", game.id);

  await page.goto(`/teams/${team.id}/games/${game.id}`);
  const card = page.getByTestId("how-we-played");
  await expect(card).toBeVisible({ timeout: 15_000 });
  await expect(card).toContainText("Everyone played at least 50%");
});

test("league: lines from roles, and vests in a fixed order", async ({ page }) => {
  const admin = createAdminClient();
  const ownerId = await superAdminId(admin);
  const team = await makeTeam(admin, { ownerId, ageGroup: "U10", sport: "rugby_league" });
  const players = await makePlayers(admin, { teamId: team.id, ownerId, count: 13, ageGroup: "U10" });
  const game = await makeGame(admin, { teamId: team.id, ownerId });
  await admin.from("games").update({ on_field_size: 11 }).eq("id", game.id);
  await admin.from("game_availability").insert(
    players.map((p) => ({ game_id: game.id, player_id: p.id, status: "available" as const, updated_by: ownerId })),
  );
  await admin.from("team_playbooks").insert({ team_id: team.id, strategy: "preferred-line", vest_strategy: "fixed-order" });
  // Four kids who never play forwards.
  const backsOnly = players.slice(9, 13);
  await admin.from("player_position_prefs").insert(
    backsOnly.map((p) => ({ team_id: team.id, player_id: p.id, line: "forwards", kind: "never" })),
  );
  await page.addInitScript(() => {
    try {
      localStorage.setItem("rl-walkthrough-seen", "1");
      localStorage.setItem("gm-walkthrough-seen", "1");
    } catch {}
  });

  // The Team tab shows the vest strategy.
  await page.goto(`/teams/${team.id}/settings`);
  await expect(
    page.getByRole("radiogroup", { name: "Vests" }).getByRole("radio", { name: "Fixed order" }),
  ).toHaveAttribute("aria-checked", "true", { timeout: 15_000 });
  // It says what the fixed order is (usability run: "doesn't say what order").
  await expect(page.getByText(/in jersey-number order/)).toBeVisible();

  await page.goto(`/teams/${team.id}/games/${game.id}/live`);
  await page.getByRole("button", { name: /^start h1$/i }).click({ timeout: 15_000 });
  await page.getByRole("button", { name: /^start [qh]\d+ now$/i }).click();

  const lineupSet = async () => {
    const { data } = await admin.from("game_events").select("metadata").eq("game_id", game.id).eq("type", "lineup_set");
    return (data?.[0]?.metadata as { lineup?: { forwards: string[]; backs: string[] } })?.lineup ?? null;
  };
  await expect.poll(async () => (await lineupSet()) !== null, { timeout: 15_000 }).toBe(true);
  const lineup = (await lineupSet())!;
  for (const p of backsOnly) expect(lineup.forwards).not.toContain(p.id);

  // Fixed order with no previous wearer: FR goes to the lowest jersey on the field.
  const onField = [...lineup.forwards, ...lineup.backs];
  const firstByJersey = players
    .filter((p) => onField.includes(p.id))
    .sort((a, b) => a.jersey_number - b.jersey_number)[0];
  // The vest lands after the lineup; wait for it rather than read once.
  const frWearer = async () => {
    const { data: vests } = await admin
      .from("game_events")
      .select("player_id, metadata")
      .eq("game_id", game.id)
      .eq("type", "vest_assigned");
    const fr = (vests ?? []).find((v) => (v.metadata as { vest?: string; period?: number }).vest === "fr" && (v.metadata as { period?: number }).period === 1);
    return fr?.player_id;
  };
  await expect.poll(frWearer, { timeout: 15_000 }).toBe(firstByJersey.id);
});

test("league named positions: a home position shows on the tile", async ({ page }) => {
  const admin = createAdminClient();
  const ownerId = await superAdminId(admin);
  const team = await makeTeam(admin, { ownerId, ageGroup: "U10", sport: "rugby_league" });
  const players = await makePlayers(admin, { teamId: team.id, ownerId, count: 13, ageGroup: "U10" });
  const game = await makeGame(admin, { teamId: team.id, ownerId });
  await admin.from("games").update({ on_field_size: 11 }).eq("id", game.id);
  await admin.from("game_availability").insert(
    players.map((p) => ({ game_id: game.id, player_id: p.id, status: "available" as const, updated_by: ownerId })),
  );
  await admin.from("team_playbooks").insert({ team_id: team.id, strategy: "named-positions" });
  const hooker = players[3];
  await admin.from("player_position_prefs").insert({ team_id: team.id, player_id: hooker.id, position_key: "hk", kind: "home" });

  // The squad's role sheet offers the catalogue positions.
  await page.goto(`/teams/${team.id}/squad`);
  await expect(page.getByTestId(`player-role-${hooker.id}`)).toHaveText("Main HK", { timeout: 15_000 });

  await page.addInitScript(() => {
    try {
      localStorage.setItem("rl-walkthrough-seen", "1");
    } catch {}
  });
  await page.goto(`/teams/${team.id}/games/${game.id}/live`);
  const tile = page.getByTestId(`league-player-tile-${hooker.id}`).first();
  await expect(tile.getByLabel("Position HK")).toBeVisible({ timeout: 15_000 });
});

test("a season keep-on role shows on the lineup in every sport", async ({ page }) => {
  // Stagehand rounds 1 and 2: a coach set the keep-on role (now "Plays
  // every minute") and nothing on the lineup showed it. One shared
  // marker, all three sports.
  const admin = createAdminClient();
  const ownerId = await superAdminId(admin);
  const MARK = "Plays every minute";
  await page.addInitScript(() => {
    try {
      for (const k of ["gm-walkthrough-seen", "nb-walkthrough-seen", "rl-walkthrough-seen"]) localStorage.setItem(k, "1");
    } catch {}
  });
  const sports = [
    { sport: "afl" as const, teamAge: "U12", playerAge: "U12", count: 15, strategy: "preferred-lines" },
    { sport: "netball" as const, teamAge: "go", playerAge: "U10", count: 9, strategy: null },
    { sport: "rugby_league" as const, teamAge: "U10", playerAge: "U10", count: 13, strategy: "named-positions" },
  ];
  for (const s of sports) {
    const team = await makeTeam(admin, { ownerId, ageGroup: s.teamAge, sport: s.sport });
    const players = await makePlayers(admin, { teamId: team.id, ownerId, count: s.count, ageGroup: s.playerAge });
    const game = await makeGame(admin, { teamId: team.id, ownerId });
    if (s.sport === "rugby_league") await admin.from("games").update({ on_field_size: 11 }).eq("id", game.id);
    await admin.from("game_availability").insert(
      players.map((p) => ({ game_id: game.id, player_id: p.id, status: "available" as const, updated_by: ownerId })),
    );
    if (s.strategy) await admin.from("team_playbooks").insert({ team_id: team.id, strategy: s.strategy });
    const kept = players[2];
    await admin.from("player_position_prefs").insert({ team_id: team.id, player_id: kept.id, kind: "keep_on" });

    await page.goto(`/teams/${team.id}/games/${game.id}/live`);
    const marks = page.getByLabel(MARK);
    await expect(marks, s.sport).toHaveCount(1, { timeout: 15_000 });
    await expect(page.getByRole("button").filter({ has: page.getByLabel(MARK) }), s.sport).toContainText(
      kept.full_name.split(" ")[0],
    );
  }
});

test("chips are retired: no chip card or picker, carried-over rules are labelled", async ({ page }) => {
  const admin = createAdminClient();
  const ownerId = await superAdminId(admin);
  const team = await makeTeam(admin, { ownerId, ageGroup: "U12", sport: "afl" });
  const [a, b] = await makePlayers(admin, { teamId: team.id, ownerId, count: 3 });
  // What migration 0056 writes for a team that had a "group" chip.
  await admin.from("team_playbooks").insert({
    team_id: team.id,
    rules: [{ id: "chip-a", kind: "keep-together", params: { playerIds: [a.id, b.id] }, strength: "prefer", enabled: true, source: "chips" }],
  });

  await page.goto(`/teams/${team.id}/settings`);
  await expect(page.getByTestId("rule-keep-together")).toContainText("Carried over from your player chips", { timeout: 15_000 });
  await expect(page.getByText(/^Player chips/)).toHaveCount(0);

  await page.goto(`/teams/${team.id}/squad`);
  await expect(page.getByRole("button", { name: `Role for ${a.full_name}` })).toBeVisible({ timeout: 15_000 });
  await page.getByRole("button", { name: "Edit" }).first().click();
  await expect(page.getByRole("radiogroup", { name: /chip/i })).toHaveCount(0);
});

test("dialogs are named and close on Escape (one Modal primitive)", async ({ page }) => {
  const admin = createAdminClient();
  const ownerId = await superAdminId(admin);
  const team = await makeTeam(admin, { ownerId, ageGroup: "U12", sport: "afl" });
  const [player] = await makePlayers(admin, { teamId: team.id, ownerId, count: 2 });
  await admin.from("team_playbooks").insert({ team_id: team.id, strategy: "preferred-lines" });

  await page.goto(`/teams/${team.id}/squad`);
  await waitForHydration(page);
  await page.getByRole("button", { name: `Role for ${player.full_name}` }).click();
  const sheet = page.getByRole("dialog", { name: `Role for ${player.full_name}` });
  await expect(sheet).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(sheet).toHaveCount(0);
});

test("a coach sets a role from the game-day lineup with a long-press", async ({ page }) => {
  const admin = createAdminClient();
  const ownerId = await superAdminId(admin);
  const team = await makeTeam(admin, { ownerId, ageGroup: "U12", sport: "afl" });
  const players = await makePlayers(admin, { teamId: team.id, ownerId, count: 14 });
  const game = await makeGame(admin, { teamId: team.id, ownerId });
  await admin.from("game_availability").insert(
    players.map((p) => ({ game_id: game.id, player_id: p.id, status: "available" as const, updated_by: ownerId })),
  );
  await admin.from("team_playbooks").insert({ team_id: team.id, strategy: "preferred-lines" });

  await page.goto(`/teams/${team.id}/games/${game.id}/live`);
  const tile = page.getByTestId(`player-tile-${players[0].id}`);
  await expect(tile).toBeVisible({ timeout: 15_000 });
  // PlayerTile fires onLongPress after a 500ms hold. Before kickoff it
  // opens the same hold menu as in the game, with Player role in it
  // (usability run: "Keep on" meant two things).
  await tile.click({ delay: 600 });
  await expect(page.getByRole("button", { name: /^Switch player/ })).toBeVisible();
  // Nothing to injure or lend before the game.
  await expect(page.getByRole("button", { name: /Mark injured/ })).toHaveCount(0);
  await page.getByRole("button", { name: /Player role/ }).click();

  const sheet = page.getByRole("dialog", { name: `Role for ${players[0].full_name}` });
  await expect(sheet).toBeVisible();
  // The season role says it's all season, not this game.
  await expect(sheet.getByRole("switch", { name: "Plays every minute" })).toBeVisible();
  await sheet.getByRole("radiogroup", { name: "Main line" }).getByRole("radio", { name: "Back" }).click();
  await sheet.getByRole("button", { name: "Save role" }).click();
  await expect(sheet).toHaveCount(0);
  await expect
    .poll(async () => {
      const { data } = await admin.from("player_position_prefs").select("line").eq("player_id", players[0].id).eq("kind", "home");
      return data?.[0]?.line;
    })
    .toBe("back");
});

test("netball and league lineups: long-press opens the same role sheet", async ({ page }) => {
  const admin = createAdminClient();
  const ownerId = await superAdminId(admin);
  await page.addInitScript(() => {
    try {
      localStorage.setItem("nb-walkthrough-seen", "1");
      localStorage.setItem("rl-walkthrough-seen", "1");
      localStorage.setItem("gm-walkthrough-seen", "1");
    } catch {}
  });
  const homeOf = async (playerId: string) => {
    const { data } = await admin
      .from("player_position_prefs")
      .select("position_key, line")
      .eq("player_id", playerId)
      .eq("kind", "home");
    return data?.[0] ?? null;
  };

  // Netball, set positions: long-press a bench chip, give them a home bib.
  const nbTeam = await makeTeam(admin, { ownerId, ageGroup: "11u", sport: "netball" });
  const nbPlayers = await makePlayers(admin, { teamId: nbTeam.id, ownerId, count: 9, ageGroup: "U10" });
  const nbGame = await makeGame(admin, { teamId: nbTeam.id, ownerId });
  await admin.from("game_availability").insert(
    nbPlayers.map((p) => ({ game_id: nbGame.id, player_id: p.id, status: "available" as const, updated_by: ownerId })),
  );
  await admin.from("team_playbooks").insert({ team_id: nbTeam.id, strategy: "set-positions" });

  await page.goto(`/teams/${nbTeam.id}/games/${nbGame.id}/live`);
  const chip = page.locator('[data-testid^="bench-chip-"]').first();
  await expect(chip).toBeVisible({ timeout: 15_000 });
  // The bench says why kids sit (usability run: "no stated reason").
  await expect(page.getByText("With 9 here and 7 on court, 2 sit out each quarter and everyone takes a turn.")).toBeVisible();
  const benchId = (await chip.getAttribute("data-testid"))!.replace("bench-chip-", "");
  const benchName = nbPlayers.find((p) => p.id === benchId)!.full_name;
  // PlayerTile parity: the long-press fires after a 500ms hold.
  await chip.click({ delay: 600 });
  const nbSheet = page.getByRole("dialog", { name: `Role for ${benchName}` });
  await expect(nbSheet).toBeVisible();
  await nbSheet.getByRole("radiogroup", { name: "Main position" }).getByRole("radio", { name: /\(GK\)/ }).click();
  await nbSheet.getByRole("button", { name: "Save role" }).click();
  await expect(nbSheet).toHaveCount(0);
  await expect.poll(async () => (await homeOf(benchId))?.position_key).toBe("gk");
  // The long-press didn't also pick the chip for a swap.
  await expect(chip).not.toHaveClass(/ring-2/);

  // League: the long-press menu gains "Player role".
  const lgTeam = await makeTeam(admin, { ownerId, ageGroup: "U10", sport: "rugby_league" });
  const lgPlayers = await makePlayers(admin, { teamId: lgTeam.id, ownerId, count: 13, ageGroup: "U10" });
  const lgGame = await makeGame(admin, { teamId: lgTeam.id, ownerId });
  await admin.from("games").update({ on_field_size: 11 }).eq("id", lgGame.id);
  await admin.from("game_availability").insert(
    lgPlayers.map((p) => ({ game_id: lgGame.id, player_id: p.id, status: "available" as const, updated_by: ownerId })),
  );
  await admin.from("team_playbooks").insert({ team_id: lgTeam.id, strategy: "preferred-line" });

  await page.goto(`/teams/${lgTeam.id}/games/${lgGame.id}/live`);
  const target = lgPlayers[0];
  const tile = page.getByTestId(`league-player-tile-${target.id}`).first();
  await expect(tile).toBeVisible({ timeout: 15_000 });
  await tile.click({ delay: 600 });
  await expect(page.getByRole("button", { name: /Player role/ })).toBeVisible();
  // Nothing to injure or lend before the game (the buttons did nothing).
  await expect(page.getByRole("button", { name: /Mark injured/ })).toHaveCount(0);
  await expect(page.getByRole("button", { name: /Lend to opposition/ })).toHaveCount(0);
  await page.getByRole("button", { name: /Player role/ }).click();
  const lgSheet = page.getByRole("dialog", { name: `Role for ${target.full_name}` });
  await expect(lgSheet).toBeVisible();
  await lgSheet.getByRole("radiogroup", { name: "Main line" }).getByRole("radio", { name: "Backs" }).click();
  await lgSheet.getByRole("button", { name: "Save role" }).click();
  await expect(lgSheet).toHaveCount(0);
  await expect.poll(async () => (await homeOf(target.id))?.line).toBe("backs");
});

test("league named positions: lineups record positions, and stats count time by position", async ({ page }) => {
  const admin = createAdminClient();
  const ownerId = await superAdminId(admin);
  const team = await makeTeam(admin, { ownerId, ageGroup: "U10", sport: "rugby_league" });
  const players = await makePlayers(admin, { teamId: team.id, ownerId, count: 13, ageGroup: "U10" });
  const ids = players.map((p) => p.id);
  await admin.from("team_playbooks").insert({ team_id: team.id, strategy: "named-positions" });
  const hooker = players[3];
  await admin.from("player_position_prefs").insert({ team_id: team.id, player_id: hooker.id, position_key: "hk", kind: "home" });

  // A finished game whose lineup recorded positions.
  const past = await makeGame(admin, { teamId: team.id, ownerId });
  const t = (min: number) => new Date(Date.now() - min * 60_000).toISOString();
  const lineup = {
    forwards: ids.slice(0, 3),
    backs: ids.slice(3, 5),
    bench: [],
    slots: { [ids[0]]: "pr1", [ids[1]]: "hk", [ids[2]]: "pr2", [ids[3]]: "fb", [ids[4]]: "hb" },
  };
  await admin.from("game_events").insert([
    { game_id: past.id, type: "lineup_set", metadata: { lineup, sport: "rugby_league" }, created_by: ownerId, created_at: t(70) },
    { game_id: past.id, type: "quarter_start", metadata: { quarter: 1 }, created_by: ownerId, created_at: t(70) },
    { game_id: past.id, type: "quarter_end", metadata: { quarter: 1, elapsed_ms: 20 * 60_000 }, created_by: ownerId, created_at: t(50) },
    { game_id: past.id, type: "game_finalised", metadata: { quarter: 1 }, created_by: ownerId, created_at: t(49) },
  ]);
  await admin.from("games").update({ status: "completed", scheduled_at: t(80) }).eq("id", past.id);

  await page.goto(`/teams/${team.id}/stats`);
  const grid = page.getByRole("table", { name: "Season balance" });
  await expect(grid).toBeVisible({ timeout: 15_000 });
  // Every position its own column: the props are LPR and RPR.
  await expect(grid.getByRole("columnheader", { name: "LPR", exact: true })).toBeVisible();
  await expect(grid.getByRole("columnheader", { name: "RPR", exact: true })).toBeVisible();
  await expect(grid.getByRole("columnheader", { name: "HK", exact: true })).toBeVisible();
  // The rollup stores time by position, beside the lines.
  await expect
    .poll(async () => {
      const { data } = await admin
        .from("player_game_time")
        .select("player_id, unit_key, ms")
        .eq("game_id", past.id)
        .eq("unit_kind", "position");
      return (data ?? []).filter((r) => r.player_id === ids[2]).map((r) => [r.unit_key, r.ms]);
    })
    .toEqual([["pr2", 20 * 60_000]]);

  // Kickoff records a position for every kid on the field.
  const game = await makeGame(admin, { teamId: team.id, ownerId });
  await admin.from("games").update({ on_field_size: 11 }).eq("id", game.id);
  // Eleven here, so everyone (the hooker too) starts on the field.
  await admin.from("game_availability").insert(
    players.slice(0, 11).map((p) => ({ game_id: game.id, player_id: p.id, status: "available" as const, updated_by: ownerId })),
  );
  await page.addInitScript(() => {
    try {
      localStorage.setItem("rl-walkthrough-seen", "1");
      localStorage.setItem("gm-walkthrough-seen", "1");
    } catch {}
  });
  await page.goto(`/teams/${team.id}/games/${game.id}/live`);
  await page.getByRole("button", { name: /^start h1$/i }).click({ timeout: 15_000 });
  await page.getByRole("button", { name: /^start [qh]\d+ now$/i }).click();
  const recorded = async () => {
    const { data } = await admin.from("game_events").select("metadata").eq("game_id", game.id).eq("type", "lineup_set");
    return (data?.[0]?.metadata as { lineup?: { forwards: string[]; backs: string[]; slots?: Record<string, string> } })?.lineup ?? null;
  };
  await expect.poll(async () => (await recorded()) !== null, { timeout: 15_000 }).toBe(true);
  const kickoff = (await recorded())!;
  expect(Object.keys(kickoff.slots ?? {}).sort()).toEqual([...kickoff.forwards, ...kickoff.backs].sort());
  expect(kickoff.slots?.[hooker.id]).toBe("hk");
});

test("netball Carnival day: a kid gets the third they haven't played today", async ({ page }) => {
  const admin = createAdminClient();
  const ownerId = await superAdminId(admin);
  const team = await makeTeam(admin, { ownerId, ageGroup: "11u", sport: "netball" });
  const players = await makePlayers(admin, { teamId: team.id, ownerId, count: 7, ageGroup: "U10" });
  const ids = players.map((p) => p.id);
  await admin.from("team_playbooks").insert({
    team_id: team.id,
    strategy: "by-thirds",
    season_balance: "off",
    rules: [{ id: "carnival", kind: "every-line-per-day", params: {}, strength: "prefer", enabled: true, source: "pack:netball-carnival-day" }],
  });
  // This morning's game: everyone had a turn in attack (GS / GA) except
  // the last kid, who played C, GK and WD (centre and defence thirds).
  const morning = await makeGame(admin, { teamId: team.id, ownerId });
  const keys = ["gs", "ga", "wa", "c", "wd", "gd", "gk"];
  const lineupWith = (order: string[]) => ({ positions: Object.fromEntries(keys.map((k, i) => [k, [order[i]]])), bench: [] });
  const kid = ids[6];
  const quarters = [
    [ids[0], ids[1], ids[2], kid, ids[3], ids[4], ids[5]],
    [ids[2], ids[3], ids[4], ids[5], ids[0], ids[1], kid],
    [ids[4], ids[5], ids[0], ids[1], kid, ids[2], ids[3]],
  ];
  const t = (min: number) => new Date(Date.now() - min * 60_000).toISOString();
  await admin.from("game_events").insert([
    { game_id: morning.id, type: "lineup_set", metadata: { lineup: lineupWith(quarters[0]) }, created_by: ownerId, created_at: t(120) },
    ...quarters.flatMap((order, i) => [
      ...(i > 0
        ? [{ game_id: morning.id, type: "period_break_swap", metadata: { quarter: i + 1, lineup: lineupWith(order), sport: "netball", midQuarterSubs: [] }, created_by: ownerId, created_at: t(118 - i * 12) }]
        : []),
      { game_id: morning.id, type: "quarter_start", metadata: { quarter: i + 1 }, created_by: ownerId, created_at: t(118 - i * 12) },
      { game_id: morning.id, type: "quarter_end", metadata: { quarter: i + 1, elapsed_ms: 10 * 60_000 }, created_by: ownerId, created_at: t(108 - i * 12) },
    ]),
    { game_id: morning.id, type: "game_finalised", metadata: { quarter: 3 }, created_by: ownerId, created_at: t(80) },
  ]);
  await admin.from("games").update({ status: "completed" }).eq("id", morning.id);

  // The next game: the suggested lineup puts the kid in the attack third.
  const game = await makeGame(admin, { teamId: team.id, ownerId });
  await admin.from("game_availability").insert(
    players.map((p) => ({ game_id: game.id, player_id: p.id, status: "available" as const, updated_by: ownerId })),
  );
  await page.addInitScript(() => {
    try {
      localStorage.setItem("nb-walkthrough-seen", "1");
      localStorage.setItem("gm-walkthrough-seen", "1");
    } catch {}
  });
  await page.goto(`/teams/${team.id}/games/${game.id}/live`);
  // A court token reads the kid first, then the bib (tileName).
  const kidToken = page.getByRole("button", { name: new RegExp(`^${players[6].full_name}, `) });
  await expect(kidToken).toBeVisible({ timeout: 15_000 });
  await expect(kidToken).toHaveAccessibleName(new RegExp(`^${players[6].full_name}, (Goal Shooter|Goal Attack)(,|$)`));

  // Round 5 (carnival-day-netball): before kickoff nothing showed who
  // still needs which third today — the rule check only appeared at the
  // first break. The pre-game lineup has it now, as AFL's does.
  const check = page.getByTestId("rule-check");
  await expect(check).toBeVisible();
  await check.getByRole("button").first().click();
  await expect(check).toContainText(/every third today/);
});

test("the wizard's squad step sets players' positions too", async ({ page }) => {
  // Regression: How we play comes before the squad in the wizard, but
  // the squad step had no Role button, so a Set positions coach
  // couldn't give kids their positions while adding them.
  const admin = createAdminClient();
  const ownerId = await superAdminId(admin);
  const team = await makeTeam(admin, { ownerId, ageGroup: "U15", sport: "afl" });
  const [player] = await makePlayers(admin, { teamId: team.id, ownerId, count: 3 });
  await admin.from("team_playbooks").insert({ team_id: team.id, strategy: "set-positions" });

  await page.goto(`/teams/${team.id}/setup?step=squad`);
  await page.getByRole("button", { name: `Role for ${player.full_name}` }).click({ timeout: 15_000 });
  const sheet = page.getByRole("dialog", { name: `Role for ${player.full_name}` });
  const playsAs = sheet.getByRole("group", { name: "Plays as" });
  await playsAs.getByRole("checkbox", { name: /\(FF\)/ }).click();
  await playsAs.getByRole("checkbox", { name: /\(CHF\)/ }).click();
  // Chips are abbreviations; the sheet spells out what was picked.
  await expect(sheet.getByTestId("role-picked-plays")).toHaveText("Full forward, Centre half-forward");
  await sheet.getByRole("radiogroup", { name: "Main position" }).getByRole("radio", { name: /\(FF\)/ }).click();
  await expect(sheet.getByTestId("role-picked-main")).toHaveText("Full forward");
  await sheet.getByRole("button", { name: "Save role" }).click();
  await expect(sheet).toHaveCount(0);
  await expect(page.getByTestId(`player-role-${player.id}`)).toContainText("FF");
  await expect
    .poll(async () => {
      const { data } = await admin.from("player_position_prefs").select("position_key").eq("player_id", player.id).eq("kind", "home");
      return data?.[0]?.position_key;
    })
    .toBe("ff");
});

test("AFL: keep a kid on the field from the lineup, and it carries into the game", async ({ page }) => {
  // Usability run: the U12 coach wanted one kid on all game, long-pressed
  // on the lineup, and set a season-long role instead, with nothing on
  // the tile to show it.
  const admin = createAdminClient();
  const ownerId = await superAdminId(admin);
  const team = await makeTeam(admin, { ownerId, ageGroup: "U12", sport: "afl" });
  const players = await makePlayers(admin, { teamId: team.id, ownerId, count: 14 });
  const game = await makeGame(admin, { teamId: team.id, ownerId });
  await admin.from("game_availability").insert(
    players.map((p) => ({ game_id: game.id, player_id: p.id, status: "available" as const, updated_by: ownerId })),
  );
  await admin.from("team_playbooks").insert({ team_id: team.id, strategy: "preferred-lines" });
  await page.addInitScript(() => {
    try {
      localStorage.setItem("gm-walkthrough-seen", "1");
    } catch {}
  });

  await page.goto(`/teams/${team.id}/games/${game.id}/live`);
  const fieldTile = page.getByRole("group", { name: "Forward", exact: true }).locator('[data-testid^="player-tile-"]').first();
  await expect(fieldTile).toBeVisible({ timeout: 15_000 });
  const pid = (await fieldTile.getAttribute("data-testid"))!.replace("player-tile-", "");
  await fieldTile.click({ delay: 600 });
  await page.getByRole("button", { name: /^Keep on field/ }).click();
  await expect(page.getByTestId(`player-tile-${pid}`).getByLabel("Field locked")).toBeVisible();
  await expect
    .poll(async () => {
      const { data } = await admin.from("game_events").select("player_id, metadata").eq("game_id", game.id).eq("type", "player_lock");
      return (data ?? []).map((e) => [e.player_id, (e.metadata as { lock: unknown }).lock]);
    })
    .toEqual([[pid, { kind: "field" }]]);

  // Start the game: the hold is still there on the live field.
  await page.getByRole("button", { name: /^start q1$/i }).click();
  await page.getByRole("button", { name: /^start [qh]\d+ now$/i }).click();
  await expect(page.getByTestId(`player-tile-${pid}`).getByLabel("Field locked")).toBeVisible({ timeout: 15_000 });
});
