// ─── B2 / AVAIL-02 regression: manage availability at the break (rugby league) ───
// At a period break a league coach must be able to:
//   1. ADD a newly-arrived player (NOT available pre-game) into the
//      game — lands a `player_arrived` event + flips game_availability
//      to 'available' (canonical addLateArrival writer).
//   2. MARK a present on-field player OUT — forces a replacement pick
//      (InjuryReplacementModal); records an injury event with
//      metadata.reason === "out" (distinct from a plain injury) AND a
//      `swap` event placing the bench player on field (recordLeagueSwap).
//   3. MARK a player INJURED — the existing affordance still works
//      (regression guard).
//
// Pre-fix this FAILS: the league isAtQbreak surface has no "Manage
// availability" entry — add-arrived and mark-out do not exist at the
// break (the LiveAdminUtilityRow late-arrival affordance is separate;
// this spec drives the break-surface Manage-availability entry).
//
// Covers:
//   - src/components/league/LeagueLiveGame.tsx (the new break entry on isAtQbreak)
//   - addLateArrival / markInjury(reason:"out") + recordLeagueSwap

import { test, expect, type Page } from "@playwright/test";
import { createAdminClient } from "../fixtures/supabase";
import { makeTeam, makePlayers, makeGame } from "../fixtures/factories";
import { replayLeagueGame } from "../../src/lib/sports/rugby_league/fairness";
import type { GameEvent } from "../../src/lib/types";

test.describe.configure({ mode: "parallel" });

async function suppressWalkthrough(
  page: import("@playwright/test").Page,
): Promise<void> {
  await page.addInitScript(() => {
    try {
      localStorage.setItem("gm-walkthrough-seen", "1");
    } catch {}
  });
}

/**
 * The coach's plan for the game, where the live store keeps it on the
 * device. Seeded once per tab, so a reload finds what the page saved
 * there since, not the plan again.
 */
async function seedPlan(page: Page, gameId: string, plannedRotation: object): Promise<void> {
  await page.addInitScript(
    ([id, pin]) => {
      try {
        localStorage.setItem("gm-walkthrough-seen", "1");
        if (sessionStorage.getItem("plan-seeded")) return;
        sessionStorage.setItem("plan-seeded", "1");
        localStorage.setItem(
          "siren-live-game-v1",
          JSON.stringify({
            state: {
              activeGameId: id,
              lockedIds: [],
              zoneLockedPlayers: {},
              swapCount: 0,
              lastStintMs: {},
              lastStintZone: {},
              plannedRotation: pin,
            },
            version: 1,
          }),
        );
      } catch {}
    },
    [gameId, plannedRotation] as const,
  );
}

test("rugby league: at the break a coach can add an arrived player, mark a player out (forced replacement), and mark a player injured", async ({
  page,
}) => {
  const admin = createAdminClient();
  const { data: superAdmin } = await admin.auth.admin.listUsers();
  const ownerId = superAdmin.users.find(
    (u) => u.email === process.env.TEST_SUPER_ADMIN_EMAIL,
  )!.id;

  const team = await makeTeam(admin, {
    ownerId,
    ageGroup: "U10",
    sport: "rugby_league",
    name: `RL-AVAIL-BRK-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
  });
  // 13 players = 11 on field (U10 RL) + 2 bench. We keep one of those
  // off-field players as the late arrival.
  const players = await makePlayers(admin, {
    teamId: team.id,
    ownerId,
    count: 13,
    ageGroup: "U10",
  });
  const game = await makeGame(admin, {
    teamId: team.id,
    ownerId,
  });
  const onFieldSize = 11;
  await admin
    .from("games")
    .update({ on_field_size: onFieldSize })
    .eq("id", game.id);

  const fieldIds = players.slice(0, onFieldSize).map((p) => p.id);
  const forwardIds = fieldIds.slice(0, 5);
  const backIds = fieldIds.slice(5);
  // players[11], players[12] are off field. players[11] = bench
  // (available); players[12] = LATE ARRIVAL (off field, NOT available).
  const arrival = players[12];
  const benchIds = [players[11].id];

  const outPlayer = players[0]; // forwards[0] — the on-field player to take out
  const replacement = players[11]; // the lone bench player who comes on
  const injurePlayer = players[5]; // backs[0] — for the mark-injured regression

  const lineup = {
    forwards: forwardIds,
    backs: backIds,
    bench: benchIds,
  };

  const aMomentAgo = new Date(Date.now() - 13 * 60_000).toISOString();
  await admin.from("game_events").insert([
    {
      game_id: game.id,
      type: "lineup_set",
      metadata: { lineup, sport: "rugby_league" },
      created_by: ownerId,
      created_at: aMomentAgo,
    },
    {
      game_id: game.id,
      type: "quarter_start",
      metadata: { quarter: 1, sport: "rugby_league" },
      created_by: ownerId,
      created_at: aMomentAgo,
    },
    // quarter_end for H1 lands the page on the isAtQbreak break surface
    // (U10 RL plays 2 halves → currentQuarter 1 < periodCount 2).
    {
      game_id: game.id,
      type: "quarter_end",
      metadata: { quarter: 1, elapsed_ms: 12 * 60_000, sport: "rugby_league" },
      created_by: ownerId,
      created_at: new Date(Date.now() - 60_000).toISOString(),
    },
  ]);
  // Everyone available EXCEPT the late arrival.
  await admin.from("game_availability").upsert(
    players
      .filter((p) => p.id !== arrival.id)
      .map((p) => ({
        game_id: game.id,
        player_id: p.id,
        status: "available",
        updated_by: ownerId,
        updated_at: new Date().toISOString(),
      })),
    { onConflict: "game_id,player_id" },
  );
  await admin.from("games").update({ status: "in_progress" }).eq("id", game.id);

  await suppressWalkthrough(page);
  await page.goto(`/teams/${team.id}/games/${game.id}/live`);

  // League auto-pops the StartQuarterModal on entering the break
  // (unlike AFL/netball, which require tapping "Ready for Q2"). It
  // overlays the break surface, so dismiss it via "Back to lineup"
  // before reaching for the Manage-availability buttons underneath.
  // The modal auto-opens once per period (ref-gated), so a single
  // dismissal holds for the rest of this break.
  const backToLineup = page.getByRole("button", { name: /back to lineup/i });
  await expect(backToLineup).toBeVisible({ timeout: 15_000 });
  await backToLineup.click();
  await expect(backToLineup).toBeHidden({ timeout: 5_000 });

  // The break surface shows a "Ready for H2"/"Ready for half 2" CTA.
  await expect(
    page.getByRole("button", { name: /^start (h2|half 2|q2)$/i }),
  ).toBeVisible({ timeout: 15_000 });

  // ─── 1. ADD ARRIVED ────────────────────────────────────────────
  // Open the break-surface Manage-availability entry, then add the
  // late arrival.
  const manage = page.getByRole("button", {
    name: /manage availability|match adjustments/i,
  });
  if (await manage.isVisible().catch(() => false)) {
    if ((await manage.getAttribute("aria-expanded")) !== "true") {
      await manage.click().catch(() => {});
    }
  }
  await page
    .getByRole("button", { name: /add (an )?arrived player|add arrived/i })
    .click();
  // Scope the pick to the sheet dialog — the arrival's name can also
  // appear in the background field/bench grid.
  const addArrivedSheet = page.getByRole("dialog", { name: /add arrived/i });
  await expect(addArrivedSheet).toBeVisible({ timeout: 5_000 });
  await addArrivedSheet
    .getByRole("button", { name: new RegExp(arrival.full_name, "i") })
    .click();

  await expect
    .poll(
      async () => {
        const { data } = await admin
          .from("game_events")
          .select("type, player_id")
          .eq("game_id", game.id)
          .eq("type", "player_arrived")
          .eq("player_id", arrival.id);
        return data?.length ?? 0;
      },
      { timeout: 10_000, intervals: [200, 200, 500, 500, 1000] },
    )
    .toBeGreaterThanOrEqual(1);

  await expect
    .poll(
      async () => {
        const { data } = await admin
          .from("game_availability")
          .select("status")
          .eq("game_id", game.id)
          .eq("player_id", arrival.id)
          .maybeSingle();
        return data?.status ?? null;
      },
      { timeout: 10_000, intervals: [200, 200, 500, 500, 1000] },
    )
    .toBe("available");

  // ─── 2. MARK OUT (forced replacement) ──────────────────────────
  await page
    .getByRole("button", { name: /mark (a player|player) out|mark out/i })
    .click();
  // Scope to the sheet dialog so the same name in the background
  // field/bench grid doesn't collide.
  const markOutSheet = page.getByRole("dialog", { name: /mark out/i });
  await expect(markOutSheet).toBeVisible({ timeout: 5_000 });
  await markOutSheet
    .getByRole("button", { name: new RegExp(outPlayer.full_name, "i") })
    .click();
  const replacementDialog = page.getByRole("dialog", {
    name: /who comes on at/i,
  });
  await expect(replacementDialog).toBeVisible({ timeout: 5_000 });
  await replacementDialog
    .getByRole("button", { name: new RegExp(replacement.full_name, "i") })
    .click();

  // Assert BOTH an out event (injury w/ reason "out") AND a swap event.
  await expect
    .poll(
      async () => {
        const { data } = await admin
          .from("game_events")
          .select("type, player_id, metadata")
          .eq("game_id", game.id)
          .in("type", ["injury", "swap"]);
        const out = (data ?? []).find(
          (e) =>
            e.type === "injury" &&
            e.player_id === outPlayer.id &&
            (e.metadata as { injured?: boolean })?.injured === true &&
            (e.metadata as { reason?: string })?.reason === "out",
        );
        const sw = (data ?? []).find(
          (e) =>
            e.type === "swap" &&
            (e.metadata as { off_player_id?: string })?.off_player_id ===
              outPlayer.id &&
            (e.metadata as { on_player_id?: string })?.on_player_id ===
              replacement.id,
        );
        return Boolean(out) && Boolean(sw);
      },
      { timeout: 10_000, intervals: [200, 200, 500, 500, 1000] },
    )
    .toBe(true);

  // ─── 3. MARK INJURED (regression guard) ────────────────────────
  await page
    .getByRole("button", { name: /^mark injured$/i })
    .first()
    .click();
  // Scope the pick to the Mark-injured sheet dialog (the same name can
  // appear in the background field/bench grid).
  const injuredSheet = page.getByRole("dialog", { name: /mark injured/i });
  await expect(injuredSheet).toBeVisible({ timeout: 5_000 });
  await injuredSheet
    .getByRole("button", { name: new RegExp(injurePlayer.full_name, "i") })
    .click();

  await expect
    .poll(
      async () => {
        const { data } = await admin
          .from("game_events")
          .select("type, player_id, metadata")
          .eq("game_id", game.id)
          .eq("type", "injury")
          .eq("player_id", injurePlayer.id);
        return (data ?? []).some(
          (e) =>
            (e.metadata as { injured?: boolean })?.injured === true &&
            (e.metadata as { reason?: string })?.reason !== "out",
        );
      },
      { timeout: 10_000, intervals: [200, 200, 500, 500, 1000] },
    )
    .toBe(true);
});

// ─── Pinned plan meets the sideline (rugby league) ────────────────────
// The coach planned the second half before it started; a forward got
// hurt in the first. Starting the half applies the plan. Pre-fix it put
// every squad kid who isn't hurt or lent on the bench (including the two
// who never turned up), and dropped the hurt kid from the lineup
// altogether, so marking them recovered later brought them back nowhere.
test("rugby league: a pinned plan at the break keeps a hurt kid on the bench and leaves absent kids out", async ({
  page,
}) => {
  test.setTimeout(90_000);
  const admin = createAdminClient();
  const { data: superAdmin } = await admin.auth.admin.listUsers();
  const ownerId = superAdmin.users.find(
    (u) => u.email === process.env.TEST_SUPER_ADMIN_EMAIL,
  )!.id;
  const team = await makeTeam(admin, {
    ownerId,
    ageGroup: "U10",
    sport: "rugby_league",
    name: `RL-PIN-SIDELINE-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
  });
  const players = await makePlayers(admin, { teamId: team.id, ownerId, count: 15, ageGroup: "U10" });
  const game = await makeGame(admin, { teamId: team.id, ownerId });
  await admin.from("games").update({ on_field_size: 11 }).eq("id", game.id);

  const ids = players.map((p) => p.id);
  const lineup = { forwards: ids.slice(0, 5), backs: ids.slice(5, 11), bench: ids.slice(11, 13) };
  const hurt = players[0];
  const absent = [players[13], players[14]];

  const t = (secAgo: number) => new Date(Date.now() - secAgo * 1000).toISOString();
  await admin.from("game_events").insert(
    [
      { type: "lineup_set", metadata: { lineup, sport: "rugby_league" }, created_at: t(800) },
      { type: "quarter_start", metadata: { quarter: 1, sport: "rugby_league" }, created_at: t(799) },
      {
        type: "injury",
        player_id: hurt.id,
        metadata: { injured: true, quarter: 1, elapsed_ms: 300_000, sport: "rugby_league" },
        created_at: t(500),
      },
      { type: "quarter_end", metadata: { quarter: 1, elapsed_ms: 12 * 60_000, sport: "rugby_league" }, created_at: t(60) },
    ].map((e) => ({ ...e, game_id: game.id, created_by: ownerId })),
  );
  await admin.from("game_availability").upsert(
    players
      .filter((p) => !absent.includes(p))
      .map((p) => ({ game_id: game.id, player_id: p.id, status: "available", updated_by: ownerId, updated_at: new Date().toISOString() })),
    { onConflict: "game_id,player_id" },
  );
  await admin.from("games").update({ status: "in_progress" }).eq("id", game.id);

  // The second half's plan, pinned before it started: a bench kid on for
  // the hurt forward.
  const pin = {
    gameId: game.id,
    laterPeriods: {
      1: { groups: { forwards: [...ids.slice(1, 5), ids[11]], backs: ids.slice(5, 11) }, bench: [ids[12]] },
    },
  };
  await seedPlan(page, game.id, pin);
  await page.goto(`/teams/${team.id}/games/${game.id}/live`);

  // The break pops the start modal; start the second half.
  await page.getByRole("button", { name: /^start clock$/i }).click({ timeout: 15_000 });

  let started: { forwards: string[]; backs: string[]; bench: string[] } | null = null;
  await expect
    .poll(
      async () => {
        const { data } = await admin
          .from("game_events")
          .select("type, metadata, created_at")
          .eq("game_id", game.id)
          .in("type", ["lineup_set", "quarter_start"])
          .order("created_at", { ascending: true });
        const rows = data ?? [];
        const h2 = rows.findIndex((e) => e.type === "quarter_start" && (e.metadata as { quarter?: number }).quarter === 2);
        if (h2 < 0) return false;
        const set = rows.slice(0, h2).reverse().find((e) => e.type === "lineup_set");
        started = (set?.metadata as { lineup: typeof started }).lineup;
        return true;
      },
      { timeout: 20_000 },
    )
    .toBe(true);

  // The plan was applied...
  expect(started!.forwards).toContain(ids[11]);
  expect(started!.forwards).not.toContain(hurt.id);
  // ...the hurt kid is parked on the bench, still in the game...
  expect(started!.bench).toContain(hurt.id);
  // ...and the kids who never turned up stay out of it.
  const inGame = [...started!.forwards, ...started!.backs, ...started!.bench];
  for (const p of absent) expect(inGame).not.toContain(p.id);
});

// ─── A swap at the break goes on top of the plan (rugby league) ──────
// The coach planned the second half (a bench kid on for a forward) and,
// at the break, swaps one more kid. Pre-fix the break drew the FIRST
// half's lineup under "Pre-filled from your planned H2 lineup", saved
// the swap against that, and Start then put the plan on over it: the
// half began without the swap. AFL opens its break on the plan and the
// coach edits that, so league must too: the field at the break is the
// plan, a swap changes the plan, and Start begins the half with both.
test("rugby league: the break shows the planned half, and a swap made there is in it when it starts", async ({
  page,
}) => {
  test.setTimeout(120_000);
  const admin = createAdminClient();
  const { data: superAdmin } = await admin.auth.admin.listUsers();
  const ownerId = superAdmin.users.find(
    (u) => u.email === process.env.TEST_SUPER_ADMIN_EMAIL,
  )!.id;
  // U13: no vest or kickoff prompts in the way.
  const team = await makeTeam(admin, {
    ownerId,
    ageGroup: "U13",
    sport: "rugby_league",
    name: `RL-PIN-SWAP-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
  });
  const players = await makePlayers(admin, { teamId: team.id, ownerId, count: 15, ageGroup: "U10" });
  const game = await makeGame(admin, { teamId: team.id, ownerId });
  await admin.from("games").update({ on_field_size: 13 }).eq("id", game.id);

  const ids = players.map((p) => p.id);
  const h1 = { forwards: ids.slice(0, 6), backs: ids.slice(6, 13), bench: ids.slice(13) };
  const t = (secAgo: number) => new Date(Date.now() - secAgo * 1000).toISOString();
  await admin.from("game_events").insert(
    [
      { type: "lineup_set", metadata: { lineup: h1, sport: "rugby_league" }, created_at: t(800) },
      { type: "quarter_start", metadata: { quarter: 1, sport: "rugby_league" }, created_at: t(799) },
      { type: "quarter_end", metadata: { quarter: 1, elapsed_ms: 12 * 60_000, sport: "rugby_league" }, created_at: t(60) },
    ].map((e) => ({ ...e, game_id: game.id, created_by: ownerId })),
  );
  await admin.from("game_availability").upsert(
    players.map((p) => ({ game_id: game.id, player_id: p.id, status: "available", updated_by: ownerId, updated_at: new Date().toISOString() })),
    { onConflict: "game_id,player_id" },
  );
  await admin.from("games").update({ status: "in_progress" }).eq("id", game.id);

  // The plan for H2: bench kid 13 on for forward 0.
  const plannedOn = ids[13];
  const plannedOff = ids[0];
  await seedPlan(page, game.id, {
    gameId: game.id,
    laterPeriods: {
      1: { groups: { forwards: [plannedOn, ...ids.slice(1, 6)], backs: ids.slice(6, 13) }, bench: [plannedOff, ids[14]] },
    },
  });
  // At the break the coach also brings bench kid 14 on for back 6.
  const swapOn = ids[14];
  const swapOff = ids[6];

  const field = page.getByRole("region", { name: "On field" });
  const bench = page.getByRole("group", { name: "Bench", exact: true });
  const tile = (id: string) => page.getByTestId(`league-player-tile-${id}`);
  const backToLineup = page.getByRole("button", { name: /back to lineup/i });
  const toTheBreak = async () => {
    // The break pops the start modal on arrival; step back to the field.
    await backToLineup.click({ timeout: 15_000 });
    await expect(backToLineup).toBeHidden({ timeout: 5_000 });
    await expect(page.getByTestId("planned-seed-banner")).toBeVisible({ timeout: 15_000 });
  };

  await page.goto(`/teams/${team.id}/games/${game.id}/live`);
  await toTheBreak();

  // The field at the break is the plan, not the half just played.
  await expect.soft(field.getByTestId(`league-player-tile-${plannedOn}`)).toBeVisible({ timeout: 10_000 });
  await expect.soft(bench.getByTestId(`league-player-tile-${plannedOff}`)).toBeVisible();

  // The swap.
  await tile(swapOn).click();
  await tile(swapOff).click();
  await expect(field.getByTestId(`league-player-tile-${swapOn}`)).toBeVisible({ timeout: 10_000 });
  await expect(bench.getByTestId(`league-player-tile-${swapOff}`)).toBeVisible();
  await expect.soft(field.getByTestId(`league-player-tile-${plannedOn}`)).toBeVisible();

  // It's still there after a reload, on top of the plan.
  await page.reload();
  await toTheBreak();
  await expect(field.getByTestId(`league-player-tile-${swapOn}`)).toBeVisible({ timeout: 10_000 });
  await expect(bench.getByTestId(`league-player-tile-${swapOff}`)).toBeVisible();
  await expect.soft(field.getByTestId(`league-player-tile-${plannedOn}`)).toBeVisible();

  // Start H2: it begins with the plan AND the swap.
  await page.getByRole("button", { name: /^start h2$/i }).click();
  await page.getByRole("button", { name: /^start clock$/i }).click();
  let events: GameEvent[] = [];
  await expect
    .poll(
      async () => {
        const { data } = await admin
          .from("game_events")
          .select("*")
          .eq("game_id", game.id)
          .order("created_at", { ascending: true });
        events = (data ?? []) as GameEvent[];
        return events.some((e) => e.type === "quarter_start" && (e.metadata as { quarter?: number }).quarter === 2);
      },
      { timeout: 20_000 },
    )
    .toBe(true);
  const h2 = replayLeagueGame(events).lineup!;
  expect(h2.backs).toContain(swapOn);
  expect(h2.bench).toContain(swapOff);
  expect(h2.forwards).toContain(plannedOn);
  expect(h2.bench).toContain(plannedOff);
  const everyone = [...h2.forwards, ...h2.backs, ...h2.bench];
  expect(everyone.sort()).toEqual([...ids].sort());
  // The swap stayed where it was made: on the backs line, kid 14 in kid 6's spot.
  expect(h2.backs.indexOf(swapOn)).toBe(0);
});
