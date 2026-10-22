// ─── Rugby union: the half-time break at 15 a side ──────────────────
// Rugby union plan, phase 6 ("the break"). Union shares league's break
// surface; this walks it on union's own field, with none of league's
// prompts (no vest card, no kickoff picker) in the way:
//
//   1. A kid who wasn't there at kickoff turns up: Add arrived player
//      lands a `player_arrived` and makes them available.
//   2. A forward has to leave: Mark a player out forces a bench pick,
//      recorded as an injury with reason "out" plus the swap.
//   3. The coach swaps a back for the last bench kid.
//   4. Start H2: the half begins with all of it, 15 on the field.
//
// Covers: LeagueLiveGame's break surface (Manage availability, the
// break swap, Start H2) for rugby_union; addLateArrival, markInjury
// (reason "out"), recordLeagueSwap.

import { test, expect } from "@playwright/test";
import { createAdminClient } from "../fixtures/supabase";
import { makeTeam, makePlayers, makeGame } from "../fixtures/factories";
import { waitForHydration } from "../helpers/navigation";
import { replayRugbyGame, rugbyPoints } from "../../src/lib/sports/rugby_league/fairness";
import type { GameEvent } from "../../src/lib/types";
import { closeGameSettings, openGameSettings, pickBreakStrategy, startFromBreak } from "../helpers/break";

test("rugby union at 15 a side: at the break a kid arrives, a forward goes out, a swap, and H2 starts with all of it", async ({
  page,
}) => {
  test.setTimeout(120_000);
  const admin = createAdminClient();
  const { data: superAdmin } = await admin.auth.admin.listUsers();
  const ownerId = superAdmin.users.find((u) => u.email === process.env.TEST_SUPER_ADMIN_EMAIL)!.id;

  const team = await makeTeam(admin, {
    ownerId,
    ageGroup: "U12",
    sport: "rugby_union",
    name: `RU-BREAK-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
  });
  // 18 kids: 15 on (8 forwards, 7 backs), 2 on the bench, 1 not here yet.
  const players = await makePlayers(admin, { teamId: team.id, ownerId, count: 18 });
  const game = await makeGame(admin, { teamId: team.id, ownerId });
  await admin.from("games").update({ on_field_size: 15 }).eq("id", game.id);

  const ids = players.map((p) => p.id);
  const lineup = { forwards: ids.slice(0, 8), backs: ids.slice(8, 15), bench: ids.slice(15, 17) };
  const arrival = players[17];
  const outPlayer = players[0]; // a forward
  const replacement = players[15];
  const swapOn = players[16];
  const swapOff = players[8]; // a back

  const t = (secAgo: number) => new Date(Date.now() - secAgo * 1000).toISOString();
  await admin.from("game_events").insert(
    [
      { type: "lineup_set", metadata: { lineup, sport: "rugby_union" }, created_at: t(1600) },
      { type: "quarter_start", metadata: { quarter: 1, sport: "rugby_union" }, created_at: t(1599) },
      { type: "quarter_end", metadata: { quarter: 1, elapsed_ms: 25 * 60_000, sport: "rugby_union" }, created_at: t(60) },
    ].map((e) => ({ ...e, game_id: game.id, created_by: ownerId })),
  );
  await admin.from("game_availability").upsert(
    players
      .filter((p) => p.id !== arrival.id)
      .map((p) => ({ game_id: game.id, player_id: p.id, status: "available", updated_by: ownerId, updated_at: new Date().toISOString() })),
    { onConflict: "game_id,player_id" },
  );
  await admin.from("games").update({ status: "in_progress" }).eq("id", game.id);

  await page.addInitScript(() => {
    try {
      for (const k of ["league-walkthrough-seen", "rl-walkthrough-seen", "gm-walkthrough-seen"]) localStorage.setItem(k, "1");
    } catch {}
  });
  await page.goto(`/teams/${team.id}/games/${game.id}/live`);
  await waitForHydration(page);

  const events = async () => {
    const { data } = await admin.from("game_events").select("*").eq("game_id", game.id).order("created_at", { ascending: true });
    return (data ?? []) as GameEvent[];
  };
  const landed = (what: (evs: GameEvent[]) => boolean) =>
    expect.poll(async () => what(await events()), { timeout: 15_000 }).toBe(true);
  const field = page.getByRole("group", { name: /^(Forwards|Backs)$/ });
  const bench = page.getByRole("group", { name: "Bench", exact: true });
  const tile = (id: string) => page.getByTestId(`player-tile-${id}`);

  // The shared break screen (no start modal on arrival any more).
  await expect(page.getByRole("button", { name: /^start 2nd half/i })).toBeVisible({ timeout: 15_000 });
  await pickBreakStrategy(page, "Repeat");
  await expect(field.locator("[data-testid^='player-tile-']")).toHaveCount(15);
  // Union wears no vests.
  await expect(page.getByText(/First Receiver|Dummy Half/)).toHaveCount(0);

  // ─── 1. A kid arrives ───────────────────────────────────────────
  await openGameSettings(page);
  await page.getByRole("button", { name: /add arrived player/i }).click();
  const addArrived = page.getByRole("dialog", { name: /add arrived/i });
  await expect(addArrived).toBeVisible({ timeout: 5_000 });
  await addArrived.getByRole("button", { name: new RegExp(arrival.full_name, "i") }).click();
  await landed((evs) => evs.some((e) => e.type === "player_arrived" && e.player_id === arrival.id));
  await expect
    .poll(async () => {
      const { data } = await admin
        .from("game_availability")
        .select("status")
        .eq("game_id", game.id)
        .eq("player_id", arrival.id)
        .maybeSingle();
      return data?.status ?? null;
    })
    .toBe("available");

  // ─── 2. A forward goes out; a bench kid comes on ────────────────
  await page.getByRole("button", { name: /mark a player out/i }).click();
  const markOut = page.getByRole("dialog", { name: /mark out/i });
  await expect(markOut).toBeVisible({ timeout: 5_000 });
  await markOut.getByRole("button", { name: new RegExp(outPlayer.full_name, "i") }).click();
  const whoComesOn = page.getByRole("dialog", { name: /who comes on at/i });
  await expect(whoComesOn).toBeVisible({ timeout: 5_000 });
  await whoComesOn.getByRole("button", { name: new RegExp(replacement.full_name, "i") }).click();
  // The out is recorded now; the replacement takes the spot in the staged
  // lineup, committed with it at Start.
  await landed((evs) =>
    evs.some(
      (e) =>
        e.type === "injury" &&
        e.player_id === outPlayer.id &&
        (e.metadata as { reason?: string }).reason === "out",
    ),
  );
  await expect(field.getByTestId(`player-tile-${replacement.id}`)).toBeVisible({ timeout: 10_000 });

  // ─── 3. A swap at the break ─────────────────────────────────────
  await closeGameSettings(page);
  await tile(swapOn.id).click();
  await tile(swapOff.id).click();
  await expect(field.getByTestId(`player-tile-${swapOn.id}`)).toBeVisible({ timeout: 10_000 });
  await expect(bench.getByTestId(`player-tile-${swapOff.id}`)).toBeVisible();

  // ─── 4. Start H2 ────────────────────────────────────────────────
  await startFromBreak(page, /^start 2nd half/i);
  await landed((evs) => evs.some((e) => e.type === "quarter_start" && (e.metadata as { quarter?: number }).quarter === 2));

  const evs = await events();
  const h2 = replayRugbyGame(evs, rugbyPoints("rugby_union")).lineup!;
  const onField = [...h2.forwards, ...h2.backs];
  const everyone = [...onField, ...h2.bench];
  expect(new Set(everyone).size).toBe(everyone.length);
  expect(h2.forwards).toHaveLength(8);
  expect(h2.backs).toHaveLength(7);
  expect(h2.forwards).toContain(replacement.id);
  expect(h2.backs).toContain(swapOn.id);
  expect(h2.bench).toContain(swapOff.id);
  expect(h2.bench).toContain(arrival.id);
  expect(onField).not.toContain(outPlayer.id);
  // The rugby events this break wrote are union's.
  for (const e of evs.filter((e) => ["swap", "lineup_set", "quarter_start"].includes(e.type))) {
    expect((e.metadata as { sport?: string }).sport, e.type).toBe("rugby_union");
  }
});
