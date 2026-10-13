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
