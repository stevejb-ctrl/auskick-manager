// NETBALL-01 / NETBALL-03 / NETBALL-04 (live shell mirror) /
// NETBALL-08 / ABSTRACT-03 — Heaviest Phase 4 netball spec.
//
// One spec file by design (per Phase 4 CONTEXT
// D-CONTEXT-test-coverage-scope): the netball live shell is the most
// fragile surface in the merged trunk per Phase 3 CONCERNS.md, and
// scattering similar Q-start / goal / replacement setup across
// multiple specs costs more than it saves. Tests in this file are
// independent (each creates its own team + game), so they're
// parallel-safe within Playwright workers.
//
// Setup pattern: factory creates team + 9 players + game; admin
// client flips track_scoring + (optionally) quarter_length_seconds
// on the team row; events are seeded directly to the desired state
// (lineup_set only, OR lineup_set + Q1 in progress, OR lineup_set +
// Q4-end pending); then the spec drives the UI for the feature
// under test.
//
// Walkthrough modal is suppressed in every test by setting
// `nb-walkthrough-seen=1` via addInitScript before goto. The
// walkthrough itself is covered by netball-walkthrough.spec.ts.

import { test, expect } from "@playwright/test";
import { createAdminClient } from "../fixtures/supabase";
import { makeTeam, makePlayers, makeGame } from "../fixtures/factories";

test.describe.configure({ mode: "parallel" });

// Position keys for a netball "go" lineup, in the order the seed
// helper assigns players[0..6]. GS at index 0 means players[0] is
// always the GS — which the NETBALL-03 goal-flow tests rely on for
// the court-tile aria-label regex.
const NETBALL_LINEUP_KEYS = ["gs", "ga", "wa", "c", "wd", "gd", "gk"] as const;

interface SetupOpts {
  trackScoring: boolean;
  /**
   * `team.quarter_length_seconds`. `undefined` means "leave whatever
   * makeTeam wrote" (typically `null`); explicit `null` writes a
   * `null` so the resolution falls back to game.quarter_length_seconds
   * or ageGroup.periodSeconds; a number writes that override.
   */
  teamQuarterLengthSeconds?: number | null;
  /**
   * `games.quarter_length_seconds`. `undefined` means "leave the
   * factory default" (`null`); a number writes a per-game override
   * that wins over team + ageGroup per ABSTRACT-03's priority chain.
   */
  gameQuarterLengthSeconds?: number | null;
}

interface SetupResult {
  team: { id: string; name: string; ageGroup: string };
  players: Array<{ id: string; full_name: string; jersey_number: number }>;
  game: { id: string; on_field_size: number; share_token: string };
  ownerId: string;
  admin: ReturnType<typeof createAdminClient>;
}

async function setupNetballTeam(opts: SetupOpts): Promise<SetupResult> {
  const admin = createAdminClient();
  const { data: superAdmin } = await admin.auth.admin.listUsers();
  const ownerId = superAdmin.users.find(
    (u) => u.email === process.env.TEST_SUPER_ADMIN_EMAIL,
  )!.id;

  const team = await makeTeam(admin, {
    ownerId,
    ageGroup: "go",
    sport: "netball",
    name: `NB-LF-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
  });

  // Apply track_scoring + optional team quarter_length_seconds in a
  // single update. Using `undefined` means "don't touch this column".
  const teamUpdate: { track_scoring: boolean; quarter_length_seconds?: number | null } = {
    track_scoring: opts.trackScoring,
  };
  if (opts.teamQuarterLengthSeconds !== undefined) {
    teamUpdate.quarter_length_seconds = opts.teamQuarterLengthSeconds;
  }
  await admin.from("teams").update(teamUpdate).eq("id", team.id);

  // Netball "go" lineup uses 7 positions; we want a small bench so
  // late-arrival + replacement candidates exist. Pass count:9 so
  // players[7] + players[8] are bench/late-arrival fodder. ageGroup:
  // "U10" is required because factories.makePlayers' default-count
  // path looks up AGE_GROUPS[ageGroup], and "go" doesn't exist there
  // (AGE_GROUPS is AFL-shaped). When count is provided explicitly
  // the lookup is skipped, but we keep "U10" for robustness.
  const players = await makePlayers(admin, {
    teamId: team.id,
    ownerId,
    count: 9,
    ageGroup: "U10",
  });

  const game = await makeGame(admin, { teamId: team.id, ownerId, ageGroup: "U10" });
  if (opts.gameQuarterLengthSeconds !== undefined) {
    await admin
      .from("games")
      .update({ quarter_length_seconds: opts.gameQuarterLengthSeconds })
      .eq("id", game.id);
  }

  return { team, players, game, ownerId, admin };
}

/**
 * Seeds events for "Q1 in progress, no score yet". Mid-quarter
 * tests (long-press, replacement, late-arrival) start from this
 * state. `quarterStartOffsetSec` controls how recent the
 * quarter_start was — default 60 seconds ago, leaves plenty of time
 * before the auto-hooter fires for non-overridden quarter lengths
 * (default netball "go" period is 10 min = 600s).
 */
async function seedQ1InProgress(opts: {
  admin: ReturnType<typeof createAdminClient>;
  gameId: string;
  ownerId: string;
  playerIds: string[];
  quarterStartOffsetSec?: number;
}) {
  const { admin, gameId, ownerId, playerIds, quarterStartOffsetSec = 60 } = opts;

  // Netball lineup shape (GenericLineup): metadata.lineup =
  // { positions: { gs: [...], ga: [...], ... }, bench: [...] }.
  // First 7 players go on court, the rest bench. The replay engine
  // (replayNetballGame) reads this shape directly to populate
  // initialLineup / onCourt — see netball-actions.ts.
  const positions: Record<string, string[]> = Object.fromEntries(
    NETBALL_LINEUP_KEYS.map((k, i) => [k, [playerIds[i]]]),
  );
  const bench = playerIds.slice(NETBALL_LINEUP_KEYS.length);
  const lineup = { positions, bench };

  const startedAt = new Date(Date.now() - quarterStartOffsetSec * 1000).toISOString();
  await admin.from("game_events").insert([
    {
      game_id: gameId,
      type: "lineup_set",
      metadata: { lineup },
      created_by: ownerId,
      created_at: startedAt,
    },
    {
      game_id: gameId,
      type: "quarter_start",
      metadata: { quarter: 1 },
      created_by: ownerId,
      created_at: startedAt,
    },
  ]);
  await admin.from("games").update({ status: "in_progress" }).eq("id", gameId);
}

/**
 * Suppress the netball walkthrough modal so tests don't have to
 * dismiss it before driving the live shell. Mirrors the AFL
 * walkthrough localStorage handshake pattern. The walkthrough itself
 * is covered by netball-walkthrough.spec.ts.
 */
async function suppressWalkthrough(page: import("@playwright/test").Page) {
  await page.addInitScript(() => {
    try {
      localStorage.setItem("nb-walkthrough-seen", "1");
    } catch {}
  });
}

// ─── NETBALL-01: state machine ─────────────────────────────

test("NETBALL-01: pre-kickoff renders the netball lineup picker (six-state machine entry)", async ({
  page,
}) => {
  const { team, game } = await setupNetballTeam({ trackScoring: true });
  await suppressWalkthrough(page);
  await page.goto(`/teams/${team.id}/games/${game.id}/live`);

  // Pre-kickoff branch of NetballLiveGame renders NetballLineupPicker
  // with confirmLabel="Start game" (NetballLiveGame.tsx:926). Match
  // the CTA directly; fall back to picker chrome copy in case the
  // confirm-button copy ever changes.
  await expect(
    page
      .getByRole("button", { name: /start game/i })
      .or(page.getByText(/lineup|starting lineup/i).first()),
  ).toBeVisible({ timeout: 10_000 });
});

test("NETBALL-01: live state renders score bug + court + opponent name when Q1 is in progress", async ({
  page,
}) => {
  const { team, game, players, admin, ownerId } = await setupNetballTeam({ trackScoring: true });
  await seedQ1InProgress({
    admin,
    gameId: game.id,
    ownerId,
    playerIds: players.map((p) => p.id),
  });
  await suppressWalkthrough(page);
  await page.goto(`/teams/${team.id}/games/${game.id}/live`);

  // The score-bug Q1 label and the opponent name (factories.makeGame
  // default = "Test Opponent") must both render once we're in the
  // live state. Pin both so a silent header-strip regression surfaces
  // here (the CountdownClock pill text "Q1" lives inside
  // NetballScoreBug, NetballLiveGame.tsx:1149).
  await expect(page.getByText(/^q1\b/i).first()).toBeVisible({ timeout: 10_000 });
  await expect(page.getByText(/test opponent/i).first()).toBeVisible();
});

// ─── NETBALL-04: live-shell suppression mirror ────────────

test("NETBALL-04 (live-shell): track_scoring=true shows +G button in score bug", async ({
  page,
}) => {
  const { team, game, players, admin, ownerId } = await setupNetballTeam({ trackScoring: true });
  await seedQ1InProgress({
    admin,
    gameId: game.id,
    ownerId,
    playerIds: players.map((p) => p.id),
  });
  await suppressWalkthrough(page);
  await page.goto(`/teams/${team.id}/games/${game.id}/live`);

  await expect(
    page.getByRole("button", { name: /record opponent goal/i }),
  ).toBeVisible({ timeout: 10_000 });
});

test("NETBALL-04 (live-shell): track_scoring=false hides +G button in score bug", async ({
  page,
}) => {
  const { team, game, players, admin, ownerId } = await setupNetballTeam({ trackScoring: false });
  await seedQ1InProgress({
    admin,
    gameId: game.id,
    ownerId,
    playerIds: players.map((p) => p.id),
  });
  await suppressWalkthrough(page);
  await page.goto(`/teams/${team.id}/games/${game.id}/live`);

  // Confirm Q1 mounted first so a missing +G is real suppression,
  // not a still-loading shell.
  await expect(page.getByText(/^q1\b/i).first()).toBeVisible({ timeout: 10_000 });
  // Plan 04-04 wired track_scoring through to the +G button. With
  // it false, the button must NOT be in the DOM (NetballLiveGame
  // passes onOpponentGoal=undefined and NetballScoreBug's
  // `{onOpponentGoal && (...)}` branch hides the affordance).
  await expect(
    page.getByRole("button", { name: /record opponent goal/i }),
  ).toHaveCount(0);
});
