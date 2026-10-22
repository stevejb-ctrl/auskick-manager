// ─── B2 / AVAIL-02 regression: manage availability at the break (netball) ───
// At a period break a netball coach must be able to:
//   1. ADD a newly-arrived player (NOT available pre-game) into the
//      game — lands a `player_arrived` event + flips game_availability
//      to 'available' (canonical addLateArrival writer).
//   2. MARK a present on-court player OUT — forces a replacement pick
//      (InjuryReplacementModal); records an injury event with
//      metadata.reason === "out" (distinct from a plain injury). Netball
//      has no `swap` event writer at the break — the durable
//      distinguishing record is the out-reason injury event; the
//      replacement takes the vacated court position in the next-quarter
//      lineup (period_break_swap on Start Q2). So we assert the OUT
//      event, NOT a swap event.
//   3. MARK a player INJURED — the existing affordance still works
//      (regression guard).
//
// Pre-fix this FAILS: NetballQuarterBreak has no "Manage availability"
// entry — add-arrived and mark-out do not exist at the break.
//
// Covers:
//   - src/components/netball/NetballQuarterBreak.tsx (the new break entry)
//   - addLateArrival / markInjury(reason:"out")

import { test, expect } from "@playwright/test";
import { createAdminClient } from "../fixtures/supabase";
import { makeTeam, makePlayers, makeGame } from "../fixtures/factories";
import { closeGameSettings, openGameSettings, pickBreakStrategy, startFromBreak } from "../helpers/break";

test.describe.configure({ mode: "parallel" });

const NETBALL_LINEUP_KEYS = ["gs", "ga", "wa", "c", "wd", "gd", "gk"] as const;

async function suppressWalkthrough(
  page: import("@playwright/test").Page,
): Promise<void> {
  await page.addInitScript(() => {
    try {
      localStorage.setItem("nb-walkthrough-seen", "1");
    } catch {}
  });
}

async function enterQBreakView(
  page: import("@playwright/test").Page,
  admin: ReturnType<typeof createAdminClient>,
  gameId: string,
): Promise<void> {
  await expect
    .poll(
      async () => {
        const { data } = await admin
          .from("game_events")
          .select("type, metadata")
          .eq("game_id", gameId)
          .eq("type", "quarter_end");
        return (data ?? []).some(
          (e) => (e.metadata as { quarter?: number } | null)?.quarter === 1,
        );
      },
      { timeout: 10_000, intervals: [200, 500, 500, 1000, 1000] },
    )
    .toBe(true);
  await expect(
    page.getByRole("button", { name: /^start q2$/i }),
  ).toBeVisible({ timeout: 10_000 });
}

// The break's Game settings sheet (the status chip) holds lend, injured,
// arrived and mark out; the strategy picker is on the screen itself.
const expandGameSettings = openGameSettings;

test("netball: at the break a coach can add an arrived player, mark a player out (out reason), and mark a player injured", async ({
  page,
}) => {
  const admin = createAdminClient();
  const { data: superAdmin } = await admin.auth.admin.listUsers();
  const ownerId = superAdmin.users.find(
    (u) => u.email === process.env.TEST_SUPER_ADMIN_EMAIL,
  )!.id;

  const team = await makeTeam(admin, {
    ownerId,
    ageGroup: "go",
    sport: "netball",
    name: `NB-AVAIL-BRK-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
  });
  const teamQS = 480; // 8-min quarter so the auto-hooter fires fast.
  await admin
    .from("teams")
    .update({ track_scoring: false, quarter_length_seconds: teamQS })
    .eq("id", team.id);

  // 10 players: 7 court + 2 bench + 1 LATE ARRIVAL kept off-court and
  // NOT available pre-game.
  const players = await makePlayers(admin, {
    teamId: team.id,
    ownerId,
    count: 10,
    ageGroup: "U10",
  });
  const game = await makeGame(admin, {
    teamId: team.id,
    ownerId,
  });

  const arrival = players[9]; // off-court, NOT available pre-game
  const outPlayer = players[0]; // GS — the on-court player to take out
  const replacement = players[7]; // first bench player
  const injurePlayer = players[1]; // GA — for the mark-injured regression

  // Seed game_availability for everyone EXCEPT the late arrival.
  await admin.from("game_availability").insert(
    players
      .filter((p) => p.id !== arrival.id)
      .map((p) => ({ game_id: game.id, player_id: p.id, status: "available" })),
  );

  // Q1 lineup: players[0..6] on the 7 court positions, players[7..8]
  // on the bench. arrival (players[9]) is nowhere.
  const positions: Record<string, string[]> = Object.fromEntries(
    NETBALL_LINEUP_KEYS.map((k, i) => [k, [players[i].id]]),
  );
  const bench = [players[7].id, players[8].id];
  const lineup = { positions, bench };

  const startedAt = new Date(Date.now() - (teamQS + 60) * 1000).toISOString();
  await admin.from("game_events").insert([
    {
      game_id: game.id,
      type: "lineup_set",
      metadata: { lineup },
      created_by: ownerId,
      created_at: startedAt,
    },
    {
      game_id: game.id,
      type: "quarter_start",
      metadata: { quarter: 1 },
      created_by: ownerId,
      created_at: startedAt,
    },
  ]);
  await admin.from("games").update({ status: "in_progress" }).eq("id", game.id);

  await suppressWalkthrough(page);
  await page.goto(`/teams/${team.id}/games/${game.id}/live`);
  await enterQBreakView(page, admin, game.id);

  // Freeze the lineup to Repeat ("keep last quarter") so the fairness
  // suggester doesn't rotate the seeded court/bench — the mark-out flow
  // needs `outPlayer` to still be on court and `replacement` on the bench.
  await pickBreakStrategy(page, "Repeat");

  // The break-surface availability controls live in the Game settings
  // sheet behind the status chip.
  await expandGameSettings(page);

  // ─── 1. ADD ARRIVED ────────────────────────────────────────────
  await page
    .getByRole("button", { name: /add (an )?arrived player|add arrived/i })
    .click();
  // Scope the pick to the sheet dialog — the arrival's name can also
  // appear in the background lineup grid.
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
  // Scope to the sheet dialog so the same name in the background lineup
  // grid doesn't collide.
  const markOutSheet = page.getByRole("dialog", { name: /mark out/i });
  await expect(markOutSheet).toBeVisible({ timeout: 5_000 });
  await markOutSheet
    .getByRole("button", { name: new RegExp(outPlayer.full_name, "i") })
    .click();
  const replacementDialog = page.getByRole("dialog", {
    name: /who comes on at/i,
  });
  await expect(replacementDialog).toBeVisible({ timeout: 5_000 });
  // The bib in netball's words ("GS"), not an AFL zone label or a
  // capitalised id ("Gs") — cross-sport audit, 14 Oct 2026.
  await expect(replacementDialog).toHaveAccessibleName("Who comes on at GS?");
  await replacementDialog
    .getByRole("button", { name: new RegExp(replacement.full_name, "i") })
    .click();

  // Netball records an injury event with the OUT reason (no swap event
  // exists at the netball break — the replacement lands via the
  // next-quarter lineup / period_break_swap).
  await expect
    .poll(
      async () => {
        const { data } = await admin
          .from("game_events")
          .select("type, player_id, metadata")
          .eq("game_id", game.id)
          .eq("type", "injury")
          .eq("player_id", outPlayer.id);
        return (data ?? []).some(
          (e) =>
            (e.metadata as { injured?: boolean })?.injured === true &&
            (e.metadata as { reason?: string })?.reason === "out",
        );
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
  // appear in the background lineup grid).
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

// ─── Sideline combo at the break (netball) ───────────────────────────
// A bench kid was lent during Q1. At the break the coach lends the GS,
// brings the Q1 loaner back, and puts them in at GS. Pre-fix the lent
// GS stayed on court in the staged lineup (and started Q2 there), and
// the kid brought back landed nowhere: not on the bench, not pickable,
// gone from the game.
test("netball: lending at the break takes the kid off court, and a kid brought back lands on the bench", async ({
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
    ageGroup: "go",
    sport: "netball",
    name: `NB-BRK-COMBO-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
  });
  const teamQS = 480;
  await admin
    .from("teams")
    .update({ track_scoring: false, quarter_length_seconds: teamQS })
    .eq("id", team.id);
  const players = await makePlayers(admin, { teamId: team.id, ownerId, count: 10, ageGroup: "U10" });
  const game = await makeGame(admin, { teamId: team.id, ownerId });
  await admin.from("game_availability").insert(
    players.map((p) => ({ game_id: game.id, player_id: p.id, status: "available" })),
  );

  const positions: Record<string, string[]> = Object.fromEntries(
    NETBALL_LINEUP_KEYS.map((k, i) => [k, [players[i].id]]),
  );
  const lineup = { positions, bench: [players[7].id, players[8].id, players[9].id] };
  const gs = players[0];
  const q1Loaner = players[8];

  const startedAt = new Date(Date.now() - (teamQS + 60) * 1000).toISOString();
  const lentAt = new Date(Date.now() - (teamQS - 60) * 1000).toISOString();
  await admin.from("game_events").insert([
    { game_id: game.id, type: "lineup_set", metadata: { lineup }, created_by: ownerId, created_at: startedAt },
    { game_id: game.id, type: "quarter_start", metadata: { quarter: 1 }, created_by: ownerId, created_at: startedAt },
    {
      game_id: game.id,
      type: "player_loan",
      player_id: q1Loaner.id,
      metadata: { loaned: true, quarter: 1, elapsed_ms: 120_000 },
      created_by: ownerId,
      created_at: lentAt,
    },
  ]);
  await admin.from("games").update({ status: "in_progress" }).eq("id", game.id);

  await suppressWalkthrough(page);
  await page.goto(`/teams/${team.id}/games/${game.id}/live`);
  await enterQBreakView(page, admin, game.id);
  await pickBreakStrategy(page, "Repeat");
  await expandGameSettings(page);

  // A kid's tile on court carries their bib; an empty bib is its own spot.
  const tile = (id: string) => page.getByTestId(`player-tile-${id}`);
  const emptyGS = page.getByRole("button", { name: /^empty gs spot$/i });
  const loanEvents = async (pid: string) => {
    const { data } = await admin
      .from("game_events")
      .select("metadata")
      .eq("game_id", game.id)
      .eq("type", "player_loan")
      .eq("player_id", pid)
      .order("created_at", { ascending: true });
    return (data ?? []).map((e) => (e.metadata as { loaned?: boolean }).loaned);
  };

  // Lend the GS: they come off court, leaving GS to fill.
  await expect(tile(gs.id)).toContainText("GS");
  await page.getByRole("button", { name: /^\+?\s*lend a player$/i }).click();
  const lendSheet = page.getByRole("dialog", { name: /lend/i });
  await expect(lendSheet).toBeVisible({ timeout: 5_000 });
  await lendSheet.getByRole("button", { name: new RegExp(gs.full_name, "i") }).click();
  await expect.poll(() => loanEvents(gs.id), { timeout: 15_000 }).toEqual([true]);
  await expect(page.getByRole("group", { name: "Bench", exact: true }).getByTestId(`player-tile-${gs.id}`)).toContainText("Lent");
  await expect(emptyGS).toBeVisible();

  // Bring the Q1 loaner back, then put them in at GS: tap the empty
  // spot, then the kid (back on the bench).
  await expandGameSettings(page);
  await page.getByRole("button", { name: `Bring ${q1Loaner.full_name} back` }).click();
  await expect.poll(() => loanEvents(q1Loaner.id), { timeout: 15_000 }).toEqual([true, false]);
  await closeGameSettings(page);
  await emptyGS.click();
  await tile(q1Loaner.id).click();
  await expect(tile(q1Loaner.id)).toContainText("GS");

  // Start Q2: the committed lineup has the recalled kid at GS and
  // nobody lost (everyone but the lent GS is on court or the bench).
  await startFromBreak(page, /^start q2/i);
  let q2: { positions: Record<string, string[]>; bench: string[] } | null = null;
  await expect
    .poll(
      async () => {
        const { data } = await admin
          .from("game_events")
          .select("metadata")
          .eq("game_id", game.id)
          .eq("type", "period_break_swap");
        const ev = (data ?? []).find((e) => (e.metadata as { quarter?: number }).quarter === 2);
        q2 = ev ? (ev.metadata as { lineup: typeof q2 }).lineup : null;
        return q2 !== null;
      },
      { timeout: 15_000 },
    )
    .toBe(true);
  const court = Object.values(q2!.positions).flat();
  expect(q2!.positions.gs).toEqual([q1Loaner.id]);
  expect(court).not.toContain(gs.id);
  const inGame = new Set([...court, ...q2!.bench]);
  for (const p of players.slice(1)) expect(inGame.has(p.id)).toBe(true);
});

// Stagehand round 4 (sideline-chaos-netball): the coach had a bench kid
// selected (a long-press selects too), then lent her. The next tap on a
// court kid swapped the lent kid onto court.
test("netball: a kid selected and then lent at the break doesn't swap on with the next tap", async ({
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
    ageGroup: "go",
    sport: "netball",
    name: `NB-STALE-SEL-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
  });
  const teamQS = 480;
  await admin
    .from("teams")
    .update({ track_scoring: false, quarter_length_seconds: teamQS })
    .eq("id", team.id);
  const players = await makePlayers(admin, { teamId: team.id, ownerId, count: 9, ageGroup: "U10" });
  const game = await makeGame(admin, { teamId: team.id, ownerId });
  await admin.from("game_availability").insert(
    players.map((p) => ({ game_id: game.id, player_id: p.id, status: "available" })),
  );
  const positions: Record<string, string[]> = Object.fromEntries(
    NETBALL_LINEUP_KEYS.map((k, i) => [k, [players[i].id]]),
  );
  const lineup = { positions, bench: [players[7].id, players[8].id] };
  const startedAt = new Date(Date.now() - (teamQS + 60) * 1000).toISOString();
  await admin.from("game_events").insert([
    { game_id: game.id, type: "lineup_set", metadata: { lineup }, created_by: ownerId, created_at: startedAt },
    { game_id: game.id, type: "quarter_start", metadata: { quarter: 1 }, created_by: ownerId, created_at: startedAt },
  ]);
  await admin.from("games").update({ status: "in_progress" }).eq("id", game.id);

  await suppressWalkthrough(page);
  await page.goto(`/teams/${team.id}/games/${game.id}/live`);
  await enterQBreakView(page, admin, game.id);
  await pickBreakStrategy(page, "Repeat");

  const lent = players[7];
  const gs = players[0];
  const tile = (id: string) => page.getByTestId(`player-tile-${id}`);

  // Select the bench kid, then lend her.
  await tile(lent.id).click();
  await expandGameSettings(page);
  await page.getByRole("button", { name: /^\+?\s*lend a player$/i }).click();
  const lendSheet = page.getByRole("dialog", { name: /lend/i });
  await lendSheet.getByRole("button", { name: new RegExp(lent.full_name, "i") }).click();
  await expect
    .poll(async () => {
      const { data } = await admin.from("game_events").select("id").eq("game_id", game.id).eq("type", "player_loan");
      return (data ?? []).length;
    }, { timeout: 15_000 })
    .toBe(1);
  // The lend lands; then the coach taps the GS.
  await expect(page.getByRole("button", { name: `Bring ${lent.full_name} back` })).toBeVisible({ timeout: 15_000 });
  await closeGameSettings(page);
  await tile(gs.id).click();

  // No swap: the GS is still on, the lent kid is still on the bench.
  await expect(tile(gs.id)).toContainText("GS");
  await expect(page.getByRole("group", { name: "Bench", exact: true }).getByTestId(`player-tile-${lent.id}`)).toContainText("Lent");
  for (const third of ["Attack", "Centre", "Defence"]) {
    await expect(page.getByRole("group", { name: third, exact: true }).getByTestId(`player-tile-${lent.id}`)).toHaveCount(0);
  }
});
