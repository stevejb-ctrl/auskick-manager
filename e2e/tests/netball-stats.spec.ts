// NETBALL-05 — Netball stats dashboard renders 5 sections with per-
// position breakdown; AFL aggregator output does NOT leak when sport
// is netball.
//
// Setup pattern: seed a 4-quarter finalised netball game directly via
// admin client (writing lineup_set, quarter_start/end events, goal
// events with player_id, then flipping games.status to 'completed').
// Visit the stats route. Assert section headings + per-position
// breakdown + absence of AFL-only aggregator headings.
//
// Covers: src/app/(app)/teams/[teamId]/stats/page.tsx sport-branch
//         dispatch (line 109 `if (sport === 'netball')`); src/components/
//         dashboard/NetballDashboardShell.tsx 5-section render.
//
// ─── Plan 04-03 deviations from PLAN.md (Rule 1 — Bug) ─────────────
// The PLAN.md spec source had three latent bugs that would have made
// the spec render-pass but content-blind:
//
//   1. Plan used `type: "score"` with `metadata: { kind: "goal", side }`.
//      `replayNetballGameForStats` expects `type: "goal"` (team) and
//      `type: "opponent_goal"` (opponent). Score events would have been
//      ignored entirely, leaving `hasScoringData=false`. Fixed here:
//      use `goal` + `opponent_goal` directly.
//
//   2. Plan wrote `metadata: { lineup: { gs: [...], ga: [...], ... } }`.
//      `normaliseGenericLineup` reads `meta.lineup.positions`. Without
//      the `positions` wrapper, `meta.lineup.positions` was `undefined`
//      and the lineup never registered, leaving the playerStats roll-up
//      empty. Fixed here: nest position keys under a `positions: {}`
//      object plus an explicit `bench: []`.
//
// (See 04-03-SUMMARY.md §Deviations for the audit trail.)

import { test, expect } from "@playwright/test";
import { createAdminClient } from "../fixtures/supabase";
import { makeTeam, makePlayers, makeGame } from "../fixtures/factories";

test.describe.configure({ mode: "parallel" });

const NETBALL_LINEUP_KEYS = ["gs", "ga", "wa", "c", "wd", "gd", "gk"] as const;

async function seedFinalisedNetballGame(opts: { trackScoring: boolean }) {
  const admin = createAdminClient();
  const { data: superAdmin } = await admin.auth.admin.listUsers();
  const ownerId = superAdmin.users.find(
    (u) => u.email === process.env.TEST_SUPER_ADMIN_EMAIL,
  )!.id;

  const team = await makeTeam(admin, {
    ownerId,
    ageGroup: "go",
    sport: "netball",
    name: `NB-Stats-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
  });
  // Toggle track_scoring per opts. Default is false (migration 0003).
  await admin
    .from("teams")
    .update({ track_scoring: opts.trackScoring })
    .eq("id", team.id);

  // count:9 covers the 7 on-court positions plus 2 bench. ageGroup:"U10"
  // dodges the AGE_GROUPS["go"] absence (factory falls back to U10
  // defaultOnFieldSize for `count`, but we override `count` explicitly
  // anyway).
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

  // Build a 7-position netball lineup; bench the remaining players.
  // GenericLineup shape per src/lib/sports/netball/fairness.ts:24 — must
  // be `{ positions: { gs: [...] ... }, bench: [...] }`. Without the
  // `positions` wrapper, replayNetballGameForStats reads no lineup data.
  const positions: Record<string, string[]> = Object.fromEntries(
    NETBALL_LINEUP_KEYS.map((k, i) => [k, [players[i].id]]),
  );
  const bench = players.slice(NETBALL_LINEUP_KEYS.length).map((p) => p.id);
  const lineup = { positions, bench };

  // Backdate so Q1 < Q2 < Q3 < Q4 < now in created_at order — the
  // aggregator sorts by created_at ascending.
  const base = Date.now() - 60 * 60 * 1000; // 1 hour ago
  const ts = (offsetMin: number) =>
    new Date(base + offsetMin * 60_000).toISOString();

  // Goal events: track_scoring=true paths only. Use `goal` and
  // `opponent_goal` event types (not `score`) — that's what
  // replayNetballGameForStats reads.
  const events = [
    { type: "lineup_set", metadata: { lineup }, created_at: ts(0) },
    { type: "quarter_start", metadata: { quarter: 1 }, created_at: ts(1) },
    ...(opts.trackScoring
      ? [
          {
            type: "goal" as const,
            metadata: { quarter: 1 },
            player_id: players[0].id,
            created_at: ts(5),
          },
          {
            type: "opponent_goal" as const,
            metadata: { quarter: 1 },
            created_at: ts(6),
          },
        ]
      : []),
    { type: "quarter_end", metadata: { quarter: 1 }, created_at: ts(10) },
    { type: "quarter_start", metadata: { quarter: 2 }, created_at: ts(11) },
    { type: "quarter_end", metadata: { quarter: 2 }, created_at: ts(20) },
    { type: "quarter_start", metadata: { quarter: 3 }, created_at: ts(21) },
    { type: "quarter_end", metadata: { quarter: 3 }, created_at: ts(30) },
    { type: "quarter_start", metadata: { quarter: 4 }, created_at: ts(31) },
    { type: "quarter_end", metadata: { quarter: 4 }, created_at: ts(40) },
  ].map((e) => ({
    ...e,
    game_id: game.id,
    created_by: ownerId,
  }));

  const { error } = await admin.from("game_events").insert(events);
  if (error) throw new Error(`seedFinalisedNetballGame events: ${error.message}`);

  // Flip the game to completed so the season filter in stats/page.tsx
  // (line 99-101) includes it.
  await admin
    .from("games")
    .update({ status: "completed" })
    .eq("id", game.id);

  return { team, players, game, ownerId };
}

test("NETBALL-05: stats dashboard renders all 5 sections after a finalised netball game", async ({
  page,
}) => {
  const { team } = await seedFinalisedNetballGame({ trackScoring: true });
  await page.goto(`/teams/${team.id}/stats`);

  // Hit each of the 5 NetballDashboardShell section headings; if any
  // fails the dashboard is not rendering the netball shell or the
  // section ordering changed.
  const sectionTitles = [
    /player statistics/i,
    /minutes equity/i,
    /player chemistry/i,
    /head-to-head/i,
    /attendance/i,
  ];
  for (const re of sectionTitles) {
    await expect(page.getByRole("heading", { name: re })).toBeVisible({
      timeout: 10_000,
    });
  }

  // Per-position breakdown beneath the Attack column. With one game
  // played and the GS at lineup index 0, that player should accrue some
  // GS time, and NetballPlayerStatsTable renders a "GS NN%" line under
  // the third-percentage cell. Use a permissive regex — exact numerator
  // depends on quarter-length defaults and rounding.
  await expect(page.getByText(/GS \d+%/)).toBeVisible({ timeout: 5_000 });
});

test("NETBALL-05: stats dashboard does NOT render AFL aggregator headings", async ({
  page,
}) => {
  const { team } = await seedFinalisedNetballGame({ trackScoring: true });
  await page.goto(`/teams/${team.id}/stats`);

  // Confirm we hit the netball shell — netball-only heading present.
  await expect(
    page.getByRole("heading", { name: /player chemistry/i }),
  ).toBeVisible();

  // AFL aggregator section headings — none of these should render on a
  // netball team's stats page. (DashboardShell.tsx renders these for
  // AFL; NetballDashboardShell.tsx does not include them, and the
  // sport-branch dispatch at stats/page.tsx:109 routes netball → the
  // netball shell. If AFL output ever leaks here the dispatch broke.)
  // toHaveCount(0) over not.toBeVisible() — strictly asserts the
  // heading element doesn't exist at all (the role-query returns the
  // empty set). not.toBeVisible would also pass when the element is
  // present-but-hidden, which is not the contract here.
  await expect(
    page.getByRole("heading", { name: /winning combinations/i }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("heading", { name: /position fit/i }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("heading", { name: /quarter scoring/i }),
  ).toHaveCount(0);
});
