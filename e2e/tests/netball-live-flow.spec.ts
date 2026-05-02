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
 *
 * Also inserts game_availability rows for every passed playerId
 * (status='available'). NetballLiveGame's replacementCandidates
 * filter (NetballLiveGame.tsx:789-810) requires bench players to be
 * in availableIds — which is sourced from game_availability, NOT
 * lineup.bench. Without this, the PickReplacementSheet would render
 * "No bench players available — your squad is fully deployed" even
 * though the bench-strip clearly shows Harvey and Ingrid.
 */
async function seedQ1InProgress(opts: {
  admin: ReturnType<typeof createAdminClient>;
  gameId: string;
  ownerId: string;
  playerIds: string[];
  quarterStartOffsetSec?: number;
  /**
   * If true (default), also writes game_availability rows for each
   * playerId. Set false when the test specifically wants to control
   * availability (e.g., the late-arrival test that pre-inserts only
   * the first 8 players' availability rows).
   */
  seedAvailability?: boolean;
}) {
  const {
    admin,
    gameId,
    ownerId,
    playerIds,
    quarterStartOffsetSec = 60,
    seedAvailability = true,
  } = opts;

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

  if (seedAvailability && playerIds.length > 0) {
    await admin.from("game_availability").insert(
      playerIds.map((pid) => ({
        game_id: gameId,
        player_id: pid,
        status: "available",
      })),
    );
  }

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
  // the CTA directly. We deliberately avoid an `.or(...)` fallback
  // against picker chrome copy ("Auto-suggested starting lineup")
  // because Playwright strict-mode flags the unioned locator when
  // both branches resolve simultaneously — the button is the
  // canonical entry-point assertion for this state.
  await expect(
    page.getByRole("button", { name: /^start game$/i }),
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

test("NETBALL-01: Start Q1 surfaces the await-kickoff modal — quarter_start is deferred to the modal CTA", async ({
  page,
}) => {
  // The "Start Q1" button no longer writes quarter_start directly.
  // Tap it, the await-kickoff modal opens, and only the modal's CTA
  // commits the server event so the umpire's whistle (not the lineup
  // tap) decides when the clock kicks off. Mirrors AFL's modal-gated
  // pattern.
  const { team, game, players, admin, ownerId } = await setupNetballTeam({ trackScoring: true });

  // Seed pre-Q1 directly: a lineup_set event puts NetballLiveGame
  // into the `currentQuarter === 0 && !quarterEnded` branch (the
  // pre-Q1 picker with the "Start Q1" button). NO quarter_start yet.
  // Mirrors seedQ1InProgress's lineup shape minus the quarter_start.
  const positions: Record<string, string[]> = Object.fromEntries(
    NETBALL_LINEUP_KEYS.map((k, i) => [k, [players[i].id]]),
  );
  const bench = players.slice(NETBALL_LINEUP_KEYS.length).map((p) => p.id);
  await admin.from("game_availability").insert(
    players.map((p) => ({
      game_id: game.id,
      player_id: p.id,
      status: "available" as const,
    })),
  );
  await admin.from("game_events").insert({
    game_id: game.id,
    type: "lineup_set",
    metadata: { lineup: { positions, bench } },
    created_by: ownerId,
  });
  await admin.from("games").update({ status: "in_progress" }).eq("id", game.id);

  await suppressWalkthrough(page);
  await page.goto(`/teams/${team.id}/games/${game.id}/live`);

  // First tap on the page-level "Start Q1" button — only one in
  // the DOM at this point.
  const startQ1Initial = page.getByRole("button", { name: /^start q1$/i }).first();
  await expect(startQ1Initial).toBeVisible({ timeout: 10_000 });
  await startQ1Initial.click();

  // The modal renders "Ready for Q1". Pre-modal-feature, the button
  // would have fired startNetballQuarter directly and the page would
  // already be in LIVE state; the heading would never appear.
  await expect(
    page.getByRole("heading", { name: /^ready for q1$/i }),
  ).toBeVisible({ timeout: 2_000 });

  // No quarter_start event yet — the modal must be tapped first.
  await page.waitForTimeout(500);
  const { data: preEvents } = await admin
    .from("game_events")
    .select("type")
    .eq("game_id", game.id)
    .eq("type", "quarter_start");
  expect(preEvents ?? []).toHaveLength(0);

  // Tap the modal's CTA. Two buttons in the DOM share the
  // accessible name "Start Q1" (the page-level pre-Q1 button still
  // mounted underneath, occluded by the modal overlay; and the
  // modal's CTA on top). The modal renders later in DOM order, so
  // .last() picks the modal one.
  await page.getByRole("button", { name: /^start q1$/i }).last().click();

  // quarter_start lands now.
  await expect
    .poll(
      async () => {
        const { data } = await admin
          .from("game_events")
          .select("type, metadata")
          .eq("game_id", game.id)
          .eq("type", "quarter_start");
        return (data ?? []).filter(
          (e) => (e.metadata as { quarter?: number } | null)?.quarter === 1,
        ).length;
      },
      { timeout: 5_000, intervals: [200, 200, 500, 500, 1000] },
    )
    .toBe(1);
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

// ─── NETBALL-03: goal scoring flow ─────────────────────────

test("NETBALL-03: tapping GS opens confirm sheet, confirming records goal + 8s undo toast", async ({
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

  // GS = players[0] per NETBALL_LINEUP_KEYS index 0. PositionToken
  // (PositionToken.tsx:84+157) resolves `pos.label` via
  // netballSport.allPositions.find(...).label — for "gs" that's the
  // FULL name "Goal Shooter" (not the "GS" shortLabel). So the
  // court-tile aria-label is "Goal Shooter, ${playerName}", which
  // also nicely disambiguates from the bench tile
  // (NetballBenchStrip aria-label = "${name} (${status})").
  const gsPlayer = players[0];
  await page
    .getByRole("button", {
      name: new RegExp(`^Goal Shooter,\\s*${gsPlayer.full_name}`, "i"),
    })
    .click();

  // The pendingGoal confirm sheet renders a "+ Goal" CTA at
  // NetballLiveGame.tsx:1309. Match it directly; tolerate "Record
  // goal" / "Confirm goal" copy variants in case the button text
  // is ever softened.
  await page
    .getByRole("button", { name: /^(\+\s*goal|record goal|confirm goal)$/i })
    .click({ timeout: 5_000 });

  // DB-poll for the goal event with player_id set. Rule-1 spec
  // authoring fix: netball uses event type "goal" (not "score") —
  // see netball-actions.ts:221 (insertEvent(..., "goal", ...)) and
  // the replay engine at netball/fairness.ts:690. AFL also uses
  // "goal" so this matches live-scoring.spec.ts's pattern.
  await expect
    .poll(
      async () => {
        const { data } = await admin
          .from("game_events")
          .select("type, player_id")
          .eq("game_id", game.id)
          .eq("type", "goal")
          .eq("player_id", gsPlayer.id);
        return (data ?? []).length;
      },
      { timeout: 5_000, intervals: [200, 200, 500, 500, 1000] },
    )
    .toBeGreaterThanOrEqual(1);

  // 8-second undo toast — locate the Undo button while the toast is
  // still visible (well within the 8s window).
  await expect(
    page.getByRole("button", { name: /^undo$/i }),
  ).toBeVisible({ timeout: 2_000 });
});

test("NETBALL-03: undo writes score_undo event after a goal", async ({ page }) => {
  const { team, game, players, admin, ownerId } = await setupNetballTeam({ trackScoring: true });
  await seedQ1InProgress({
    admin,
    gameId: game.id,
    ownerId,
    playerIds: players.map((p) => p.id),
  });
  await suppressWalkthrough(page);
  await page.goto(`/teams/${team.id}/games/${game.id}/live`);

  const gsPlayer = players[0];
  await page
    .getByRole("button", {
      name: new RegExp(`^Goal Shooter,\\s*${gsPlayer.full_name}`, "i"),
    })
    .click();
  await page
    .getByRole("button", { name: /^(\+\s*goal|record goal|confirm goal)$/i })
    .click({ timeout: 5_000 });
  // Wait for the goal event to land before clicking Undo so the
  // server-side state is consistent — the LIFO undo stack pops the
  // last "goal", and popping a not-yet-persisted goal would no-op.
  await expect
    .poll(
      async () => {
        const { data } = await admin
          .from("game_events")
          .select("type")
          .eq("game_id", game.id)
          .eq("type", "goal")
          .eq("player_id", gsPlayer.id);
        return (data ?? []).length;
      },
      { timeout: 5_000, intervals: [200, 200, 500, 500, 1000] },
    )
    .toBeGreaterThanOrEqual(1);
  // Tap Undo before the 8s toast fades (it stays as a persistent
  // chip after fading too, but tapping while visible mirrors the
  // typical coach flow + the AFL live-scoring.spec.ts pattern).
  await page
    .getByRole("button", { name: /^undo$/i })
    .click({ timeout: 7_000 });

  // score_undo event must land — same shape as
  // live-scoring.spec.ts:184-195.
  await expect
    .poll(
      async () => {
        const { data } = await admin
          .from("game_events")
          .select("type")
          .eq("game_id", game.id)
          .eq("type", "score_undo");
        return (data ?? []).length;
      },
      { timeout: 5_000, intervals: [200, 200, 500, 500, 1000] },
    )
    .toBeGreaterThanOrEqual(1);
});

test("NETBALL-03: scorebug + GS chip update after a goal without manual refresh", async ({
  page,
}) => {
  // Regression: recordNetballGoal / recordNetballOpponentGoal /
  // undoNetballScore inserted the event but neither revalidated the
  // server-rendered events list nor refreshed the router on the
  // client. NetballLiveGame derives the scorebug team total and the
  // PositionToken goal chip from `playerGoals` / `teamScore` props
  // computed by replayNetballGame on the server — so without a
  // refresh, both stayed at zero until a manual reload, even though
  // the goal event was correctly persisted. Same shape as the AFL
  // fix in 96d5edd (Plan 05-04 → Phase 7) — the netball score
  // actions were missed by that pass.
  const { team, game, players, admin, ownerId } = await setupNetballTeam({ trackScoring: true });
  await seedQ1InProgress({
    admin,
    gameId: game.id,
    ownerId,
    playerIds: players.map((p) => p.id),
  });
  await suppressWalkthrough(page);
  await page.goto(`/teams/${team.id}/games/${game.id}/live`);

  const gsPlayer = players[0];
  await page
    .getByRole("button", {
      name: new RegExp(`^Goal Shooter,\\s*${gsPlayer.full_name}`, "i"),
    })
    .click();
  await page
    .getByRole("button", { name: /^(\+\s*goal|record goal|confirm goal)$/i })
    .click({ timeout: 5_000 });

  // PositionToken renders a chip with aria-label "1 goal" when the
  // player's playerGoals count hits 1 (PositionToken.tsx:162-167).
  // Pre-fix, playerGoals stays empty and the chip never renders, so
  // this assertion fails red within the timeout.
  await expect(
    page.getByLabel(/^1 goal$/i),
  ).toBeVisible({ timeout: 3_000 });

  // The scorebug's team-total integer renders inside a 36px span.
  // Pre-fix, team.goals stays 0 and "1" never appears in that span.
  // Post-fix, the integer flips to "1" once router.refresh() lands.
  // Use a class-based locator so the team name (which can also
  // contain digits in the test factory's "NB-LF-{ts}-{rand}" naming)
  // doesn't accidentally match.
  await expect(
    page
      .locator('span.text-\\[36px\\]')
      .filter({ hasText: /^1$/ }),
  ).toBeVisible({ timeout: 3_000 });
});

// ─── NETBALL-08: long-press, replacement, late-arrival ────

test("NETBALL-08: long-press on a court player opens NetballPlayerActions modal", async ({
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

  // Long-press = pointerdown, hold ≥500ms, pointerup. PositionToken
  // wires `onPointerDown` → 500ms setTimeout → `onLongPress` (see
  // PositionToken.tsx:90-99); same pattern as AFL's PlayerTile. The
  // `click({ delay })` form holds the (mouse-derived) pointer down
  // for the specified ms before releasing — 600ms blows past the
  // 500ms threshold and triggers onLongPress. Mirrors the proven
  // pattern at e2e/tests/injury-replacement.spec.ts:85-87.
  await page
    .getByRole("button", {
      name: new RegExp(`^Goal Shooter,\\s*${players[0].full_name}`, "i"),
    })
    .click({ delay: 600 });

  // NetballPlayerActions modal: role="dialog" with
  // aria-labelledby="netball-actions-title" (the player name +
  // position label). The three primary actions ("Mark injured",
  // "Lend to opposition", "Keep at GS next break") are in the modal.
  await expect(page.getByRole("dialog")).toBeVisible({ timeout: 5_000 });
  await expect(
    page.getByRole("button", { name: /mark injured/i }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: /lend to opposition/i }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: /keep at .* next break/i }),
  ).toBeVisible();
});

test("NETBALL-08: marking a court player injured prompts replacement and writes injury event", async ({
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

  // Open the actions modal for GS via long-press, then mark
  // injured. Long-press via `click({ delay: 600 })` per the
  // injury-replacement.spec.ts pattern (600ms > 500ms threshold).
  await page
    .getByRole("button", {
      name: new RegExp(`^Goal Shooter,\\s*${players[0].full_name}`, "i"),
    })
    .click({ delay: 600 });
  await page.getByRole("button", { name: /mark injured/i }).click();

  // PickReplacementSheet renders role="dialog" with
  // aria-labelledby="replace-title" ("<vacating> → GS"). Bench
  // candidates (players[7], players[8]) are listed within the
  // dialog. Scope candidate-button lookups to the dialog so they
  // don't accidentally target the bench-strip tile underneath.
  const replaceDialog = page.getByRole("dialog");
  await expect(replaceDialog).toBeVisible({ timeout: 5_000 });
  // Header copy includes the vacating player + the position label
  // ("Goal Shooter" — PickReplacementSheet.tsx:41 uses pos.label).
  // Format: "${vacatingPlayerName} → Goal Shooter".
  await expect(
    replaceDialog.getByText(
      new RegExp(`${players[0].full_name}.*Goal Shooter|→\\s*Goal Shooter`, "i"),
    ),
  ).toBeVisible();

  // Pick the first bench player. The candidate buttons in
  // PickReplacementSheet render the player's full_name as their
  // accessible text (no aria-label), so getByRole('button', name)
  // matches via accessible-text.
  const benchPlayer = players[7];
  await replaceDialog
    .getByRole("button", { name: new RegExp(`^${benchPlayer.full_name}$`, "i") })
    .click({ timeout: 5_000 });

  // injury event landed (markInjury server action writes
  // type='injury' with metadata.injured=true).
  await expect
    .poll(
      async () => {
        const { data } = await admin
          .from("game_events")
          .select("type, player_id")
          .eq("game_id", game.id)
          .eq("type", "injury")
          .eq("player_id", players[0].id);
        return (data ?? []).length;
      },
      { timeout: 5_000, intervals: [200, 200, 500, 500, 1000] },
    )
    .toBeGreaterThanOrEqual(1);
});

test("NETBALL-08: late arrival adds a previously-unavailable squad member and writes player_arrived event", async ({
  page,
}) => {
  // A "late arrival" candidate is a squad member NOT in
  // game_availability and NOT in lineup.bench. Setup:
  //   - 9 players exist
  //   - players[0..7] (8 players) are marked available
  //   - lineup uses players[0..6] on court + players[7] on bench
  //   - players[8] is NOT in availability, NOT in lineup → eligible
  const { team, game, players, admin, ownerId } = await setupNetballTeam({ trackScoring: true });

  // Mark 8 players available pre-game (players[0..7]); players[8]
  // stays NOT-available so they qualify as a late-arrival candidate
  // (NetballLiveGame.tsx:735-744 candidate filter).
  const availableIds = players.slice(0, 8).map((p) => p.id);
  await admin.from("game_availability").insert(
    availableIds.map((pid) => ({
      game_id: game.id,
      player_id: pid,
      status: "available",
    })),
  );

  // Seed Q1 with only players[0..7] in the lineup (court + 1 bench).
  // Pass seedAvailability:false because this test pre-inserted exactly
  // 8 game_availability rows above; reseeding would either insert
  // duplicates (PK conflict) or unintentionally make players[8]
  // available, breaking the late-arrival precondition.
  await seedQ1InProgress({
    admin,
    gameId: game.id,
    ownerId,
    playerIds: players.slice(0, 8).map((p) => p.id),
    seedAvailability: false,
  });

  await suppressWalkthrough(page);
  await page.goto(`/teams/${team.id}/games/${game.id}/live`);

  // LateArrivalMenu renders "+ Add late arrival" only when
  // candidates exist (LateArrivalMenu.tsx:23).
  await page
    .getByRole("button", { name: /add late arrival/i })
    .click({ timeout: 10_000 });

  // After expand, the menu lists candidates by full_name. players[8]
  // should be the only candidate (everyone else is on court / bench /
  // available).
  const latePlayer = players[8];
  await page
    .getByRole("button", { name: new RegExp(`^${latePlayer.full_name}$`, "i") })
    .click({ timeout: 5_000 });

  // player_arrived event must land with player_id = late player.
  await expect
    .poll(
      async () => {
        const { data } = await admin
          .from("game_events")
          .select("type, player_id")
          .eq("game_id", game.id)
          .eq("type", "player_arrived")
          .eq("player_id", latePlayer.id);
        return (data ?? []).length;
      },
      { timeout: 5_000, intervals: [200, 200, 500, 500, 1000] },
    )
    .toBeGreaterThanOrEqual(1);
});

// ─── ABSTRACT-03: quarter-length override ─────────────────
//
// Both tests below verify ABSTRACT-03's quarterMs threading by
// asserting the auto-hooter fires at the CORRECT override-derived
// elapsed time (not the 10-min "go" age-group default). The hooter
// itself is the useEffect at NetballLiveGame.tsx:206-222: when
// `remainingMs <= 0`, it fires `endNetballQuarter` server-side once.
//
// Spec-side note on revalidation: endNetballQuarter writes the
// `quarter_end` event to the DB but does NOT revalidatePath for
// non-final quarters (only Q4 finalise revalidates). In real coach
// use the page rerenders eventually via Next.js router prefetch /
// the next user interaction, but in a Playwright spec we observe
// the server side directly: poll the DB for the quarter_end event,
// THEN reload the page to pick up the post-hooter replay state and
// assert the Q-break shell mounts. This is a spec-side observation
// pattern, not a source workaround.

test("ABSTRACT-03: team.quarter_length_seconds=480 fires the auto-hooter at the overridden 8-minute mark", async ({
  page,
}) => {
  // 8 min = 480s. Backdate quarter_start to 9 min ago so by mount
  // time we're already past the override hooter.
  const { team, game, players, admin, ownerId } = await setupNetballTeam({
    trackScoring: false, // simplifies the score-bug DOM; not relevant to the hooter
    teamQuarterLengthSeconds: 480,
  });
  await seedQ1InProgress({
    admin,
    gameId: game.id,
    ownerId,
    playerIds: players.map((p) => p.id),
    quarterStartOffsetSec: 9 * 60,
  });

  await suppressWalkthrough(page);
  await page.goto(`/teams/${team.id}/games/${game.id}/live`);

  // Wait for the auto-hooter to write the `quarter_end` event for
  // Q1. If the override wasn't honoured (default 10-min "go"
  // period), 9 min would still be inside the quarter and the
  // hooter useEffect's `remainingMs > 0` early-return would skip
  // the write — this poll would time out and the test would fail.
  await expect
    .poll(
      async () => {
        const { data } = await admin
          .from("game_events")
          .select("type, metadata")
          .eq("game_id", game.id)
          .eq("type", "quarter_end");
        return (data ?? []).some(
          (e) => (e.metadata as { quarter?: number } | null)?.quarter === 1,
        );
      },
      { timeout: 10_000, intervals: [200, 500, 500, 1000, 1000] },
    )
    .toBe(true);

  // Plan 05-04 wired router.refresh() into NetballLiveGame's auto-hooter
  // useEffect after endNetballQuarter resolves; the page now self-rerenders
  // into the Q-break shell. NO page.reload() needed. (Pre-Plan-05-04, the
  // spec used await page.reload() here.) Netball's quarter_end →
  // quarterEnded path renders the Q-break shell (NetballLiveGame.tsx:986-1054)
  // — there's NO intermediate "Select team for Q2" modal (AFL-only, from
  // QuarterEndModal.tsx). Assert one of the two Q-break CTAs is visible:
  // "Start Q2" or "Apply suggested reshuffle".
  await expect(
    page.getByRole("button", { name: /start q2|apply suggested reshuffle/i }).first(),
  ).toBeVisible({ timeout: 10_000 });
});

test("ABSTRACT-03: game.quarter_length_seconds=360 OVERRIDES team.quarter_length_seconds via the priority chain", async ({
  page,
}) => {
  // game (6 min) > team (null) > ageGroup default (10 min for "go").
  // Backdate Q1 by 7 min — past the 6-min game override but inside
  // the 10-min ageGroup default. If priority chain were broken
  // (ageGroup default won), the hooter wouldn't fire and the
  // quarter_end DB-poll would time out. Pinpoints the
  // game-wins-over-team semantic at
  // src/lib/sports/index.ts:35-39 (getEffectiveQuarterSeconds).
  const { team, game, players, admin, ownerId } = await setupNetballTeam({
    trackScoring: false,
    teamQuarterLengthSeconds: null, // explicit null → fall through to game/age
    gameQuarterLengthSeconds: 360,
  });
  await seedQ1InProgress({
    admin,
    gameId: game.id,
    ownerId,
    playerIds: players.map((p) => p.id),
    quarterStartOffsetSec: 7 * 60,
  });

  await suppressWalkthrough(page);
  await page.goto(`/teams/${team.id}/games/${game.id}/live`);

  await expect
    .poll(
      async () => {
        const { data } = await admin
          .from("game_events")
          .select("type, metadata")
          .eq("game_id", game.id)
          .eq("type", "quarter_end");
        return (data ?? []).some(
          (e) => (e.metadata as { quarter?: number } | null)?.quarter === 1,
        );
      },
      { timeout: 10_000, intervals: [200, 500, 500, 1000, 1000] },
    )
    .toBe(true);

  // Plan 05-04: router.refresh() in NetballLiveGame's auto-hooter effect
  // means no page.reload() is needed; the Q-break shell auto-renders.
  await expect(
    page.getByRole("button", { name: /start q2|apply suggested reshuffle/i }).first(),
  ).toBeVisible({ timeout: 10_000 });
});
