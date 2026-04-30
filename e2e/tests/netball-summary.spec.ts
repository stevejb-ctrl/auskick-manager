// NETBALL-06 — NetballGameSummaryCard renders copyable group-chat text
// after Q4 ends; track_scoring=false suppresses goal/result lines.
//
// Setup approach: seed events through Q4 + game_finalised (matching
// the seed pattern in netball-stats.spec.ts) and navigate to the live
// route. The page renders the summary card when replayNetballGame
// returns `state.finalised=true` (NetballLiveGame's finalised branch
// at NetballLiveGame.tsx:909) — which only flips on a `game_finalised`
// event in the events stream. Just `games.status='completed'` is
// NOT sufficient — that's a stats-page concern, not a live-page one.
//
// Per CONTEXT D-CONTEXT-track-scoring-matrix: both true and false
// branches asserted. The track_scoring=false case is RED until
// plan 04-04 threads the trackScoring prop through NetballLiveGame +
// NetballGameSummaryCard and applies the suppression — see the
// regression-test rule in CLAUDE.md ("Bug fixes must land with a
// regression test that fails against the pre-fix code").
//
// ─── Plan 04-03 deviations from PLAN.md (Rule 1 — Bug) ─────────────
// Three latent bugs in PLAN.md's source draft fixed inline. Same
// reasoning as netball-stats.spec.ts, plus a third specific to this
// file:
//
//   1. Plan used `type: "score"` with `metadata: { kind: "goal", side }`.
//      replayNetballGame at fairness.ts:690-700 reads `type: "goal"`
//      and `type: "opponent_goal"` directly. Score events are silently
//      dropped — both team and opponent stay at 0-0, which masks the
//      goal-rendering assertion entirely.
//
//   2. Plan wrote `metadata: { lineup: { gs: [...], ... } }`.
//      normaliseGenericLineup at fairness.ts:267 reads
//      `meta.lineup.positions`. Without the wrapper the lineup is
//      empty, the time accounting accrues no per-player ms, and the
//      `⏱ Game time` block at NetballGameSummaryCard.tsx:135 is
//      skipped.
//
//   3. Plan omitted any `game_finalised` event. The summary card
//      only renders when state.finalised=true, which fairness.ts:688
//      sets ONLY on `type: "game_finalised"`. Without it, the live
//      page falls through to the in-quarter / Q-break branches and
//      the `<NetballGameSummaryCard>` element is never mounted, so
//      the test would time out waiting for "Game summary".
//
// (See 04-03-SUMMARY.md §Deviations for the audit trail.)

import { test, expect } from "@playwright/test";
import { createAdminClient } from "../fixtures/supabase";
import { makeTeam, makePlayers, makeGame } from "../fixtures/factories";

test.describe.configure({ mode: "parallel" });

const NETBALL_LINEUP_KEYS = ["gs", "ga", "wa", "c", "wd", "gd", "gk"] as const;

async function seedFinalisedNetballGame(opts: { trackScoring: boolean }) {
  // Same seed shape as netball-stats.spec.ts — kept inline (not
  // extracted to a helper yet) so each spec is self-contained per
  // e2e/README.md "factories for setup, UI for the feature under test".
  // The helper case for this fixture will be carried into Phase 5
  // hygiene if a third spec re-uses the same shape.
  const admin = createAdminClient();
  const { data: superAdmin } = await admin.auth.admin.listUsers();
  const ownerId = superAdmin.users.find(
    (u) => u.email === process.env.TEST_SUPER_ADMIN_EMAIL,
  )!.id;

  const team = await makeTeam(admin, {
    ownerId,
    ageGroup: "go",
    sport: "netball",
    name: `NB-Sum-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
  });
  await admin
    .from("teams")
    .update({ track_scoring: opts.trackScoring })
    .eq("id", team.id);

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

  const positions: Record<string, string[]> = Object.fromEntries(
    NETBALL_LINEUP_KEYS.map((k, i) => [k, [players[i].id]]),
  );
  const bench = players.slice(NETBALL_LINEUP_KEYS.length).map((p) => p.id);
  const lineup = { positions, bench };

  const base = Date.now() - 60 * 60 * 1000;
  const ts = (m: number) => new Date(base + m * 60_000).toISOString();

  // Goal events use `goal` and `opponent_goal` types (not `score`) —
  // that's what replayNetballGame parses. Two team goals + one
  // opponent goal so the result line renders "team 2 def opp 1" under
  // track_scoring=true.
  const events = [
    { type: "lineup_set", metadata: { lineup }, created_at: ts(0) },
    { type: "quarter_start", metadata: { quarter: 1 }, created_at: ts(1) },
    ...(opts.trackScoring
      ? [
          {
            type: "goal" as const,
            metadata: { quarter: 1 },
            player_id: players[0].id,
            created_at: ts(3),
          },
          {
            type: "goal" as const,
            metadata: { quarter: 1 },
            player_id: players[1].id,
            created_at: ts(4),
          },
          {
            type: "opponent_goal" as const,
            metadata: { quarter: 1 },
            created_at: ts(5),
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
    // game_finalised flips state.finalised=true so the live page
    // mounts <NetballGameSummaryCard>. Without this event the summary
    // card simply never renders, regardless of games.status.
    { type: "game_finalised", metadata: {}, created_at: ts(41) },
  ].map((e) => ({
    ...e,
    game_id: game.id,
    created_by: ownerId,
  }));

  const { error } = await admin.from("game_events").insert(events);
  if (error) throw new Error(`seedFinalisedNetballGame: ${error.message}`);

  await admin
    .from("games")
    .update({ status: "completed" })
    .eq("id", game.id);
  return { team, players, game, ownerId };
}

test("NETBALL-06: track_scoring=true summary card renders result + goals + player list", async ({
  page,
}) => {
  const { team, game } = await seedFinalisedNetballGame({ trackScoring: true });

  // Suppress the netball walkthrough so it doesn't intercept clicks /
  // dim the summary card. Per CONTEXT D-CONTEXT-walkthrough-localStorage-
  // cleanup the spec sets the persisted flag rather than clearing it
  // because here we want to bypass the modal entirely (this spec is
  // about the summary surface, NOT walkthrough behaviour — that lives
  // in netball-walkthrough.spec.ts from plan 04-02).
  await page.addInitScript(() => {
    try {
      localStorage.setItem("nb-walkthrough-seen", "1");
    } catch {
      // ignore — sandboxed contexts can throw on localStorage access
    }
  });

  await page.goto(`/teams/${team.id}/games/${game.id}/live`);

  // Summary card heading + copy button.
  await expect(
    page.getByRole("heading", { name: /game summary/i }),
  ).toBeVisible({ timeout: 10_000 });
  await expect(
    page.getByRole("button", { name: /copy for group chat/i }),
  ).toBeVisible();

  // Body text is rendered inside the <pre id="netball-game-summary-text">
  // node — match content directly against it.
  const summaryText = page.locator("#netball-game-summary-text");
  await expect(summaryText).toBeVisible();
  await expect(summaryText).toContainText("🏐 Full time");
  // Result line: home team scored 2 goals, opponent scored 1 → "def".
  await expect(summaryText).toContainText(/def\s+/i);
  // Goals line shows the scorers (player_id-attributed only).
  await expect(summaryText).toContainText(/🥅 Goals:/);
  // Player count line — at least one player accrued ≥1s on court.
  await expect(summaryText).toContainText(/👟 \d+ players?/);
  // Game-time block heading + at least one per-player row.
  await expect(summaryText).toContainText(/⏱ Game time/);
});

test("NETBALL-06: track_scoring=false summary card omits result and goals lines", async ({
  page,
}) => {
  // EXPECTED RED until plan 04-04 threads `trackScoring` into the
  // summary card and conditionally suppresses the result + goals
  // lines. Per CLAUDE.md "Bug fixes must land with a regression test
  // that fails against the pre-fix code." Today the buildSummary
  // function in NetballGameSummaryCard.tsx (line 73-101) gates the
  // result-line on score values, NOT on track_scoring — when both
  // sides are 0-0 it still emits "{team} 0 drew with {opp} 0". Plan
  // 04-04 is the source fix; this is the regression that goes RED →
  // GREEN.
  //
  // Three substring assertions (def / drew with / 🥅) cover the full
  // output space of the result + goals lines. If any of the three
  // appears, suppression failed.

  const { team, game } = await seedFinalisedNetballGame({
    trackScoring: false,
  });
  await page.addInitScript(() => {
    try {
      localStorage.setItem("nb-walkthrough-seen", "1");
    } catch {
      // ignore
    }
  });
  await page.goto(`/teams/${team.id}/games/${game.id}/live`);

  await expect(
    page.getByRole("heading", { name: /game summary/i }),
  ).toBeVisible({ timeout: 10_000 });
  const summaryText = page.locator("#netball-game-summary-text");
  await expect(summaryText).toBeVisible();

  // Acceptance gate: result + goals lines suppressed. No "def {N}",
  // no "drew with", no "🥅 Goals:" substring anywhere in the body.
  const text = (await summaryText.textContent()) ?? "";
  expect(text).not.toMatch(/def\s+\w/i);
  expect(text).not.toMatch(/drew with/i);
  expect(text).not.toContain("🥅");

  // Time + player count blocks remain — track_scoring=false suppresses
  // SCORING, but per-player game time is universal.
  await expect(summaryText).toContainText(/⏱ Game time/);
  await expect(summaryText).toContainText(/👟 \d+ players?/);
});
