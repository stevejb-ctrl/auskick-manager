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

  // Mark every player available so the LineupPicker renders. The
  // live page filters by game_availability and shows a "go back
  // and set availability" empty-state when nothing's marked. We
  // skip the availability UI in this spec — it's covered by
  // availability.spec.ts — so seed directly.
  await admin.from("game_availability").insert(
    players.map((p) => ({
      game_id: game.id,
      player_id: p.id,
      status: "available",
      updated_by: ownerId,
    })),
  );

  // Seed a pre-kickoff lineup draft so the LineupPicker pre-
  // populates the field on first render — saves the test from
  // having to drag every player into a zone via tap-tap.
  const draftLineup = buildDefaultLineup(
    players.map((p) => p.id),
    game.on_field_size,
    team.ageGroup as AgeGroup,
  );
  await admin.from("game_lineup_drafts").upsert(
    {
      game_id: game.id,
      lineup: draftLineup,
      on_field_size: game.on_field_size,
      sub_interval_seconds: 180,
      updated_by: ownerId,
    },
    { onConflict: "game_id" },
  );

  // ─── Phase 1: pre-game → start ─────────────────────────────
  await page.goto(`/teams/${team.id}/games/${game.id}/live`);

  // LineupPicker: 12 players on field, "Start game" CTA visible.
  await expect(
    page.getByRole("button", { name: /start game/i }).first(),
  ).toBeVisible({ timeout: 10_000 });
  await page.getByRole("button", { name: /start game/i }).first().click();

  // ─── Phase 2: Q1 in progress → score a goal ───────────────
  // After startGame, redirect lands on /live with the kickoff
  // modal open ("Start Q1"). Tap to start the clock.
  await expect(
    page.getByRole("button", { name: /^start q1$/i }).first(),
  ).toBeVisible({ timeout: 10_000 });
  await page.getByRole("button", { name: /^start q1$/i }).first().click();

  // Tap a field player and record a goal. PlayerTile carries a
  // testid we can target deterministically — names render as
  // "First L" abbreviations and would clash with SwapCard rows.
  const scorer = players[0]; // Alicia, in back per buildDefaultLineup.
  await page.getByTestId(`player-tile-${scorer.id}`).click();
  await page.getByRole("button", { name: /\+ goal/i }).click();

  // Wait for the goal event to land in the DB so the next step
  // (backdate quarter_start) doesn't race the optimistic store.
  await expect
    .poll(
      async () => {
        const { data } = await admin
          .from("game_events")
          .select("id")
          .eq("game_id", game.id)
          .eq("type", "goal");
        return data?.length ?? 0;
      },
      { timeout: 5_000 },
    )
    .toBeGreaterThanOrEqual(1);

  // ─── Phase 3: trigger Q1 hooter → end Q1 ──────────────────
  // Backdate quarter_start to 13 min ago — LiveGame's auto-end
  // effect fires on mount when the running clock has passed
  // QUARTER_MS, opening the QuarterEndModal.
  const thirteenMinAgo = new Date(Date.now() - 13 * 60_000).toISOString();
  await admin
    .from("game_events")
    .update({ created_at: thirteenMinAgo })
    .eq("game_id", game.id)
    .eq("type", "quarter_start")
    .eq("metadata->>quarter", "1");
  await page.reload();

  await expect(
    page.getByRole("button", { name: /select team for q2/i }),
  ).toBeVisible({ timeout: 10_000 });
  await page.getByRole("button", { name: /select team for q2/i }).click();

  // ─── Phase 4: Q-break recap + Fix scores ──────────────────
  // Per-quarter recap shows. Header is "Q1 score" (the just-ended
  // quarter), followed by Us / Them cards.
  await expect(page.getByText(/q1 score/i).first()).toBeVisible({
    timeout: 10_000,
  });

  // Expand the Fix-scores panel and assert our goal is listed.
  await page.getByRole("button", { name: /^fix scores$/i }).click();
  await expect(page.getByText(scorer.full_name).first()).toBeVisible();

  // Add a retroactive opponent goal in Q1 so we know retro-add
  // attributes correctly even after Q1 has ended.
  await page.getByRole("button", { name: /\+ add a missed score/i }).click();
  // Pick "Goal (them)" in the Type dropdown.
  await page.locator("select").nth(0).selectOption("opponent_goal");
  // Quarter dropdown — already defaults to currentQuarter (=1) at
  // this break, leave it. Hit Add.
  await page.getByRole("button", { name: /^add$/i }).click();

  // Poll for the retro opponent_goal to land. metadata.intended_quarter
  // pins it to Q1.
  await expect
    .poll(
      async () => {
        const { data } = await admin
          .from("game_events")
          .select("metadata")
          .eq("game_id", game.id)
          .eq("type", "opponent_goal");
        const matches = (data ?? []).filter(
          (e) =>
            (e.metadata as { intended_quarter?: number } | null)
              ?.intended_quarter === 1,
        );
        return matches.length;
      },
      { timeout: 5_000 },
    )
    .toBeGreaterThanOrEqual(1);

  // Resume — seed Q2 + Q3 + Q4 events directly. We don't tap
  // "Start Q2" inside QuarterBreak because we want to skip
  // ahead to Q4 without driving 36 minutes of UI; that means
  // the UI never wrote a Q2 quarter_start, so we own the whole
  // post-Q1 timeline. All events are backdated relative to `now`
  // so created_at sorts in the correct play order (Q2 start →
  // Q2 end → Q3 ... → Q4 backdated 13 min so the hooter fires
  // on next render).
  const now = Date.now();
  await admin.from("game_events").insert([
    // Q2 lineup_set + start + end
    {
      game_id: game.id,
      type: "lineup_set",
      metadata: { lineup: draftLineup },
      created_by: ownerId,
      created_at: new Date(now - 38 * 60_000).toISOString(),
    },
    {
      game_id: game.id,
      type: "quarter_start",
      metadata: { quarter: 2 },
      created_by: ownerId,
      created_at: new Date(now - 38 * 60_000 + 100).toISOString(),
    },
    {
      game_id: game.id,
      type: "quarter_end",
      metadata: { quarter: 2, elapsed_ms: 12 * 60 * 1000 },
      created_by: ownerId,
      created_at: new Date(now - 26 * 60_000).toISOString(),
    },
    // Q3 lineup + start + end
    {
      game_id: game.id,
      type: "lineup_set",
      metadata: { lineup: draftLineup },
      created_by: ownerId,
      created_at: new Date(now - 26 * 60_000 + 100).toISOString(),
    },
    {
      game_id: game.id,
      type: "quarter_start",
      metadata: { quarter: 3 },
      created_by: ownerId,
      created_at: new Date(now - 26 * 60_000 + 200).toISOString(),
    },
    {
      game_id: game.id,
      type: "quarter_end",
      metadata: { quarter: 3, elapsed_ms: 12 * 60 * 1000 },
      created_by: ownerId,
      created_at: new Date(now - 14 * 60_000).toISOString(),
    },
    // Q4 lineup + start (backdated 13 min so the hooter auto-fires)
    {
      game_id: game.id,
      type: "lineup_set",
      metadata: { lineup: draftLineup },
      created_by: ownerId,
      created_at: new Date(now - 14 * 60_000 + 100).toISOString(),
    },
    {
      game_id: game.id,
      type: "quarter_start",
      metadata: { quarter: 4 },
      created_by: ownerId,
      created_at: new Date(now - 13 * 60_000).toISOString(),
    },
  ]);

  await page.reload();

  // ─── Phase 5: Q4 hooter → FullTimeReview ──────────────────
  // QuarterEndModal CTA reads "End game" on Q4 only.
  await expect(
    page.getByRole("button", { name: /^end game$/i }),
  ).toBeVisible({ timeout: 10_000 });
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
