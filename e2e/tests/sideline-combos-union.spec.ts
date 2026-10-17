// ─── Rugby union: the sideline, the break, positions, a phone ───────
// Rugby union plan, phases 3 and 6. Union shares league's live screens,
// so these walk the same match-day story on union's own field:
//
//   - 15 a side: lend a forward (their spot goes empty), fill it from
//     the bench, a back is hurt and replaced, a late arrival joins the
//     bench; at the break the lent kid comes back; H2 starts. The
//     replay must agree, on union's points.
//   - Named positions follow the side size: U10 at 12 a side plays N8,
//     both wings and one centre, and no flankers; U12 at 15 plays all
//     fifteen.
//   - A union role is union's: home "2R4" (the 2nd row) is stored as
//     union's key, never league's.
//   - A 15-a-side field fits a 375 px phone without sideways scroll.

import { test, expect, type Page } from "@playwright/test";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "../fixtures/supabase";
import { makeTeam, makePlayers, makeGame } from "../fixtures/factories";
import { waitForHydration } from "../helpers/navigation";
import { replayRugbyGame, rugbyPoints } from "../../src/lib/sports/rugby_league/fairness";
import type { GameEvent } from "../../src/lib/types";

test.describe.configure({ mode: "parallel" });

async function ownerOf(admin: SupabaseClient): Promise<string> {
  const { data } = await admin.auth.admin.listUsers();
  return data.users.find((u) => u.email === process.env.TEST_SUPER_ADMIN_EMAIL)!.id;
}

async function skipWalkthroughs(page: Page) {
  await page.addInitScript(() => {
    try {
      for (const k of ["league-walkthrough-seen", "rl-walkthrough-seen", "gm-walkthrough-seen"]) localStorage.setItem(k, "1");
    } catch {}
  });
}

/** A union side mid-H1: 15 on (8 forwards, 7 backs), the rest of the available kids on the bench. */
async function unionGameInH1(admin: SupabaseClient, opts: { count: number; available: number; name: string }) {
  const ownerId = await ownerOf(admin);
  const team = await makeTeam(admin, { ownerId, sport: "rugby_union", ageGroup: "U12", name: `${opts.name} ${Date.now()}` });
  const players = await makePlayers(admin, { teamId: team.id, ownerId, count: opts.count });
  const game = await makeGame(admin, { teamId: team.id, ownerId });
  // No rotation prompt mid-half (it would cover the field): the longest
  // interval the games table takes (15 min).
  const { error } = await admin.from("games").update({ sub_interval_seconds: 900, status: "in_progress" }).eq("id", game.id);
  if (error) throw new Error(error.message);
  const available = players.slice(0, opts.available);
  await admin.from("game_availability").insert(
    available.map((p) => ({ game_id: game.id, player_id: p.id, status: "available" as const, updated_by: ownerId })),
  );
  const ids = available.map((p) => p.id);
  const lineup = { forwards: ids.slice(0, 8), backs: ids.slice(8, 15), bench: ids.slice(15) };
  await admin.from("game_events").insert(
    [
      { type: "lineup_set", metadata: { lineup, sport: "rugby_union" } },
      { type: "quarter_start", metadata: { quarter: 1, sport: "rugby_union" } },
    ].map((e) => ({ ...e, game_id: game.id, created_by: ownerId })),
  );
  return { team, game, players, lineup };
}

test("rugby union at 15 a side: lend, fill, hurt and replaced, a late arrival, the lent kid back at the break", async ({ page }) => {
  test.setTimeout(180_000);
  const admin = createAdminClient();
  // 18 kids: 17 here (15 on, 2 on the bench), one arrives late.
  const { team, game, players } = await unionGameInH1(admin, { count: 18, available: 17, name: "RU-SIDELINE" });
  const lent = players[0]; // a forward
  const filler = players[15];
  const hurt = players[8]; // a back
  const replacement = players[16];
  const late = players[17];

  await skipWalkthroughs(page);
  await page.goto(`/teams/${team.id}/games/${game.id}/live`);
  await waitForHydration(page);

  const events = async () => {
    const { data } = await admin.from("game_events").select("*").eq("game_id", game.id).order("created_at", { ascending: true });
    return (data ?? []) as GameEvent[];
  };
  const landed = (what: (evs: GameEvent[]) => boolean) =>
    expect.poll(async () => what(await events()), { timeout: 15_000 }).toBe(true);
  const tile = (pid: string) => page.getByTestId(`league-player-tile-${pid}`);

  await expect(page.getByRole("region", { name: "On field" }).locator("[data-testid^='league-player-tile-']")).toHaveCount(15, {
    timeout: 15_000,
  });

  // Lend a forward.
  await tile(lent.id).click({ delay: 600 });
  await page.getByRole("button", { name: /lend to opposition/i }).click();
  await landed((evs) => evs.some((e) => e.type === "player_loan" && e.player_id === lent.id));

  // Bring a bench kid into the gap.
  await tile(filler.id).click();
  await page.getByRole("button", { name: /move selected player to forwards/i }).click();
  await landed((evs) => evs.filter((e) => e.type === "lineup_set").length === 2);

  // A back is hurt; the other bench kid comes on.
  await tile(hurt.id).click({ delay: 600 });
  await page.getByRole("button", { name: /mark injured/i }).click();
  await page
    .getByRole("dialog", { name: /who comes on at/i })
    .getByRole("button", { name: new RegExp(replacement.full_name, "i") })
    .click();
  await landed((evs) => evs.some((e) => e.type === "swap" && (e.metadata as { on_player_id?: string }).on_player_id === replacement.id));

  // A late arrival joins the bench.
  await page.getByRole("button", { name: /add late arrival/i }).click({ timeout: 10_000 });
  await page.getByRole("button", { name: new RegExp(`^${late.full_name}$`, "i") }).click({ timeout: 5_000 });
  await landed((evs) => evs.some((e) => e.type === "player_arrived" && e.player_id === late.id));

  // End the half; at the break bring the lent kid back; start H2.
  await page.getByRole("button", { name: /^clock — h1, running$/i }).click();
  await page.getByRole("button", { name: /^end h1 now$/i }).click();
  await page.getByRole("button", { name: /^end\s*h\s*1$/i }).click();
  await page.getByRole("button", { name: /back to lineup/i }).click({ timeout: 15_000 });
  await page.getByTestId(`league-recall-lent-${lent.id}`).click();
  await landed((evs) =>
    evs.some((e) => e.type === "player_loan" && e.player_id === lent.id && (e.metadata as { loaned?: boolean }).loaned === false),
  );
  await page.getByRole("button", { name: /^start h2$/i }).first().click();
  await page.getByRole("button", { name: /^start [qh]\d+ now$/i }).click();
  await landed((evs) => evs.some((e) => e.type === "quarter_start" && (e.metadata as { quarter?: number }).quarter === 2));

  // ── The replay agrees ──────────────────────────────────────────
  const evs = await events();
  const s = replayRugbyGame(evs, rugbyPoints("rugby_union"));
  const field = [...s.lineup!.forwards, ...s.lineup!.backs];
  const everyone = [...field, ...s.lineup!.bench];
  expect(new Set(everyone).size).toBe(everyone.length);
  for (const p of players) expect(everyone).toContain(p.id);
  expect(field).toHaveLength(15);
  expect(s.lineup!.forwards).toContain(filler.id);
  expect(s.lineup!.backs).toContain(replacement.id);
  expect(field).not.toContain(hurt.id);
  expect(s.lineup!.bench).toEqual(expect.arrayContaining([lent.id, late.id]));
  // The rugby actions stamp the team's sport (the shared loan, injury
  // and arrival actions stamp none, for any sport); none says league.
  for (const e of evs) {
    const sport = (e.metadata as { sport?: string }).sport;
    if (sport !== undefined) expect(sport, e.type).toBe("rugby_union");
  }
  expect(evs.filter((e) => e.type === "swap" || e.type === "lineup_set").every((e) => (e.metadata as { sport?: string }).sport === "rugby_union")).toBe(true);
});

for (const { ageGroup, size, plays, notPlays } of [
  // 12 a side: both wings, one centre; the locks are the 2nd row (Steve, 17 Oct 2026).
  { ageGroup: "U10", size: 12, plays: ["N8", "HB9", "FE10", "2R4", "2R5", "LW11", "C12", "RW14", "FB15"], notPlays: ["BF6", "OF7", "IC12", "OC13", "LK4"] },
  { ageGroup: "U12", size: 15, plays: ["LHP1", "BF6", "OF7", "N8", "RW14", "FB15"], notPlays: [] as string[] },
]) {
  test(`union ${ageGroup} named positions at ${size} a side`, async ({ page }) => {
    const admin = createAdminClient();
    const ownerId = await ownerOf(admin);
    const team = await makeTeam(admin, { ownerId, sport: "rugby_union", ageGroup, name: `RU-POS-${ageGroup} ${Date.now()}` });
    await admin.from("team_playbooks").insert({ team_id: team.id, strategy: "named-positions" });
    const players = await makePlayers(admin, { teamId: team.id, ownerId, count: size + 2 });
    const game = await makeGame(admin, { teamId: team.id, ownerId });
    expect(game.on_field_size).toBe(size);
    await admin.from("game_availability").insert(
      players.map((p) => ({ game_id: game.id, player_id: p.id, status: "available" as const, updated_by: ownerId })),
    );

    await skipWalkthroughs(page);
    await page.goto(`/teams/${team.id}/games/${game.id}/live`);
    await waitForHydration(page);
    const field = page.getByRole("region", { name: "On field" });
    await expect(field.locator("[data-testid^='league-player-tile-']")).toHaveCount(size, { timeout: 15_000 });
    for (const label of plays) await expect(field.getByText(label, { exact: true }), label).toBeVisible();
    for (const label of notPlays) await expect(field.getByText(label, { exact: true }), label).toHaveCount(0);
  });
}

// Stagehand whole-game-union (16 Oct 2026): the hooker was hurt and the
// replacement came on as a prop while another forward moved to hooker —
// the tiles re-dealt every position from season balance. The sub takes
// the hurt kid's spot and nobody else moves.
test("union named positions: the hooker's replacement plays hooker and nobody else moves", async ({ page }) => {
  test.setTimeout(120_000);
  const admin = createAdminClient();
  const ownerId = await ownerOf(admin);
  const team = await makeTeam(admin, { ownerId, sport: "rugby_union", ageGroup: "U12", name: `RU-HOOKER ${Date.now()}` });
  await admin.from("team_playbooks").insert({ team_id: team.id, strategy: "named-positions" });
  const players = await makePlayers(admin, { teamId: team.id, ownerId, count: 17 });
  const ids = players.map((p) => p.id);
  const hooker = players[1];
  const replacement = players[15];
  const t = (secAgo: number) => new Date(Date.now() - secAgo * 1000).toISOString();

  // Last week the replacement played a half at hooker, so a fresh deal
  // (season balance) would put them anywhere but.
  const lastWeek = await makeGame(admin, { teamId: team.id, ownerId });
  await admin.from("games").update({ status: "completed" }).eq("id", lastWeek.id);
  const lastLineup = { forwards: [replacement.id, ...ids.slice(2, 9)], backs: ids.slice(9, 15).concat(ids[0]), bench: [ids[16]], slots: { [replacement.id]: "ru-2" } };
  const { error: lastErr } = await admin.from("game_events").insert(
    [
      { type: "lineup_set", metadata: { lineup: lastLineup, sport: "rugby_union" }, created_at: t(7 * 86400) },
      { type: "quarter_start", metadata: { quarter: 1, sport: "rugby_union" }, created_at: t(7 * 86400 - 1) },
      { type: "quarter_end", metadata: { quarter: 1, elapsed_ms: 1_500_000, sport: "rugby_union" }, created_at: t(7 * 86400 - 2) },
    ].map((e) => ({ ...e, game_id: lastWeek.id, created_by: ownerId })),
  );
  if (lastErr) throw new Error(lastErr.message);

  // Today: number i wears ru-(i+1); the replacement is on the bench.
  const game = await makeGame(admin, { teamId: team.id, ownerId });
  const { error } = await admin.from("games").update({ sub_interval_seconds: 900, status: "in_progress" }).eq("id", game.id);
  if (error) throw new Error(error.message);
  await admin.from("game_availability").insert(
    players.map((p) => ({ game_id: game.id, player_id: p.id, status: "available" as const, updated_by: ownerId })),
  );
  const slots = Object.fromEntries(ids.slice(0, 15).map((id, i) => [id, `ru-${i + 1}`]));
  const lineup = { forwards: ids.slice(0, 8), backs: ids.slice(8, 15), bench: ids.slice(15), slots };
  await admin.from("game_events").insert(
    [
      { type: "lineup_set", metadata: { lineup, sport: "rugby_union" }, created_at: t(20) },
      { type: "quarter_start", metadata: { quarter: 1, sport: "rugby_union" }, created_at: t(19) },
    ].map((e) => ({ ...e, game_id: game.id, created_by: ownerId })),
  );
  const labels = ["LHP1", "HK2", "THP3", "2R4", "2R5", "BF6", "OF7", "N8", "HB9", "FE10", "LW11", "IC12", "OC13", "RW14", "FB15"];

  await skipWalkthroughs(page);
  await page.goto(`/teams/${team.id}/games/${game.id}/live`);
  await waitForHydration(page);
  const tile = (pid: string) => page.getByTestId(`league-player-tile-${pid}`);
  for (let i = 0; i < 15; i++) await expect(tile(ids[i]).getByText(labels[i], { exact: true })).toBeVisible({ timeout: 15_000 });

  await tile(hooker.id).click({ delay: 600 });
  await page.getByRole("button", { name: /mark injured/i }).click();
  await page
    .getByRole("dialog", { name: /who comes on at/i })
    .getByRole("button", { name: new RegExp(replacement.full_name, "i") })
    .click();
  await expect
    .poll(async () => {
      const { data } = await admin.from("game_events").select("metadata").eq("game_id", game.id).eq("type", "swap");
      return (data ?? []).some((e) => (e.metadata as { on_player_id?: string }).on_player_id === replacement.id);
    }, { timeout: 15_000 })
    .toBe(true);

  await expect(tile(replacement.id).getByText("HK2", { exact: true })).toBeVisible({ timeout: 15_000 });
  for (let i = 0; i < 15; i++) {
    if (i === 1) continue;
    await expect(tile(ids[i]).getByText(labels[i], { exact: true }), players[i].full_name).toBeVisible();
  }
});

test("a union home position is union's own: 2R4, never league's second row", async ({ page }) => {
  const admin = createAdminClient();
  const ownerId = await ownerOf(admin);
  const team = await makeTeam(admin, { ownerId, sport: "rugby_union", ageGroup: "U12", name: `RU-ROLE ${Date.now()}` });
  await admin.from("team_playbooks").insert({ team_id: team.id, strategy: "named-positions" });
  const [kid] = await makePlayers(admin, { teamId: team.id, ownerId, count: 3 });

  await page.goto(`/teams/${team.id}/squad`);
  await waitForHydration(page);
  await page.getByRole("button", { name: `Role for ${kid.full_name}` }).click();
  const home = page.getByRole("radiogroup", { name: "Home position" });
  // Union's full side: its 2nd row is 4 and 5, its halves 9 and 10.
  await expect(home.getByRole("radio", { name: "2nd row (2R4)" })).toBeVisible();
  await expect(home.getByRole("radio", { name: "2nd row (2R5)" })).toBeVisible();
  await expect(home.getByRole("radio", { name: /Second row|\(2R\)|Lock/ })).toHaveCount(0);
  await home.getByRole("radio", { name: "2nd row (2R4)" }).click();
  await page.getByRole("button", { name: "Save role" }).click();

  await expect
    .poll(async () => {
      const { data } = await admin.from("player_position_prefs").select("kind, position_key").eq("player_id", kid.id).eq("kind", "home");
      return data;
    })
    .toEqual([{ kind: "home", position_key: "ru-4" }]);
});

test("a 15-a-side union field fits a 375 px phone", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  const admin = createAdminClient();
  const { team, game } = await unionGameInH1(admin, { count: 17, available: 17, name: "RU-375" });
  await skipWalkthroughs(page);
  await page.goto(`/teams/${team.id}/games/${game.id}/live`);
  await waitForHydration(page);

  const field = page.getByRole("region", { name: "On field" });
  const tiles = field.locator("[data-testid^='league-player-tile-']");
  await expect(tiles).toHaveCount(15, { timeout: 15_000 });

  // No sideways scroll.
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);

  // Every tile on the field, none on top of another.
  const box = (await field.boundingBox())!;
  const boxes = await tiles.evaluateAll((els) =>
    els.map((el) => {
      const r = el.getBoundingClientRect();
      return { x: r.x, y: r.y, w: r.width, h: r.height };
    }),
  );
  for (const b of boxes) {
    expect(b.x).toBeGreaterThanOrEqual(box.x - 1);
    expect(b.x + b.w).toBeLessThanOrEqual(box.x + box.width + 1);
  }
  for (let i = 0; i < boxes.length; i++) {
    for (let j = i + 1; j < boxes.length; j++) {
      const a = boxes[i];
      const b = boxes[j];
      const overlapX = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
      const overlapY = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
      expect(overlapX > 2 && overlapY > 2, `tiles ${i} and ${j} overlap`).toBe(false);
    }
  }
});
