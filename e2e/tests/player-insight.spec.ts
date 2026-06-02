// F3 (Phase 12) — long-press player insight summary.
//
// Long-pressing a player opens the host action modal (AFL/RL: LockModal;
// netball: NetballPlayerActions). All three embed the SHARED
// PlayerInsightSummary via the `insight` slot, so the same three
// sections render regardless of sport:
//   - player-insight-ingame  (this game: time on + per-zone time)
//   - player-insight-periods (per-period zone breakdown)
//   - player-insight-season  (season per-zone PERCENTAGES, D-04)
//
// Each case seeds a completed period 1 + an in-progress period 2 so the
// replay produces per-period zone-ms (playedZoneMsByPeriod) and the "By
// period" section has real data to render. AFL is the reference; the
// netball + league cases (plan 12-02) prove the SAME shared summary
// renders inside each sport's host action modal.
//
// Covers:
//   - src/lib/player-insight.ts buildPlayerInsight
//   - src/components/live/PlayerInsightSummary.tsx
//   - src/components/live/LockModal.tsx insight slot          (AFL + league)
//   - src/components/netball/NetballPlayerActions.tsx insight slot
//   - src/components/live/LiveGame.tsx insight wiring          (AFL)
//   - src/components/netball/NetballLiveGame.tsx insight wiring
//   - src/components/league/LeagueLiveGame.tsx insight wiring
//   - src/lib/fairness.ts + sports/{netball,rugby_league}/fairness.ts
//     playedZoneMsByPeriod

import { test, expect } from "@playwright/test";
import { createAdminClient } from "../fixtures/supabase";
import { makeTeam, makePlayers, makeGame } from "../fixtures/factories";

test.describe.configure({ mode: "parallel" });

test("AFL: long-press a player shows in-game, per-period and season insight sections", async ({
  page,
}) => {
  const admin = createAdminClient();
  const { data: superAdmin } = await admin.auth.admin.listUsers();
  const ownerId = superAdmin.users.find(
    (u) => u.email === process.env.TEST_SUPER_ADMIN_EMAIL
  )!.id;

  const team = await makeTeam(admin, { ownerId, ageGroup: "U10" });
  const players = await makePlayers(admin, {
    teamId: team.id,
    ownerId,
    count: 15,
  });
  const game = await makeGame(admin, { teamId: team.id, ownerId });

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

  // A completed Q1 (full quarter played) then Q2 in progress. The
  // quarter_end's elapsed_ms credits every on-field player a full
  // quarter in their zone, so replayGame populates playedZoneMsByPeriod
  // for period 1 — giving the "By period" section real data to show.
  await admin.from("game_events").insert([
    {
      game_id: game.id,
      type: "lineup_set",
      metadata: { lineup },
      created_by: ownerId,
    },
    {
      game_id: game.id,
      type: "quarter_start",
      metadata: { quarter: 1 },
      created_by: ownerId,
    },
    {
      game_id: game.id,
      type: "quarter_end",
      metadata: { quarter: 1, elapsed_ms: 600_000 },
      created_by: ownerId,
    },
    {
      game_id: game.id,
      type: "quarter_start",
      metadata: { quarter: 2 },
      created_by: ownerId,
    },
  ]);
  await admin.from("games").update({ status: "in_progress" }).eq("id", game.id);

  await page.goto(`/teams/${team.id}/games/${game.id}/live`);

  // A player who was on the field for the whole of Q1.
  const source = onField[0];

  // Long-press (PlayerTile fires onLongPress after a 500ms hold).
  await page.getByTestId(`player-tile-${source.id}`).click({ delay: 600 });

  // The shared PlayerInsightSummary renders its three sections inside
  // the LockModal, between the player's name and the action buttons.
  await expect(page.getByTestId("player-insight-ingame")).toBeVisible({
    timeout: 5_000,
  });
  await expect(page.getByTestId("player-insight-periods")).toBeVisible();
  await expect(page.getByTestId("player-insight-season")).toBeVisible();

  // The per-period section lists Q1 (the completed quarter).
  await expect(
    page.getByTestId("player-insight-periods").getByText("Q1"),
  ).toBeVisible();

  // The action buttons still render below the summary — the slot is
  // additive, not a replacement.
  await expect(
    page.getByRole("button", { name: /^switch player\b/i }),
  ).toBeVisible();
});

test("netball: long-press a player shows in-game, per-period and season insight sections", async ({
  page,
}) => {
  const admin = createAdminClient();
  const { data: superAdmin } = await admin.auth.admin.listUsers();
  const ownerId = superAdmin.users.find(
    (u) => u.email === process.env.TEST_SUPER_ADMIN_EMAIL
  )!.id;

  // Netball "go" team: 7 court positions + bench. ageGroup "U10" on
  // makePlayers/makeGame mirrors netball-live-flow.spec.ts — the count
  // is explicit so the AFL-shaped AGE_GROUPS lookup is skipped, but
  // "U10" keeps the default-size path robust.
  const team = await makeTeam(admin, {
    ownerId,
    ageGroup: "go",
    sport: "netball",
    name: `NB-PI-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
  });
  const players = await makePlayers(admin, {
    teamId: team.id,
    ownerId,
    count: 9,
    ageGroup: "U10",
  });
  const game = await makeGame(admin, {
    teamId: team.id,
    ownerId,
    ageGroup: "U10",
  });

  // GenericLineup shape: { positions: { gs:[...], ... }, bench:[...] }.
  // players[0] = GS so its PositionToken aria-label is a known string.
  const lineup = {
    positions: {
      gs: [players[0].id],
      ga: [players[1].id],
      wa: [players[2].id],
      c: [players[3].id],
      wd: [players[4].id],
      gd: [players[5].id],
      gk: [players[6].id],
    },
    bench: players.slice(7).map((p) => p.id),
  };

  await admin.from("game_availability").insert(
    players.map((p) => ({
      game_id: game.id,
      player_id: p.id,
      status: "available",
    })),
  );

  // A completed Q1 (full 10-min "go" quarter = 600_000 ms) then Q2 in
  // progress. Netball credits a CLOSED quarter into playedZoneMsByPeriod
  // at the `period_break_swap` (subs happen at the break), NOT at
  // quarter_end — so the break event (same lineup, no swaps) is what
  // makes period-1 data exist for the "By period" section. GS stays
  // players[0] through the break so the long-press target is stable.
  await admin.from("game_events").insert([
    {
      game_id: game.id,
      type: "lineup_set",
      metadata: { lineup },
      created_by: ownerId,
    },
    {
      game_id: game.id,
      type: "quarter_start",
      metadata: { quarter: 1 },
      created_by: ownerId,
    },
    {
      game_id: game.id,
      type: "quarter_end",
      metadata: { quarter: 1, elapsed_ms: 600_000 },
      created_by: ownerId,
    },
    {
      game_id: game.id,
      type: "period_break_swap",
      metadata: { lineup },
      created_by: ownerId,
    },
    {
      game_id: game.id,
      type: "quarter_start",
      metadata: { quarter: 2 },
      created_by: ownerId,
    },
  ]);
  await admin.from("games").update({ status: "in_progress" }).eq("id", game.id);

  // Suppress the netball walkthrough modal (covered by
  // netball-walkthrough.spec.ts) so it doesn't intercept the long-press.
  await page.addInitScript(() => {
    try {
      localStorage.setItem("nb-walkthrough-seen", "1");
    } catch {}
  });
  await page.goto(`/teams/${team.id}/games/${game.id}/live`);

  // Long-press the GS court tile. PositionToken's aria-label is the
  // FULL position name + player name ("Goal Shooter, ${name}"), and
  // click({ delay: 600 }) holds past the 500ms long-press threshold —
  // same trigger as netball-live-flow.spec.ts NETBALL-08.
  await page
    .getByRole("button", {
      name: new RegExp(`^Goal Shooter,\\s*${players[0].full_name}`, "i"),
    })
    .click({ delay: 600 });

  // NetballPlayerActions embeds the SHARED PlayerInsightSummary via its
  // `insight` slot — the same three sections as AFL.
  await expect(page.getByTestId("player-insight-ingame")).toBeVisible({
    timeout: 5_000,
  });
  await expect(page.getByTestId("player-insight-periods")).toBeVisible();
  await expect(page.getByTestId("player-insight-season")).toBeVisible();

  // Netball periodLabel is "quarter" → the per-period rows read "Q1".
  await expect(
    page.getByTestId("player-insight-periods").getByText("Q1"),
  ).toBeVisible();

  // The netball action set still renders below the additive slot.
  await expect(
    page.getByRole("button", { name: /mark injured/i }),
  ).toBeVisible();
});

test("rugby league: long-press a player shows in-game, per-period and season insight sections", async ({
  page,
}) => {
  const admin = createAdminClient();
  const { data: superAdmin } = await admin.auth.admin.listUsers();
  const ownerId = superAdmin.users.find(
    (u) => u.email === process.env.TEST_SUPER_ADMIN_EMAIL
  )!.id;

  // U10 RL: 11-a-side (5 forwards + 6 backs) + 2 bench = 13 players.
  const team = await makeTeam(admin, {
    ownerId,
    ageGroup: "U10",
    sport: "rugby_league",
    name: `RL-PI-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
  });
  const players = await makePlayers(admin, {
    teamId: team.id,
    ownerId,
    count: 13,
    ageGroup: "U10",
  });
  const game = await makeGame(admin, {
    teamId: team.id,
    ownerId,
    ageGroup: "U10",
  });
  // makeGame uses AFL's AGE_GROUPS (defaultOnFieldSize=12); RL U10 is
  // 11-a-side, so override to match the seeded lineup window.
  await admin.from("games").update({ on_field_size: 11 }).eq("id", game.id);

  await admin.from("game_availability").insert(
    players.map((p) => ({
      game_id: game.id,
      player_id: p.id,
      status: "available",
    })),
  );

  const forwards = players.slice(0, 5).map((p) => p.id);
  const backs = players.slice(5, 11).map((p) => p.id);
  const bench = players.slice(11).map((p) => p.id);

  // A completed H1 (full 20-min half = 1_200_000 ms) then H2 in
  // progress. The quarter_end credits every on-field player a full half
  // in the single "field" zone, so playedZoneMsByPeriod has period-1
  // data for the "By period" section.
  await admin.from("game_events").insert([
    {
      game_id: game.id,
      type: "lineup_set",
      metadata: {
        lineup: { forwards, backs, bench },
        sport: "rugby_league",
      },
      created_by: ownerId,
    },
    {
      game_id: game.id,
      type: "quarter_start",
      metadata: { quarter: 1, sport: "rugby_league" },
      created_by: ownerId,
    },
    {
      game_id: game.id,
      type: "quarter_end",
      metadata: { quarter: 1, elapsed_ms: 1_200_000, sport: "rugby_league" },
      created_by: ownerId,
    },
    {
      game_id: game.id,
      type: "quarter_start",
      metadata: { quarter: 2, sport: "rugby_league" },
      created_by: ownerId,
    },
  ]);
  await admin.from("games").update({ status: "in_progress" }).eq("id", game.id);

  await page.goto(`/teams/${team.id}/games/${game.id}/live`);
  // Confirm the live shell mounted in H2 before driving the long-press.
  await expect(page.getByText(/half\s*2/i).first()).toBeVisible({
    timeout: 15_000,
  });

  // Long-press an on-field player via the stable per-player testid.
  // LeaguePlayerTile fires onLongPress after a 500ms hold; click({
  // delay: 600 }) blows past it (same trigger as the AFL tile).
  await page
    .getByTestId(`league-player-tile-${players[0].id}`)
    .click({ delay: 600 });

  // The shared LockModal (same modal AFL uses) embeds PlayerInsightSummary.
  await expect(page.getByTestId("player-insight-ingame")).toBeVisible({
    timeout: 5_000,
  });
  await expect(page.getByTestId("player-insight-periods")).toBeVisible();
  await expect(page.getByTestId("player-insight-season")).toBeVisible();

  // RL U10 periodLabel is "half" → the per-period rows read "H1".
  await expect(
    page.getByTestId("player-insight-periods").getByText("H1"),
  ).toBeVisible();

  // The LockModal action set still renders below the additive slot.
  await expect(
    page.getByRole("button", { name: /^switch player\b/i }),
  ).toBeVisible();
});
