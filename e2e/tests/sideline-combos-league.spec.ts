// ─── Sideline combos, end to end (rugby league) ─────────────────────
// The story behind this year's match-day bugs, through the real
// screens (U13, so no vests or kickoff prompts get in the way):
//
//   H1: lend a forward (their spot goes empty) and bring a bench kid
//       into the gap; then a back is hurt and the last bench kid comes
//       on for them. End the half.
//   The break: bring the lent kid back (onto the bench), start H2.
//
// The replayed game must agree: who's on for H2, nobody lost or doubled
// up, and H1's minutes split at the moments the coach acted.

import { test, expect } from "@playwright/test";
import { createAdminClient } from "../fixtures/supabase";
import { makeTeam, makePlayers, makeGame } from "../fixtures/factories";
import { playerMsOnField, replayLeagueGame } from "../../src/lib/sports/rugby_league/fairness";
import type { GameEvent } from "../../src/lib/types";

test("rugby league: lend a forward, fill the gap, a back is hurt and replaced, then the lent kid comes back", async ({
  page,
}) => {
  test.setTimeout(150_000);
  const admin = createAdminClient();
  const { data: superAdmin } = await admin.auth.admin.listUsers();
  const ownerId = superAdmin.users.find((u) => u.email === process.env.TEST_SUPER_ADMIN_EMAIL)!.id;
  const team = await makeTeam(admin, {
    ownerId,
    ageGroup: "U13",
    sport: "rugby_league",
    name: `RL-SIDELINE-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
  });
  const players = await makePlayers(admin, { teamId: team.id, ownerId, count: 15, ageGroup: "U10" });
  const game = await makeGame(admin, { teamId: team.id, ownerId, ageGroup: "U10" });
  // No rotation prompt mid-half (it would cover the field).
  const { error: sizeErr } = await admin.from("games").update({ on_field_size: 13, sub_interval_seconds: 900 }).eq("id", game.id);
  if (sizeErr) throw new Error(sizeErr.message);
  await admin.from("game_availability").insert(
    players.map((p) => ({ game_id: game.id, player_id: p.id, status: "available" as const, updated_by: ownerId })),
  );
  const ids = players.map((p) => p.id);
  const lineup = { forwards: ids.slice(0, 6), backs: ids.slice(6, 13), bench: ids.slice(13) };
  const lent = players[0]; // a forward
  const filler = players[13];
  const hurt = players[6]; // a back
  const replacement = players[14];

  await admin.from("game_events").insert(
    [
      { type: "lineup_set", metadata: { lineup, sport: "rugby_league" } },
      { type: "quarter_start", metadata: { quarter: 1, sport: "rugby_league" } },
    ].map((e) => ({ ...e, game_id: game.id, created_by: ownerId })),
  );
  await admin.from("games").update({ status: "in_progress" }).eq("id", game.id);

  await page.addInitScript(() => {
    try {
      localStorage.setItem("rl-walkthrough-seen", "1");
      localStorage.setItem("gm-walkthrough-seen", "1");
    } catch {}
  });
  await page.goto(`/teams/${team.id}/games/${game.id}/live`);

  const events = async () => {
    const { data } = await admin.from("game_events").select("*").eq("game_id", game.id).order("created_at", { ascending: true });
    return (data ?? []) as GameEvent[];
  };
  const landed = (what: (evs: GameEvent[]) => boolean) =>
    expect.poll(async () => what(await events()), { timeout: 15_000 }).toBe(true);
  const tile = (pid: string) => page.getByTestId(`league-player-tile-${pid}`);

  // H1: lend a forward.
  await tile(lent.id).click({ delay: 600 });
  await page.getByRole("button", { name: /lend to opposition/i }).click();
  await landed((evs) => evs.some((e) => e.type === "player_loan" && e.player_id === lent.id));

  // Bring a bench kid into the gap.
  await tile(filler.id).click();
  await page.getByRole("button", { name: /move selected player to forwards/i }).click();
  await landed((evs) => evs.filter((e) => e.type === "lineup_set").length === 2);

  // A back is hurt; the last bench kid comes on.
  await tile(hurt.id).click({ delay: 600 });
  await page.getByRole("button", { name: /mark injured/i }).click();
  await page
    .getByRole("dialog", { name: /who comes on at/i })
    .getByRole("button", { name: new RegExp(replacement.full_name, "i") })
    .click();
  await landed((evs) => evs.some((e) => e.type === "swap" && (e.metadata as { on_player_id?: string }).on_player_id === replacement.id));

  // End the half from the clock menu.
  await page.getByRole("button", { name: /^clock — h1, running$/i }).click();
  await page.getByRole("button", { name: /^end h1 now$/i }).click();
  await page.getByRole("button", { name: /^end\s*h\s*1$/i }).click();

  // The break pops the start modal; step back to the break to recall.
  await page.getByRole("button", { name: /back to lineup/i }).click({ timeout: 15_000 });
  await page.getByTestId(`league-recall-lent-${lent.id}`).click();
  await landed((evs) =>
    evs.some((e) => e.type === "player_loan" && e.player_id === lent.id && (e.metadata as { loaned?: boolean }).loaned === false),
  );
  await page.getByRole("button", { name: /^start h2$/i }).first().click();
  await page.getByRole("button", { name: /^start clock$/i }).click();
  await landed((evs) => evs.some((e) => e.type === "quarter_start" && (e.metadata as { quarter?: number }).quarter === 2));

  // ── The game as it replays ─────────────────────────────────────
  const evs = await events();
  const s = replayLeagueGame(evs);
  const field = [...s.lineup!.forwards, ...s.lineup!.backs];
  const everyone = [...field, ...s.lineup!.bench];
  expect(new Set(everyone).size).toBe(everyone.length);
  for (const p of players) expect(everyone).toContain(p.id);
  // H2: the filler and the replacement stay on; the hurt back is off;
  // the lent kid is back, on the bench.
  expect(s.lineup!.forwards).toContain(filler.id);
  expect(s.lineup!.backs).toContain(replacement.id);
  expect(field).not.toContain(hurt.id);
  expect(s.lineup!.bench).toContain(lent.id);

  // H1's minutes split at the moments the coach acted.
  const meta = (e: GameEvent | undefined) => (e?.metadata ?? {}) as { elapsed_ms: number };
  const lentAt = meta(evs.find((e) => e.type === "player_loan" && e.player_id === lent.id)).elapsed_ms;
  const fillAt = meta(evs.filter((e) => e.type === "lineup_set")[1]).elapsed_ms;
  const hurtAt = meta(evs.find((e) => e.type === "injury" && e.player_id === hurt.id)).elapsed_ms;
  const swapAt = meta(evs.find((e) => e.type === "swap")).elapsed_ms;
  const h1End = meta(evs.find((e) => e.type === "quarter_end")).elapsed_ms;
  const ms = playerMsOnField(evs, 2, 0);
  const near = (got: number | undefined, want: number) => expect(Math.abs((got ?? 0) - want)).toBeLessThanOrEqual(1);
  near(ms[lent.id], lentAt);
  near(ms[filler.id], h1End - fillAt);
  near(ms[hurt.id], hurtAt);
  near(ms[replacement.id], h1End - swapAt);
  near(ms[players[1].id], h1End);
});

// Both sides one down (a kid lent, or a short squad): 12 a side. The
// field used to draw the 11-spot layout for any size without its own,
// so one of the twelve kids on the field wasn't drawn at all: no tile
// to tap, sub or score for.
test("rugby league: a 12-a-side field draws all twelve kids", async ({ page }) => {
  const admin = createAdminClient();
  const { data: superAdmin } = await admin.auth.admin.listUsers();
  const ownerId = superAdmin.users.find((u) => u.email === process.env.TEST_SUPER_ADMIN_EMAIL)!.id;
  const team = await makeTeam(admin, {
    ownerId,
    ageGroup: "U13",
    sport: "rugby_league",
    name: `RL-12-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
  });
  const players = await makePlayers(admin, { teamId: team.id, ownerId, count: 14, ageGroup: "U10" });
  const game = await makeGame(admin, { teamId: team.id, ownerId, ageGroup: "U10" });
  const { error } = await admin.from("games").update({ on_field_size: 12, status: "in_progress" }).eq("id", game.id);
  if (error) throw new Error(error.message);
  const ids = players.map((p) => p.id);
  const lineup = { forwards: ids.slice(0, 6), backs: ids.slice(6, 12), bench: ids.slice(12) };
  await admin.from("game_events").insert(
    [
      { type: "lineup_set", metadata: { lineup, sport: "rugby_league" } },
      { type: "quarter_start", metadata: { quarter: 1, sport: "rugby_league" } },
    ].map((e) => ({ ...e, game_id: game.id, created_by: ownerId })),
  );
  await page.addInitScript(() => {
    try {
      localStorage.setItem("rl-walkthrough-seen", "1");
      localStorage.setItem("gm-walkthrough-seen", "1");
    } catch {}
  });
  await page.goto(`/teams/${team.id}/games/${game.id}/live`);

  const field = page.getByRole("region", { name: "On field" });
  await expect(field).toBeVisible({ timeout: 15_000 });
  for (const id of ids.slice(0, 12)) await expect(field.getByTestId(`league-player-tile-${id}`)).toBeVisible();
  await expect(field.locator(`[data-testid^="league-player-tile-"]`)).toHaveCount(12);
});

// Stagehand round 4: a kid selected for a swap and then lent stayed
// selected, so the next tap on a field kid swapped the lent kid on.
test("rugby league: a bench kid selected and then lent doesn't swap on with the next tap", async ({ page }) => {
  const admin = createAdminClient();
  const { data: superAdmin } = await admin.auth.admin.listUsers();
  const ownerId = superAdmin.users.find((u) => u.email === process.env.TEST_SUPER_ADMIN_EMAIL)!.id;
  const team = await makeTeam(admin, {
    ownerId,
    ageGroup: "U13",
    sport: "rugby_league",
    name: `RL-STALE-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
  });
  const players = await makePlayers(admin, { teamId: team.id, ownerId, count: 15, ageGroup: "U10" });
  const game = await makeGame(admin, { teamId: team.id, ownerId, ageGroup: "U10" });
  const { error } = await admin.from("games").update({ on_field_size: 13, sub_interval_seconds: 900, status: "in_progress" }).eq("id", game.id);
  if (error) throw new Error(error.message);
  const ids = players.map((p) => p.id);
  const lineup = { forwards: ids.slice(0, 6), backs: ids.slice(6, 13), bench: ids.slice(13) };
  await admin.from("game_events").insert(
    [
      { type: "lineup_set", metadata: { lineup, sport: "rugby_league" } },
      { type: "quarter_start", metadata: { quarter: 1, sport: "rugby_league" } },
    ].map((e) => ({ ...e, game_id: game.id, created_by: ownerId })),
  );
  await page.addInitScript(() => {
    try {
      localStorage.setItem("rl-walkthrough-seen", "1");
      localStorage.setItem("gm-walkthrough-seen", "1");
    } catch {}
  });
  await page.goto(`/teams/${team.id}/games/${game.id}/live`);

  const lent = players[13];
  const tile = (pid: string) => page.getByTestId(`league-player-tile-${pid}`);
  // Select the bench kid, then long-press them and lend them.
  await tile(lent.id).click();
  await tile(lent.id).click({ delay: 600 });
  await page.getByRole("button", { name: /lend to opposition/i }).click();
  const events = async (type: string) => {
    const { data } = await admin.from("game_events").select("id").eq("game_id", game.id).eq("type", type);
    return (data ?? []).length;
  };
  await expect.poll(() => events("player_loan"), { timeout: 15_000 }).toBe(1);

  // Tap a forward: no swap, the lent kid stays off.
  await tile(players[0].id).click();
  await page.waitForTimeout(2_000);
  expect(await events("swap")).toBe(0);
  await expect(page.getByRole("region", { name: "On field" }).getByTestId(`league-player-tile-${lent.id}`)).toHaveCount(0);
});

// Stagehand round 4 (sideline-chaos-league): the kickoff picker listed
// the whole squad: a hurt kid, a lent kid, and kids who weren't there.
// Only a kid on the field can kick off. (The rotation also ran over the
// whole squad, so once every kid on the field had kicked, the absent or
// sidelined ones left everyone else "Done".)
test("rugby league: the kickoff picker offers only kids on the field who can play", async ({ page }) => {
  const admin = createAdminClient();
  const { data: superAdmin } = await admin.auth.admin.listUsers();
  const ownerId = superAdmin.users.find((u) => u.email === process.env.TEST_SUPER_ADMIN_EMAIL)!.id;
  const team = await makeTeam(admin, {
    ownerId,
    ageGroup: "U10",
    sport: "rugby_league",
    name: `RL-KICKOFF-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
  });
  const players = await makePlayers(admin, { teamId: team.id, ownerId, count: 15, ageGroup: "U10" });
  const game = await makeGame(admin, { teamId: team.id, ownerId, ageGroup: "U10" });
  const { error } = await admin.from("games").update({ on_field_size: 11, sub_interval_seconds: 900, status: "in_progress" }).eq("id", game.id);
  if (error) throw new Error(error.message);
  const ids = players.map((p) => p.id);
  // 11 on, 3 on the bench (one lent), one squad kid not here at all.
  const lineup = { forwards: ids.slice(0, 5), backs: ids.slice(5, 11), bench: ids.slice(11, 14) };
  const [hurt, lent, benchKid, absent] = [players[0], players[11], players[12], players[14]];
  await admin.from("game_events").insert(
    [
      { type: "lineup_set", metadata: { lineup, sport: "rugby_league" } },
      { type: "quarter_start", metadata: { quarter: 1, sport: "rugby_league" } },
      { type: "injury", player_id: hurt.id, metadata: { injured: true, quarter: 1, elapsed_ms: 0, sport: "rugby_league" } },
      { type: "player_loan", player_id: lent.id, metadata: { loaned: true, quarter: 1, elapsed_ms: 0, sport: "rugby_league" } },
    ].map((e, i) => ({ ...e, game_id: game.id, created_by: ownerId, created_at: new Date(Date.now() - (10 - i) * 1000).toISOString() })),
  );
  await page.addInitScript(() => {
    try {
      localStorage.setItem("rl-walkthrough-seen", "1");
      localStorage.setItem("gm-walkthrough-seen", "1");
    } catch {}
  });
  await page.goto(`/teams/${team.id}/games/${game.id}/live`);

  const picker = page.locator("section").filter({ has: page.getByRole("heading", { name: /^kickoff$/i }) });
  await expect(picker).toBeVisible({ timeout: 15_000 });
  await expect(picker.getByRole("button", { name: new RegExp(players[1].full_name) })).toBeVisible();
  for (const p of [hurt, lent, benchKid, absent]) {
    await expect(picker.getByRole("button", { name: new RegExp(p.full_name) })).toHaveCount(0);
  }
});

// Stagehand round 4 (sideline-chaos-league): the First Receiver was hurt
// and replaced. The "Replace First Receiver: the vest wearer is no
// longer on the field" sheet also listed the Dummy Half (on the field)
// with a Replace button, which read as him being off too. It now shows
// the vest that needs a wearer, with its picker open.
test("rugby league: when the First Receiver is hurt and replaced, the prompt is about that vest only", async ({ page }) => {
  const admin = createAdminClient();
  const { data: superAdmin } = await admin.auth.admin.listUsers();
  const ownerId = superAdmin.users.find((u) => u.email === process.env.TEST_SUPER_ADMIN_EMAIL)!.id;
  const team = await makeTeam(admin, {
    ownerId,
    ageGroup: "U10",
    sport: "rugby_league",
    name: `RL-VEST-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
  });
  const players = await makePlayers(admin, { teamId: team.id, ownerId, count: 13, ageGroup: "U10" });
  const game = await makeGame(admin, { teamId: team.id, ownerId, ageGroup: "U10" });
  const { error } = await admin.from("games").update({ on_field_size: 11, sub_interval_seconds: 900, status: "in_progress" }).eq("id", game.id);
  if (error) throw new Error(error.message);
  const ids = players.map((p) => p.id);
  const lineup = { forwards: ids.slice(0, 5), backs: ids.slice(5, 11), bench: ids.slice(11) };
  const [fr, dh, replacement] = [players[0], players[1], players[11]];
  const t = (secAgo: number) => new Date(Date.now() - secAgo * 1000).toISOString();
  await admin.from("game_events").insert(
    [
      { type: "lineup_set", metadata: { lineup, sport: "rugby_league" }, created_at: t(20) },
      { type: "quarter_start", metadata: { quarter: 1, sport: "rugby_league" }, created_at: t(19) },
      { type: "vest_assigned", player_id: fr.id, metadata: { vest: "fr", period: 1, replacement: false, sport: "rugby_league" }, created_at: t(18) },
      { type: "vest_assigned", player_id: dh.id, metadata: { vest: "dh", period: 1, replacement: false, sport: "rugby_league" }, created_at: t(18) },
      { type: "kickoff_taken", player_id: players[2].id, metadata: { period: 1, sport: "rugby_league" }, created_at: t(17) },
    ].map((e) => ({ ...e, game_id: game.id, created_by: ownerId })),
  );
  await page.addInitScript(() => {
    try {
      localStorage.setItem("rl-walkthrough-seen", "1");
      localStorage.setItem("gm-walkthrough-seen", "1");
    } catch {}
  });
  await page.goto(`/teams/${team.id}/games/${game.id}/live`);

  // The FR is hurt; a bench kid comes on.
  await page.getByTestId(`league-player-tile-${fr.id}`).click({ delay: 600 });
  await page.getByRole("button", { name: /mark injured/i }).click();
  await page
    .getByRole("dialog", { name: /who comes on at/i })
    .getByRole("button", { name: new RegExp(replacement.full_name, "i") })
    .click();

  const sheet = page.getByRole("dialog", { name: /replace vest wearer/i });
  await expect(sheet).toBeVisible({ timeout: 15_000 });
  await expect(sheet.getByRole("heading", { name: /replace first receiver/i })).toBeVisible();
  // The Dummy Half (on the field) isn't listed as needing replacing...
  await expect(sheet.getByText(dh.full_name)).toHaveCount(0);
  // ...and the First Receiver picker is open: the replacement can take it.
  await sheet.getByRole("button", { name: new RegExp(replacement.full_name, "i") }).click();
  await expect
    .poll(async () => {
      const { data } = await admin
        .from("game_events")
        .select("player_id, metadata")
        .eq("game_id", game.id)
        .eq("type", "vest_assigned");
      return (data ?? []).some(
        (e) => e.player_id === replacement.id && (e.metadata as { vest?: string; replacement?: boolean }).vest === "fr",
      );
    }, { timeout: 15_000 })
    .toBe(true);
});

// Stagehand round 4 (sideline-chaos-league): an empty spot says "tap to
// bring a bench player on", but with nobody selected the tap did
// nothing. It now opens the bench picker, as the AFL break does.
test("rugby league: after a lend, tapping the empty spot brings a bench kid on there", async ({ page }) => {
  const admin = createAdminClient();
  const { data: superAdmin } = await admin.auth.admin.listUsers();
  const ownerId = superAdmin.users.find((u) => u.email === process.env.TEST_SUPER_ADMIN_EMAIL)!.id;
  const team = await makeTeam(admin, {
    ownerId,
    ageGroup: "U13",
    sport: "rugby_league",
    name: `RL-FILL-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
  });
  const players = await makePlayers(admin, { teamId: team.id, ownerId, count: 15, ageGroup: "U10" });
  const game = await makeGame(admin, { teamId: team.id, ownerId, ageGroup: "U10" });
  const { error } = await admin.from("games").update({ on_field_size: 13, sub_interval_seconds: 900, status: "in_progress" }).eq("id", game.id);
  if (error) throw new Error(error.message);
  const ids = players.map((p) => p.id);
  const lineup = { forwards: ids.slice(0, 6), backs: ids.slice(6, 13), bench: ids.slice(13) };
  await admin.from("game_events").insert(
    [
      { type: "lineup_set", metadata: { lineup, sport: "rugby_league" } },
      { type: "quarter_start", metadata: { quarter: 1, sport: "rugby_league" } },
    ].map((e) => ({ ...e, game_id: game.id, created_by: ownerId })),
  );
  await page.addInitScript(() => {
    try {
      localStorage.setItem("rl-walkthrough-seen", "1");
      localStorage.setItem("gm-walkthrough-seen", "1");
    } catch {}
  });
  await page.goto(`/teams/${team.id}/games/${game.id}/live`);

  const [lent, onKid] = [players[0], players[13]];
  await page.getByTestId(`league-player-tile-${lent.id}`).click({ delay: 600 });
  await page.getByRole("button", { name: /lend to opposition/i }).click();
  const lineupSets = async () => {
    const { data } = await admin
      .from("game_events")
      .select("metadata")
      .eq("game_id", game.id)
      .eq("type", "lineup_set")
      .order("created_at", { ascending: true });
    return (data ?? []).map((e) => (e.metadata as { lineup: { forwards: string[] } }).lineup);
  };
  await expect
    .poll(async () => {
      const { data } = await admin.from("game_events").select("id").eq("game_id", game.id).eq("type", "player_loan");
      return (data ?? []).length;
    }, { timeout: 15_000 })
    .toBe(1);

  await page.getByRole("button", { name: /empty slot — tap to bring a bench player on/i }).first().click();
  const sheet = page.getByRole("dialog", { name: /fill/i });
  await expect(sheet).toBeVisible({ timeout: 5_000 });
  await expect(sheet.getByRole("button", { name: new RegExp(lent.full_name, "i") })).toHaveCount(0);
  await sheet.getByRole("button", { name: new RegExp(onKid.full_name, "i") }).click();
  await expect.poll(async () => (await lineupSets()).at(-1)?.forwards.includes(onKid.id) ?? false, { timeout: 15_000 }).toBe(true);
});

// Round 5 (Stagehand league-u8-vests): the First Receiver was hurt and
// the "Replace vest wearer" sheet closed (a tap on the backdrop, or
// "Later"). Nothing could bring it back, so nobody wore the vest for the
// rest of the half. The sheet now says who is missing and why, and while
// the vest has no wearer a banner offers to pick one. And the injured
// kid on the bench opens her actions on a tap — she can't be "selected
// from bench" to swap on, as on AFL's bench.
async function seedFirstReceiverGame(page: import("@playwright/test").Page) {
  const admin = createAdminClient();
  const { data: superAdmin } = await admin.auth.admin.listUsers();
  const ownerId = superAdmin.users.find((u) => u.email === process.env.TEST_SUPER_ADMIN_EMAIL)!.id;
  const team = await makeTeam(admin, {
    ownerId,
    ageGroup: "U10",
    sport: "rugby_league",
    name: `RL-VEST-LATER-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
  });
  const players = await makePlayers(admin, { teamId: team.id, ownerId, count: 13, ageGroup: "U10" });
  const game = await makeGame(admin, { teamId: team.id, ownerId, ageGroup: "U10" });
  const { error } = await admin.from("games").update({ on_field_size: 11, sub_interval_seconds: 900, status: "in_progress" }).eq("id", game.id);
  if (error) throw new Error(error.message);
  const ids = players.map((p) => p.id);
  const lineup = { forwards: ids.slice(0, 5), backs: ids.slice(5, 11), bench: ids.slice(11) };
  const t = (secAgo: number) => new Date(Date.now() - secAgo * 1000).toISOString();
  await admin.from("game_events").insert(
    [
      { type: "lineup_set", metadata: { lineup, sport: "rugby_league" }, created_at: t(20) },
      { type: "quarter_start", metadata: { quarter: 1, sport: "rugby_league" }, created_at: t(19) },
      { type: "vest_assigned", player_id: ids[0], metadata: { vest: "fr", period: 1, replacement: false, sport: "rugby_league" }, created_at: t(18) },
      { type: "vest_assigned", player_id: ids[1], metadata: { vest: "dh", period: 1, replacement: false, sport: "rugby_league" }, created_at: t(18) },
      { type: "kickoff_taken", player_id: ids[2], metadata: { period: 1, sport: "rugby_league" }, created_at: t(17) },
    ].map((e) => ({ ...e, game_id: game.id, created_by: ownerId })),
  );
  await page.addInitScript(() => {
    try {
      localStorage.setItem("rl-walkthrough-seen", "1");
      localStorage.setItem("gm-walkthrough-seen", "1");
    } catch {}
  });
  await page.goto(`/teams/${team.id}/games/${game.id}/live`);
  // The FR is hurt; a bench kid comes on.
  const [fr, replacement] = [players[0], players[11]];
  await page.getByTestId(`league-player-tile-${fr.id}`).click({ delay: 600 });
  await page.getByRole("button", { name: /mark injured/i }).click();
  await page
    .getByRole("dialog", { name: /who comes on at/i })
    .getByRole("button", { name: new RegExp(replacement.full_name, "i") })
    .click();
  return { admin, game, fr, replacement };
}

test("rugby league: a closed vest prompt can be reopened, and says who is missing", async ({ page }) => {
  const { admin, game, fr, replacement } = await seedFirstReceiverGame(page);
  const sheet = page.getByRole("dialog", { name: /replace vest wearer/i });
  await expect(sheet).toBeVisible({ timeout: 15_000 });
  await expect(sheet.getByText(`${fr.full_name} is injured`)).toBeVisible();

  await sheet.getByRole("button", { name: /^later$/i }).click();
  await expect(sheet).toBeHidden();
  const banner = page.getByRole("status").filter({ hasText: /first receiver/i });
  await expect(banner).toBeVisible();
  await banner.getByRole("button", { name: /^pick$/i }).click();

  await expect(sheet).toBeVisible();
  await sheet.getByRole("button", { name: new RegExp(replacement.full_name, "i") }).click();
  await expect
    .poll(async () => {
      const { data } = await admin
        .from("game_events")
        .select("player_id, metadata")
        .eq("game_id", game.id)
        .eq("type", "vest_assigned");
      return (data ?? []).some(
        (e) => e.player_id === replacement.id && (e.metadata as { vest?: string }).vest === "fr",
      );
    }, { timeout: 15_000 })
    .toBe(true);
  await expect(banner).toHaveCount(0);
});

test("rugby league: tapping an injured kid on the bench opens her actions, not a swap", async ({ page }) => {
  const { fr } = await seedFirstReceiverGame(page);
  const sheet = page.getByRole("dialog", { name: /replace vest wearer/i });
  await expect(sheet).toBeVisible({ timeout: 15_000 });
  await sheet.getByRole("button", { name: /^later$/i }).click();

  await page.getByTestId(`league-player-tile-${fr.id}`).click();
  await expect(page.getByText(/selected from bench/i)).toHaveCount(0);
  await expect(page.getByRole("button", { name: /back on/i })).toBeVisible();
});

// Round 5 (gameday-league-u11): kickoff plans every half's vests. H2's
// Dummy Half was subbed off in H1, but the break's vest card showed him
// with only a Replace button, and H2 kicked off with the vest on the
// bench. At the break a planned wearer who isn't on the field now shows
// as such, with the picker open — and picking someone else there gives
// the vest for H2 without costing the benched kid his turn.
test("rugby league: at the break, next half's vest wearer on the bench is flagged and re-picked", async ({ page }) => {
  const admin = createAdminClient();
  const { data: superAdmin } = await admin.auth.admin.listUsers();
  const ownerId = superAdmin.users.find((u) => u.email === process.env.TEST_SUPER_ADMIN_EMAIL)!.id;
  const team = await makeTeam(admin, {
    ownerId,
    ageGroup: "U10",
    sport: "rugby_league",
    name: `RL-VEST-BREAK-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
  });
  const players = await makePlayers(admin, { teamId: team.id, ownerId, count: 13, ageGroup: "U10" });
  const game = await makeGame(admin, { teamId: team.id, ownerId, ageGroup: "U10" });
  const { error } = await admin.from("games").update({ on_field_size: 11, sub_interval_seconds: 900, status: "in_progress" }).eq("id", game.id);
  if (error) throw new Error(error.message);
  const ids = players.map((p) => p.id);
  const lineup = { forwards: ids.slice(0, 5), backs: ids.slice(5, 11), bench: ids.slice(11) };
  const [plannedDh, cameOn, pick] = [players[3], players[11], players[6]];
  const t = (secAgo: number) => new Date(Date.now() - secAgo * 1000).toISOString();
  const vest = (pid: string, v: "fr" | "dh", period: number) => ({
    type: "vest_assigned",
    player_id: pid,
    metadata: { vest: v, period, replacement: false, sport: "rugby_league" },
    created_at: t(60),
  });
  await admin.from("game_events").insert(
    [
      { type: "lineup_set", metadata: { lineup, sport: "rugby_league" }, created_at: t(61) },
      vest(ids[0], "fr", 1),
      vest(ids[1], "dh", 1),
      vest(ids[2], "fr", 2),
      vest(plannedDh.id, "dh", 2),
      { type: "quarter_start", metadata: { quarter: 1, sport: "rugby_league" }, created_at: t(59) },
      { type: "swap", metadata: { quarter: 1, elapsed_ms: 300_000, off_player_id: plannedDh.id, on_player_id: cameOn.id, sport: "rugby_league" }, created_at: t(40) },
      { type: "quarter_end", metadata: { quarter: 1, elapsed_ms: 1_200_000, sport: "rugby_league" }, created_at: t(20) },
    ].map((e) => ({ ...e, game_id: game.id, created_by: ownerId })),
  );
  await page.addInitScript(() => {
    try {
      localStorage.setItem("rl-walkthrough-seen", "1");
      localStorage.setItem("gm-walkthrough-seen", "1");
    } catch {}
  });
  await page.goto(`/teams/${team.id}/games/${game.id}/live`);

  await expect(page.getByText(new RegExp(`${plannedDh.full_name} isn.t on the field`))).toBeVisible({ timeout: 15_000 });
  // League auto-opens "Start H2" on entering the break, over the vest
  // card. Dismiss it first; racing it only passed where the tap landed
  // before the dialog (Chromium), not on WebKit.
  const backToLineup = page.getByRole("button", { name: /back to lineup/i });
  await expect(backToLineup).toBeVisible({ timeout: 15_000 });
  await backToLineup.click();
  await expect(backToLineup).toBeHidden({ timeout: 5_000 });
  await page
    .getByRole("region", { name: "Vest assignment" })
    .getByRole("button", { name: new RegExp(pick.full_name) })
    .click();
  await expect
    .poll(async () => {
      const { data } = await admin
        .from("game_events")
        .select("player_id, metadata")
        .eq("game_id", game.id)
        .eq("type", "vest_assigned");
      return (data ?? []).some(
        (e) => e.player_id === pick.id && (e.metadata as { vest?: string; period?: number }).vest === "dh" && (e.metadata as { period?: number }).period === 2,
      );
    }, { timeout: 15_000 })
    .toBe(true);
});
