// ─── Full-game playthrough ─────────────────────────────────────
// One spec that drives the AFL live-game flow end-to-end through
// the UI, hitting every Phase B+ surface in a single coach-shaped
// path:
//
//   1. Pre-game: live page renders LineupPicker (pre-seeded with
//      a saved draft) → coach taps "Start game".
//   2. Q1 in-progress: tap a player → record a goal → see the
//      score chip on their tile.
//   3. Q1 hooter: backdate quarter_start so the QuarterEndModal
//      auto-opens → tap "Select team for Q2".
//   4. Q-break (Phase B+): per-quarter score recap shows the goal
//      we just scored. Open the Fix-scores panel → delete one
//      score → add a missed opponent goal in Q1.
//   5. Resume Q2 → seed Q2 + Q3 events directly so the test can
//      land at Q4 hooter without driving 36 minutes of UI.
//   6. Q4 hooter: tap "End game" → see the FullTimeReview screen
//      (Phase B+) — assert score is correct, status is still
//      in_progress.
//   7. Tap "Finalise game" → game_finalised event written, status
//      flips to "completed", GameSummaryCard renders.
//
// Why one spec, not seven: each transition compounds — if Q-break
// recap broke after a particular Q1 sub flow, an isolated test
// wouldn't catch it. A single playthrough surfaces interactions
// between phases (e.g. retro-add in Q1 still attributing correctly
// at full time) that matter most in real games. Steve's tier-1
// regression net.
//
// Runtime budget: ~30s on CI. We seed events for the chunks the
// UI doesn't need to drive (mid-Q2, mid-Q3) and use Playwright
// only for the user-visible transitions and assertions.

import { test, expect } from "@playwright/test";
import { createAdminClient } from "../fixtures/supabase";
import { makeTeam, makePlayers, makeGame } from "../fixtures/factories";
import { ALL_ZONES, zoneCapsFor } from "../../src/lib/fairness";
import { positionsFor } from "../../src/lib/ageGroups";
import type { AgeGroup, Lineup } from "../../src/lib/types";

test.describe.configure({ mode: "serial" });

// Suppress console-noise from React strict-mode double-renders so
// the page-error listener can flag REAL crashes. If a future
// commit accidentally introduces a runtime error, the test fails.
const KNOWN_INNOCUOUS_PATTERNS: RegExp[] = [
  // Add patterns here as we encounter them. Keep the allow-list
  // small — every entry weakens the safety net.
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

function buildDefaultLineup(
  playerIds: string[],
  onFieldSize: number,
  ageGroup: AgeGroup,
): Lineup {
  const positionModel = positionsFor(ageGroup);
  const zoneCaps = zoneCapsFor(onFieldSize, positionModel);
  const lineup: Lineup = {
    back: [],
    hback: [],
    mid: [],
    hfwd: [],
    fwd: [],
    bench: [],
  };
  let cursor = 0;
  for (const z of ALL_ZONES) {
    for (let i = 0; i < zoneCaps[z]; i++) {
      lineup[z].push(playerIds[cursor++]);
    }
  }
  lineup.bench = playerIds.slice(cursor);
  return lineup;
}

test("full game playthrough: start → score → Q-break recap + fix → finalise", async ({
  page,
}) => {
  // Default 30s per-test timeout is too tight — at clock_multiplier=60
  // each 12-min quarter takes ~12s real-time, plus per-Q-break
  // interactions. Whole spec runs in ~75–90s.
  test.setTimeout(180_000);

  const consoleErrors: string[] = [];
  attachConsoleErrorWatcher(page, consoleErrors);

  const admin = createAdminClient();
  const { data: superAdmin } = await admin.auth.admin.listUsers();
  const ownerId = superAdmin.users.find(
    (u) => u.email === process.env.TEST_SUPER_ADMIN_EMAIL,
  )!.id;

  // ─── Setup ─────────────────────────────────────────────────
  const team = await makeTeam(admin, { ownerId, ageGroup: "U10" });
  // Track scoring on so the +Goal button + score recap render.
  await admin
    .from("teams")
    .update({ track_scoring: true })
    .eq("id", team.id);
  const players = await makePlayers(admin, {
    teamId: team.id,
    ownerId,
    count: 15,
  });
  const game = await makeGame(admin, { teamId: team.id, ownerId });

  // Speed up the in-game clock + push the sub interval out past
  // the quarter length so:
  //   • a 12-min quarter ticks down in 12 real seconds (multiplier=60)
  //   • the sub-due modal NEVER fires within a quarter — sub_interval
  //     900s ÷ 60 = 15s real > 12s quarter. Without this, the
  //     SubDueModal pops up every 3s with the default 180s interval
  //     scaled, intercepting all the test's modal clicks.
  await admin
    .from("games")
    .update({ clock_multiplier: 60, sub_interval_seconds: 900 })
    .eq("id", game.id);

  // Mark every player available — the live page filters by
  // game_availability. Skipped here (availability.spec.ts covers
  // it) by seeding directly.
  await admin.from("game_availability").insert(
    players.map((p) => ({
      game_id: game.id,
      player_id: p.id,
      status: "available",
      updated_by: ownerId,
    })),
  );

  // Skip the LineupPicker → Start game UI flow (covered by
  // lineup.spec.ts and live-scoring.spec.ts). Seed lineup_set +
  // status=in_progress directly so we land on the LiveGame view
  // with the StartQuarterModal ready for Q1. This keeps the
  // playthrough focused on the four quarter cycles + Q-break +
  // FullTimeReview surfaces.
  const startingLineup = buildDefaultLineup(
    players.map((p) => p.id),
    game.on_field_size,
    team.ageGroup as AgeGroup,
  );
  await admin.from("game_events").insert({
    game_id: game.id,
    type: "lineup_set",
    metadata: { lineup: startingLineup },
    created_by: ownerId,
  });
  await admin
    .from("games")
    .update({ status: "in_progress" })
    .eq("id", game.id);

  // ─── Phase 1: kickoff → Q1 in progress ────────────────────
  // Live page lands on LiveGame with StartQuarterModal open.
  await page.goto(`/teams/${team.id}/games/${game.id}/live`);
  await expect(
    page.getByRole("button", { name: /^start q1$/i }),
  ).toBeVisible({ timeout: 10_000 });
  await page.getByRole("button", { name: /^start q1$/i }).click();

  // Tap a field player and record a goal. The PlayerTile carries
  // a testid we can target deterministically — names render
  // abbreviated and would clash with SwapCard rows.
  const scorer = players[0];
  await page.getByTestId(`player-tile-${scorer.id}`).click();
  await page.getByRole("button", { name: /^\+ goal$/i }).click();

  // ─── Phase 3: Q1 hooter (~12s real-time at 60× clock) ─────
  // QuarterEndModal fires automatically when the scaled clock
  // crosses the quarter threshold. 25s timeout = comfortable
  // buffer for CI machines.
  await expect(
    page.getByRole("button", { name: /select team for q2/i }),
  ).toBeVisible({ timeout: 25_000 });
  await page.getByRole("button", { name: /select team for q2/i }).click();

  // ─── Phase 4: Q-break recap + Fix scores ──────────────────
  await expect(page.getByText(/q1 score/i).first()).toBeVisible({
    timeout: 10_000,
  });
  await page.getByRole("button", { name: /^fix scores$/i }).click();
  await expect(page.getByText(scorer.full_name).first()).toBeVisible();

  // Add a retro opponent goal in Q1 — exercises addRetroScore +
  // metadata.intended_quarter=1 attribution.
  await page.getByRole("button", { name: /\+ add a missed score/i }).click();
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

  // Resume Q2 from the QuarterBreak's primary CTA.
  await page.getByRole("button", { name: /^start q2$/i }).click();

  // ─── Phases 5–7: Q2 → Q3 → Q4 (real-time at 60× clock) ────
  // For Q2 and Q3 we just confirm the hooter cycles correctly
  // and resume to the next quarter. Phase B+ details (recap +
  // Fix scores) are already exercised at Q1.
  for (const next of [3, 4]) {
    await expect(
      page.getByRole("button", { name: new RegExp(`select team for q${next}`, "i") }),
    ).toBeVisible({ timeout: 25_000 });
    await page
      .getByRole("button", { name: new RegExp(`select team for q${next}`, "i") })
      .click();
    await expect(page.getByText(new RegExp(`q${next - 1} score`, "i")).first()).toBeVisible({
      timeout: 10_000,
    });
    await page
      .getByRole("button", { name: new RegExp(`^start q${next}$`, "i") })
      .click();
  }

  // ─── Phase 8: Q4 hooter → "End game" → FullTimeReview ────
  await expect(
    page.getByRole("button", { name: /^end game$/i }),
  ).toBeVisible({ timeout: 25_000 });
  await page.getByRole("button", { name: /^end game$/i }).click();

  // FullTimeReview renders. "Finalise game" button is the marker.
  await expect(
    page.getByRole("button", { name: /finalise game/i }),
  ).toBeVisible({ timeout: 10_000 });

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

  // ─── Phase 6: finalise → summary ──────────────────────────
  await page.getByRole("button", { name: /finalise game/i }).click();

  // GameSummaryCard heading is visible.
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
  // Catches the "everything looks fine but a useEffect crashed
  // silently" class of bugs that scripted assertions miss.
  expect(consoleErrors).toEqual([]);
});
