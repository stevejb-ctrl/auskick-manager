// ─── Netball full-game playthrough ─────────────────────────────
// Mirrors the AFL playthrough at full-game-playthrough.spec.ts —
// same ship-readiness regression net, but exercising NetballLiveGame,
// NetballQuarterBreak, and NetballFullTimeReview.
//
//   1. Pre-game: live page lands on NetballLiveGame at the
//      pre-Q1 lineup picker → coach taps "Start game".
//      (We skip the picker UI and seed lineup_set + status=in_progress
//      directly so the test focuses on the four quarter cycles.)
//   2. Q1 in-progress: tap GS → confirm "+ Goal" → goal lands.
//   3. Q1 hooter: at clock_multiplier=60, a 10-min "go" quarter
//      ticks down in ~10s of wall clock. NetballLiveGame's hooter
//      effect auto-fires endNetballQuarter → router.refresh() →
//      Q-break shell renders.
//   4. Q-break (Phase B+): per-quarter score recap + Fix-scores
//      panel. We open Fix-scores and add a retro opponent goal in
//      Q1 — exercises the same ScoreReviewPanel the AFL flow does
//      but with includeBehinds=false.
//   5. Two-tap kickoff: Q-break "Start Q2" → NetballStartQuarterModal
//      "Start Q2" — mirrors AFL's pattern (handleStart writes
//      period_break_swap then surfaces the modal; the modal CTA
//      writes quarter_start).
//   6. Repeat for Q3 + Q4. NetballLiveGame's Q4 branch renders
//      NetballFullTimeReview (not a Q-break) so we expect a
//      "Finalise game" button instead of "Start Q5".
//   7. Tap Finalise → game_finalised event lands → status=completed
//      → NetballGameSummaryCard renders.
//
// Why one spec, not seven: same logic as the AFL twin — each
// transition compounds, and the netball live shell is the most
// fragile surface in the merged trunk per Phase 3 CONCERNS.md.

import { test, expect } from "@playwright/test";
import { createAdminClient } from "../fixtures/supabase";
import { makeTeam, makePlayers, makeGame } from "../fixtures/factories";

test.describe.configure({ mode: "serial" });

// Same console-error watcher the AFL playthrough uses. 404 allow-
// list mirrors the AFL spec — pre-existing static-asset noise we
// don't want to flag as a Phase B+ regression.
const KNOWN_INNOCUOUS_PATTERNS: RegExp[] = [
  /Failed to load resource: the server responded with a status of 404/,
];

function attachConsoleErrorWatcher(
  page: import("@playwright/test").Page,
  errors: string[],
): void {
  page.on("pageerror", (err) => {
    errors.push(`pageerror: ${err.message}`);
  });
  page.on("console", (msg) => {
    if (msg.type() !== "error") return;
    const text = msg.text();
    if (KNOWN_INNOCUOUS_PATTERNS.some((re) => re.test(text))) return;
    errors.push(`console.error: ${text}`);
  });
}

// Position keys for a netball "go" lineup, in the order the seed
// helper assigns players[0..6]. Matches the netball-live-flow spec
// pattern. GS at index 0 means players[0] is always the GS.
const NETBALL_LINEUP_KEYS = ["gs", "ga", "wa", "c", "wd", "gd", "gk"] as const;

test("netball full game playthrough: start → score → Q-break recap + fix → finalise", async ({
  page,
}) => {
  // Same 180s budget as the AFL twin. Each 10-min "go" quarter at
  // clock_multiplier=60 ticks down in ~10s real time — four quarters
  // + Q-break interactions land in well under 90s, with comfortable
  // headroom for slow CI machines.
  test.setTimeout(180_000);

  const consoleErrors: string[] = [];
  attachConsoleErrorWatcher(page, consoleErrors);

  const admin = createAdminClient();
  const { data: superAdmin } = await admin.auth.admin.listUsers();
  const ownerId = superAdmin.users.find(
    (u) => u.email === process.env.TEST_SUPER_ADMIN_EMAIL,
  )!.id;

  // ─── Setup ─────────────────────────────────────────────────
  // Netball "go" age group, 9 players (7 court + 2 bench). Pass
  // ageGroup:"U10" to makePlayers because the default-count path
  // reads AGE_GROUPS (AFL-shaped) — explicit count:9 means the
  // lookup is skipped, but we keep "U10" for robustness (matches
  // netball-live-flow.spec.ts:91-96).
  const team = await makeTeam(admin, {
    ownerId,
    ageGroup: "go",
    sport: "netball",
    name: `NB-PT-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
  });
  await admin
    .from("teams")
    .update({ track_scoring: true })
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

  // Speed up the perceived clock 60×: a 10-min "go" quarter ticks
  // down in ~10s of wall-clock. Netball has period-break-only subs
  // (no SubDueModal during a quarter) so we don't need to push out
  // sub_interval_seconds the way AFL does.
  await admin
    .from("games")
    .update({ clock_multiplier: 60 })
    .eq("id", game.id);

  // Mark every player available so the LineupPicker / replacement
  // candidate filter sees them. (The netball replacementCandidates
  // filter at NetballLiveGame.tsx:789-810 reads game_availability,
  // not lineup.bench.)
  await admin.from("game_availability").insert(
    players.map((p) => ({
      game_id: game.id,
      player_id: p.id,
      status: "available",
      updated_by: ownerId,
    })),
  );

  // Skip the LineupPicker → Start game UI flow (covered by
  // netball-live-flow.spec.ts and netball-walkthrough.spec.ts).
  // Seed lineup_set + status=in_progress directly so we land in
  // the pre-Q1 branch with the await-kickoff modal one tap away.
  // GenericLineup shape: { positions: { gs:[id], ... }, bench:[...] }.
  const positions: Record<string, string[]> = Object.fromEntries(
    NETBALL_LINEUP_KEYS.map((k, i) => [k, [players[i].id]]),
  );
  const bench = players.slice(NETBALL_LINEUP_KEYS.length).map((p) => p.id);
  await admin.from("game_events").insert({
    game_id: game.id,
    type: "lineup_set",
    metadata: { lineup: { positions, bench } },
    created_by: ownerId,
  });
  await admin
    .from("games")
    .update({ status: "in_progress" })
    .eq("id", game.id);

  // Suppress the netball walkthrough modal so its overlay doesn't
  // intercept the test's first interactions. Same pattern as
  // netball-live-flow.spec.ts's suppressWalkthrough helper.
  await page.addInitScript(() => {
    try {
      localStorage.setItem("nb-walkthrough-seen", "1");
    } catch {}
  });

  // ─── Phase 1: kickoff → Q1 in progress ────────────────────
  // NetballLiveGame's pre-Q1 branch renders the page-level "Start Q1"
  // button; tapping it surfaces NetballStartQuarterModal whose CTA
  // writes the quarter_start event. After modal.lastButton click,
  // currentQuarter=1 and the live court mounts.
  await page.goto(`/teams/${team.id}/games/${game.id}/live`);
  const startQ1Initial = page.getByRole("button", { name: /^start q1$/i }).first();
  await expect(startQ1Initial).toBeVisible({ timeout: 10_000 });
  await startQ1Initial.click();
  // Modal CTA (.last() — the page-level button is still mounted
  // underneath the modal overlay in DOM order).
  await page
    .getByRole("button", { name: /^start q1$/i })
    .last()
    .click({ timeout: 5_000 });

  // ─── Phase 2: Q1 goal ─────────────────────────────────────
  // Tap GS (players[0]) → pendingGoal sheet's "+ Goal" CTA. The
  // PositionToken's accessible name is "Goal Shooter, ${playerName}"
  // — see PositionToken.tsx:84+157 (uses pos.label, the FULL name,
  // not the shortLabel).
  const scorer = players[0];
  await page
    .getByRole("button", {
      name: new RegExp(`^Goal Shooter,\\s*${scorer.full_name}`, "i"),
    })
    .click({ timeout: 10_000 });
  await page
    .getByRole("button", { name: /^(\+\s*goal|record goal|confirm goal)$/i })
    .click({ timeout: 5_000 });

  // ─── Phase 3: Q1 hooter (~10s real-time at 60× clock) ─────
  // Auto-hooter fires endNetballQuarter → router.refresh() →
  // Q-break shell renders. The Q-break header overline is the
  // marker.
  await expect(
    page.getByText(/quarter break/i).first(),
  ).toBeVisible({ timeout: 25_000 });

  // ─── Phase 4: Q-break recap + Fix scores ──────────────────
  // Per-quarter score recap card renders when trackScoring && Q≥1.
  // The "Q1 score" label inside the recap is the cleanest marker.
  await expect(page.getByText(/^q1 score$/i).first()).toBeVisible({
    timeout: 5_000,
  });
  // Toggle Fix-scores panel open. The button is text-only ("Fix
  // scores") so getByRole("button") is the right matcher.
  await page.getByRole("button", { name: /^fix scores$/i }).click();

  // Add a retro opponent goal in Q1 — exercises addRetroScore via
  // ScoreReviewPanel, with metadata.intended_quarter=1. Same shape
  // as the AFL playthrough.
  await page.getByRole("button", { name: /\+ add a missed score/i }).click();
  // First select = score type (no Behind option for netball since
  // includeBehinds=false in the netball recap call).
  await page.locator("select").nth(0).selectOption("opponent_goal");
  await page.getByRole("button", { name: /^add$/i }).click();
  await expect
    .poll(
      async () => {
        const { data } = await admin
          .from("game_events")
          .select("metadata")
          .eq("game_id", game.id)
          .eq("type", "opponent_goal");
        return (data ?? []).filter(
          (e) =>
            (e.metadata as { intended_quarter?: number } | null)
              ?.intended_quarter === 1,
        ).length;
      },
      { timeout: 5_000 },
    )
    .toBeGreaterThanOrEqual(1);

  // Two-tap kickoff helper. Mirrors the AFL playthrough's
  // startNextQuarter — the Q-break's "Start Qn" button fires
  // periodBreakSwap and surfaces NetballStartQuarterModal; the
  // modal's CTA fires startNetballQuarter (writing quarter_start).
  // The modal body text "Tap when the umpires call play." gates
  // the second tap (so we don't double-click before the modal
  // mounts).
  async function startNextQuarter(n: number): Promise<void> {
    await page
      .getByRole("button", { name: new RegExp(`^start q${n}$`, "i") })
      .click();
    await page
      .getByText(/tap when the umpires call play/i)
      .waitFor({ timeout: 5_000 });
    await page
      .getByRole("button", { name: new RegExp(`^start q${n}$`, "i") })
      .last()
      .click();
  }

  // Kick off Q2.
  await startNextQuarter(2);

  // ─── Phases 5–6: Q2 → Q3 (real-time at 60× clock) ─────────
  // For Q2 and Q3 we just confirm the hooter cycles correctly and
  // resume to the next quarter. Q-break details (recap + Fix scores)
  // are already exercised at Q1.
  for (const next of [3, 4]) {
    // Wait for the Q(prev) hooter to land us in the next Q-break.
    await expect(page.getByText(/quarter break/i).first()).toBeVisible({
      timeout: 25_000,
    });
    await expect(
      page.getByText(new RegExp(`^q${next - 1} score$`, "i")).first(),
    ).toBeVisible({ timeout: 5_000 });
    await startNextQuarter(next);
  }

  // ─── Phase 7: Q4 hooter → NetballFullTimeReview ──────────
  // After Q4's auto-hooter, NetballLiveGame's `quarterEnded &&
  // currentQuarter >= 4` branch renders NetballFullTimeReview
  // (NOT another Q-break). The "Finalise game" button is the marker.
  await expect(
    page.getByRole("button", { name: /finalise game/i }),
  ).toBeVisible({ timeout: 25_000 });

  // Game status MUST still be in_progress at this point — the
  // whole point of Phase B+ is that the review window blocks
  // status=completed until the coach explicitly finalises.
  const { data: midReviewGame } = await admin
    .from("games")
    .select("status")
    .eq("id", game.id)
    .single();
  expect(midReviewGame?.status).toBe("in_progress");

  // Assert no game_finalised event yet either.
  const { data: midReviewEvents } = await admin
    .from("game_events")
    .select("id")
    .eq("game_id", game.id)
    .eq("type", "game_finalised");
  expect(midReviewEvents?.length ?? 0).toBe(0);

  // ─── Phase 8: finalise → summary ──────────────────────────
  await page.getByRole("button", { name: /finalise game/i }).click();

  // NetballGameSummaryCard's "Game summary" heading is the marker
  // (mirrors AFL's GameSummaryCard).
  await expect(page.getByText(/game summary/i).first()).toBeVisible({
    timeout: 10_000,
  });

  // DB caught up: game_finalised event present + status=completed.
  await expect
    .poll(
      async () => {
        const { data } = await admin
          .from("games")
          .select("status")
          .eq("id", game.id)
          .single();
        return data?.status;
      },
      { timeout: 5_000, intervals: [200, 200, 500, 500, 1000] },
    )
    .toBe("completed");

  const { data: finalisedEvents } = await admin
    .from("game_events")
    .select("id")
    .eq("game_id", game.id)
    .eq("type", "game_finalised");
  expect(finalisedEvents?.length ?? 0).toBeGreaterThanOrEqual(1);

  // ─── Final guard: no console errors fired during the run ──
  expect(consoleErrors).toEqual([]);
});
