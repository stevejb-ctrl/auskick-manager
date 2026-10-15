// ─── Sideline combos, end to end (AFL) ──────────────────────────────
// Steve's season: "we lent a kid, then a kid got injured, and we needed
// to swap some kids in the break" is where the weird stuff happened.
// This plays that story through the real screens on a fast clock:
//
//   Q1: lend a back to the opposition (their spot goes empty), then a
//       mid is hurt and a bench kid comes on for them.
//   Hooter → the break: bring the lent kid back into the empty back
//       spot, then start Q2.
//
// The replayed game must then agree with what happened: the right kids
// on the field for Q2, nobody lost or doubled up, and Q1's minutes
// split at the moments the coach acted.

import { test, expect } from "@playwright/test";
import { createAdminClient } from "../fixtures/supabase";
import { makeTeam, makePlayers, makeGame } from "../fixtures/factories";
import { ALL_ZONES, replayGame } from "../../src/lib/fairness";
import type { GameEvent } from "../../src/lib/types";

test("AFL: lend a kid, a kid gets hurt and replaced, then the lent kid comes back on at the break", async ({
  page,
}) => {
  test.setTimeout(150_000);
  const admin = createAdminClient();
  const { data: superAdmin } = await admin.auth.admin.listUsers();
  const ownerId = superAdmin.users.find((u) => u.email === process.env.TEST_SUPER_ADMIN_EMAIL)!.id;

  const team = await makeTeam(admin, { ownerId, ageGroup: "U10", sport: "afl" });
  const players = await makePlayers(admin, { teamId: team.id, ownerId, count: 15 });
  const game = await makeGame(admin, { teamId: team.id, ownerId });
  // 20× clock: the 12-minute quarter runs in ~36 s. No sub-due prompt
  // mid-quarter (it would cover the field).
  await admin.from("games").update({ clock_multiplier: 20, sub_interval_seconds: 900 }).eq("id", game.id);
  await admin.from("game_availability").insert(
    players.map((p) => ({ game_id: game.id, player_id: p.id, status: "available" as const, updated_by: ownerId })),
  );

  const onField = players.slice(0, game.on_field_size);
  const bench = players.slice(game.on_field_size);
  const third = Math.floor(game.on_field_size / 3);
  const lineup = {
    back: onField.slice(0, third).map((p) => p.id),
    hback: [],
    mid: onField.slice(third, third * 2).map((p) => p.id),
    hfwd: [],
    fwd: onField.slice(third * 2).map((p) => p.id),
    bench: bench.map((p) => p.id),
  };
  const lent = onField[0]; // a back
  const hurt = onField[third]; // a mid
  const replacement = bench[0];

  // Two inserts, as startGame writes them: rows from one insert share
  // created_at, and the replay below reads events in created_at order,
  // so on a tie it could start Q1 before the lineup and credit the lent
  // kid nothing.
  await admin.from("game_events").insert({ game_id: game.id, type: "lineup_set", metadata: { lineup }, created_by: ownerId });
  await admin.from("game_events").insert({ game_id: game.id, type: "quarter_start", metadata: { quarter: 1 }, created_by: ownerId });
  await admin.from("games").update({ status: "in_progress" }).eq("id", game.id);

  await page.addInitScript(() => {
    try {
      localStorage.setItem("gm-walkthrough-seen", "1");
    } catch {}
  });
  await page.goto(`/teams/${team.id}/games/${game.id}/live`);

  const events = async () => {
    const { data } = await admin
      .from("game_events")
      .select("*")
      .eq("game_id", game.id)
      .order("created_at", { ascending: true });
    return (data ?? []) as GameEvent[];
  };
  const landed = (what: (evs: GameEvent[]) => boolean) =>
    expect.poll(async () => what(await events()), { timeout: 15_000 }).toBe(true);

  // Q1: lend the back (long-press opens the player sheet).
  await page.getByTestId(`player-tile-${lent.id}`).click({ delay: 600 });
  await page.getByRole("button", { name: /lend to opposition/i }).click();
  await landed((evs) => evs.some((e) => e.type === "player_loan" && e.player_id === lent.id));

  // Then the mid is hurt; a bench kid comes on.
  await page.getByTestId(`player-tile-${hurt.id}`).click({ delay: 600 });
  await page.getByRole("button", { name: /mark injured/i }).click();
  const replaceDialog = page.getByRole("dialog", { name: /who comes on at/i });
  await replaceDialog.getByRole("button", { name: new RegExp(replacement.full_name, "i") }).click();
  await landed((evs) => evs.some((e) => e.type === "swap" && (e.metadata as { on_player_id?: string }).on_player_id === replacement.id));

  // The hooter.
  await page.getByRole("button", { name: /select team for q2/i }).click({ timeout: 60_000 });
  await expect(page.getByRole("button", { name: /^start q2$/i })).toBeVisible({ timeout: 15_000 });

  // The break: keep the field, bring the lent kid back into the empty
  // back spot.
  const adjustments = page.getByRole("button", { name: /game settings/i });
  if ((await adjustments.getAttribute("aria-expanded")) !== "true") await adjustments.click();
  await page.getByRole("radio", { name: /keep last quarter/i }).click();
  await page.getByTestId(`qb-recall-lent-${lent.id}`).click();
  await landed((evs) =>
    evs.some((e) => e.type === "player_loan" && e.player_id === lent.id && (e.metadata as { loaned?: boolean }).loaned === false),
  );
  await page.getByRole("button", { name: "Empty BCK spot" }).first().click();
  const fillSheet = page.getByRole("dialog", { name: /fill|back|bck/i });
  await expect(fillSheet).toBeVisible({ timeout: 5_000 });
  await fillSheet.getByRole("button", { name: new RegExp(lent.full_name, "i") }).click();

  await page.getByRole("button", { name: /^start q2$/i }).click();
  await page.getByRole("button", { name: /^start clock$/i }).click();
  await landed((evs) => evs.some((e) => e.type === "quarter_start" && (e.metadata as { quarter?: number }).quarter === 2));

  // ── The game as it replays ─────────────────────────────────────
  const evs = await events();
  const s = replayGame(evs);
  const field = ALL_ZONES.flatMap((z) => s.lineup![z]);
  const everyone = [...field, ...s.lineup!.bench];
  // Nobody doubled up or lost.
  expect(new Set(everyone).size).toBe(everyone.length);
  for (const p of players) expect(everyone).toContain(p.id);
  // Q2's field: the lent kid is back in the backs, the hurt kid is off,
  // the replacement stayed on.
  expect(s.lineup!.back).toContain(lent.id);
  expect(field).not.toContain(hurt.id);
  expect(s.lineup!.mid).toContain(replacement.id);
  expect(s.injuredIds).toContain(hurt.id);
  expect(s.loanedIds).not.toContain(lent.id);

  // Q1's minutes split at the moments the coach acted.
  const at = (type: string, pid: string) =>
    (evs.find((e) => e.type === type && (e.player_id === pid || (e.metadata as { on_player_id?: string }).on_player_id === pid))!
      .metadata as { elapsed_ms: number }).elapsed_ms;
  const q1End = (evs.find((e) => e.type === "quarter_end")!.metadata as { elapsed_ms: number }).elapsed_ms;
  const total = (pid: string) => ALL_ZONES.reduce((a, z) => a + (s.basePlayedZoneMs[pid]?.[z] ?? 0), 0);
  const near = (got: number, want: number) => expect(Math.abs(got - want)).toBeLessThanOrEqual(1);
  near(total(lent.id), at("player_loan", lent.id));
  near(total(hurt.id), at("injury", hurt.id));
  near(total(replacement.id), q1End - at("swap", replacement.id));
  near(total(onField[1].id), q1End);
});

// Stagehand round 4: a kid selected for a swap and then lent stayed
// selected, so the next tap offered to sub the lent kid on.
test("AFL: a bench kid selected and then lent isn't offered as a sub with the next tap", async ({ page }) => {
  const admin = createAdminClient();
  const { data: superAdmin } = await admin.auth.admin.listUsers();
  const ownerId = superAdmin.users.find((u) => u.email === process.env.TEST_SUPER_ADMIN_EMAIL)!.id;
  const team = await makeTeam(admin, { ownerId, ageGroup: "U10", sport: "afl" });
  const players = await makePlayers(admin, { teamId: team.id, ownerId, count: 15 });
  const game = await makeGame(admin, { teamId: team.id, ownerId });
  await admin.from("games").update({ sub_interval_seconds: 900 }).eq("id", game.id);
  const onField = players.slice(0, game.on_field_size);
  const bench = players.slice(game.on_field_size);
  const third = Math.floor(game.on_field_size / 3);
  const lineup = {
    back: onField.slice(0, third).map((p) => p.id),
    hback: [],
    mid: onField.slice(third, third * 2).map((p) => p.id),
    hfwd: [],
    fwd: onField.slice(third * 2).map((p) => p.id),
    bench: bench.map((p) => p.id),
  };
  await admin.from("game_events").insert([
    { game_id: game.id, type: "lineup_set", metadata: { lineup }, created_by: ownerId },
    { game_id: game.id, type: "quarter_start", metadata: { quarter: 1 }, created_by: ownerId },
  ]);
  await admin.from("games").update({ status: "in_progress" }).eq("id", game.id);
  await page.addInitScript(() => {
    try {
      localStorage.setItem("gm-walkthrough-seen", "1");
    } catch {}
  });
  await page.goto(`/teams/${team.id}/games/${game.id}/live`);

  const lent = bench[0];
  // Select the bench kid, then long-press them and lend them.
  await page.getByTestId(`player-tile-${lent.id}`).click();
  await page.getByTestId(`player-tile-${lent.id}`).click({ delay: 600 });
  await page.getByRole("button", { name: /lend to opposition/i }).click();
  await expect
    .poll(async () => {
      const { data } = await admin.from("game_events").select("id").eq("game_id", game.id).eq("type", "player_loan");
      return (data ?? []).length;
    }, { timeout: 15_000 })
    .toBe(1);

  // Tapping a field kid starts a new selection; it doesn't offer the lent kid.
  await page.getByTestId(`player-tile-${onField[0].id}`).click();
  await page.waitForTimeout(500);
  await expect(page.getByRole("dialog", { name: new RegExp(`manually sub ${lent.full_name}`, "i") })).toHaveCount(0);
});

// Stagehand round 4 (sideline-chaos-afl): lending a kid mid-quarter
// leaves their spot empty, and tapping the empty spot did nothing (at
// the break the same tap opens the bench picker). It now does here too.
test("AFL: after a lend, tapping the empty spot brings a bench kid on there", async ({ page }) => {
  const admin = createAdminClient();
  const { data: superAdmin } = await admin.auth.admin.listUsers();
  const ownerId = superAdmin.users.find((u) => u.email === process.env.TEST_SUPER_ADMIN_EMAIL)!.id;
  const team = await makeTeam(admin, { ownerId, ageGroup: "U10", sport: "afl" });
  const players = await makePlayers(admin, { teamId: team.id, ownerId, count: 15 });
  const game = await makeGame(admin, { teamId: team.id, ownerId });
  await admin.from("games").update({ sub_interval_seconds: 900 }).eq("id", game.id);
  const onField = players.slice(0, game.on_field_size);
  const bench = players.slice(game.on_field_size);
  const third = Math.floor(game.on_field_size / 3);
  const lineup = {
    back: onField.slice(0, third).map((p) => p.id),
    hback: [],
    mid: onField.slice(third, third * 2).map((p) => p.id),
    hfwd: [],
    fwd: onField.slice(third * 2).map((p) => p.id),
    bench: bench.map((p) => p.id),
  };
  await admin.from("game_events").insert([
    { game_id: game.id, type: "lineup_set", metadata: { lineup }, created_by: ownerId },
    { game_id: game.id, type: "quarter_start", metadata: { quarter: 1 }, created_by: ownerId },
  ]);
  await admin.from("games").update({ status: "in_progress" }).eq("id", game.id);
  await page.addInitScript(() => {
    try {
      localStorage.setItem("gm-walkthrough-seen", "1");
    } catch {}
  });
  await page.goto(`/teams/${team.id}/games/${game.id}/live`);

  const lent = onField[third * 2]; // a forward
  await page.getByTestId(`player-tile-${lent.id}`).click({ delay: 600 });
  await page.getByRole("button", { name: /lend to opposition/i }).click();
  await expect
    .poll(async () => {
      const { data } = await admin.from("game_events").select("id").eq("game_id", game.id).eq("type", "player_loan");
      return (data ?? []).length;
    }, { timeout: 15_000 })
    .toBe(1);

  await page.getByRole("button", { name: "Empty FWD spot" }).first().click();
  const sheet = page.getByRole("dialog", { name: /fill/i });
  await expect(sheet).toBeVisible({ timeout: 5_000 });
  await expect(sheet.getByRole("button", { name: new RegExp(lent.full_name, "i") })).toHaveCount(0);
  await sheet.getByRole("button", { name: new RegExp(bench[0].full_name, "i") }).click();
  await expect
    .poll(async () => {
      const { data } = await admin.from("game_events").select("metadata").eq("game_id", game.id).eq("type", "swap");
      return (data ?? []).some((e) => {
        const m = e.metadata as { on_player_id?: string; zone?: string };
        return m.on_player_id === bench[0].id && m.zone === "fwd";
      });
    }, { timeout: 15_000 })
    .toBe(true);
});
