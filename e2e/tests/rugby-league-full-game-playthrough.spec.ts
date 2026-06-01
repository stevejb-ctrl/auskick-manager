// ─── Rugby League full-game playthrough ─────────────────────────
// Sibling of full-game-playthrough.spec.ts (AFL) and
// netball-full-game-playthrough.spec.ts. Exercises the U10 RL flow
// end-to-end so the regression net catches any drift across the
// LeagueLiveGame orchestrator + server actions + replay engine.
//
// Junior RL at U10 plays 2 × 20-min halves. With
// `clock_multiplier=60`, each half ticks down in ~20s of wall
// clock so the spec fits comfortably under a 180s timeout.
//
// Flow exercised:
//   1. Seed lineup_set + status=in_progress directly (skips the
//      lineup picker UI — covered by rugby-league-team-create).
//   2. Start H1 via the "Ready for half 1" page-level button.
//   3. Record a try via the on-field player tile + score buttons,
//      then walk through the conversion dialog (laws §15 rotation).
//   4. Auto-hooter at the 20-min mark fires endLeagueQuarter →
//      Q-break shell renders.
//   5. Start H2 ("Ready for half 2"), let the clock run, hooter.
//   6. Tap "Finalise game" → game_finalised lands + status=completed.
//   7. Server-side assertions confirm the event log matches.

import { test, expect } from "@playwright/test";
import { createAdminClient } from "../fixtures/supabase";
import { makeTeam, makePlayers, makeGame } from "../fixtures/factories";

test.describe.configure({ mode: "serial" });

const KNOWN_INNOCUOUS_PATTERNS: RegExp[] = [
  /Failed to load resource: the server responded with a status of 404/,
  // Dev-mode noise: Next.js HMR / EventSource occasionally logs a
  // bare `Event` when the websocket reconnects. Filtered here only
  // — production builds don't surface this and the AFL / netball
  // playthroughs already pass through the same noise via different
  // error-watcher gates.
  /^Event$/,
];

function attachConsoleErrorWatcher(
  page: import("@playwright/test").Page,
  errors: string[],
): void {
  page.on("pageerror", (err) => {
    const msg = `pageerror: ${err.message}`;
    // eslint-disable-next-line no-console
    console.log("[TEST]", msg);
    errors.push(msg);
  });
  page.on("console", (msg) => {
    if (msg.type() !== "error") return;
    const text = msg.text();
    if (KNOWN_INNOCUOUS_PATTERNS.some((re) => re.test(text))) return;
    // eslint-disable-next-line no-console
    console.log("[TEST]", `console.error: ${text}`);
    errors.push(`console.error: ${text}`);
  });
}

test("rugby league U10: kickoff → try → conversion → hooter → finalise", async ({
  page,
}) => {
  test.setTimeout(180_000);

  const consoleErrors: string[] = [];
  attachConsoleErrorWatcher(page, consoleErrors);

  const admin = createAdminClient();
  const { data: superAdmin } = await admin.auth.admin.listUsers();
  const ownerId = superAdmin.users.find(
    (u) => u.email === process.env.TEST_SUPER_ADMIN_EMAIL,
  )!.id;

  // ─── Setup ─────────────────────────────────────────────────
  const team = await makeTeam(admin, {
    ownerId,
    ageGroup: "U10",
    sport: "rugby_league",
    name: `RL-PT-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
  });
  await admin.from("teams").update({ track_scoring: true }).eq("id", team.id);

  // 13 players: 11 on field + 2 on bench (U10 RL defaultOnFieldSize=11).
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
  // makeGame uses AFL's AGE_GROUPS (defaultOnFieldSize=12 for U10).
  // Override to RL's 11 so the lineup we seed matches the legal
  // window. clock_multiplier=60 ticks a 20-min half down in ~20s.
  await admin
    .from("games")
    .update({ on_field_size: 11, clock_multiplier: 60 })
    .eq("id", game.id);

  // Mark every player available.
  await admin.from("game_availability").insert(
    players.map((p) => ({
      game_id: game.id,
      player_id: p.id,
      status: "available",
      updated_by: ownerId,
    })),
  );

  // Seed lineup_set + Q1 quarter_start in the same shape the
  // LineupPicker's atomic kickoff writes (`startQuarterToo: true`
  // in startLeagueGame). This skips the picker UI and lands the
  // page directly in H1-in-progress so the spec can focus on the
  // score / hooter / finalise flow.
  // Split the 11 starters into forwards/backs by the U10 config
  // (5F + 6B). The chip-aware lineup suggester would do this for
  // us in production, but the spec bypasses the picker UI to keep
  // the playthrough focused on score / hooter / finalise.
  const forwardIds = players.slice(0, 5).map((p) => p.id);
  const backIds = players.slice(5, 11).map((p) => p.id);
  const benchIds = players.slice(11).map((p) => p.id);
  await admin.from("game_events").insert([
    {
      game_id: game.id,
      type: "lineup_set",
      metadata: {
        lineup: {
          forwards: forwardIds,
          backs: backIds,
          bench: benchIds,
        },
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
  ]);
  await admin
    .from("games")
    .update({ status: "in_progress" })
    .eq("id", game.id);

  // ─── Phase 1: H1 in-progress landing ─────────────────────
  // With lineup_set + quarter_start both seeded, LeagueLiveGame
  // lands directly in `isPeriodActive` — the scoreboard reads
  // "HALF 1", the field renders 11 on-field tiles, and the
  // "+ Try (us)" button is enabled once a player is selected.
  await page.goto(`/teams/${team.id}/games/${game.id}/live`);
  await expect(page.getByText(/half\s*1/i).first()).toBeVisible({
    timeout: 15_000,
  });

  // ─── Phase 2: Record a try ───────────────────────────────
  const tryScorer = players[0]; // "Alicia" — an on-field forward

  // Click the field tile by its stable per-player testid — this opens
  // the shared ScoreRecordingDock with a "+ Try" button. We target the
  // testid rather than an exact `^Alicia$` name regex because the
  // tile's accessible name aggregates jersey + field-time + tries (so
  // the exact-name match never resolved), and because same-named
  // buttons in the vest card / kickoff picker would otherwise collide.
  // The testid is unique to the on-field tile, mirroring the AFL
  // playthrough's `getByTestId("player-tile-<id>")` pattern.
  await page
    .getByTestId(`league-player-tile-${tryScorer.id}`)
    .click({ timeout: 10_000 });

  // Wait for the dock's "+ Try" button to appear. The button only
  // exists after the dock mounts, so an existence-and-enabled poll
  // is the right gate.
  const tryButton = page.getByRole("button", { name: /^\+\s*try$/i });
  await expect(tryButton).toBeVisible({ timeout: 5_000 });
  await tryButton.click({ timeout: 5_000 });

  // Try landed → poll for the event.
  await expect
    .poll(
      async () => {
        const { data } = await admin
          .from("game_events")
          .select("id")
          .eq("game_id", game.id)
          .eq("type", "try");
        return (data ?? []).length;
      },
      { timeout: 5_000 },
    )
    .toBeGreaterThanOrEqual(1);

  // ─── Phase 3: Conversion (via dialog, auto-opened) ───────
  // At U8+, recording a try automatically opens
  // RecordConversionDialog so the coach picks the kicker without
  // a second tap (real-world flow: try → ref signals conversion
  // attempt). The test just needs to wait for the dialog to
  // appear, then click the kicker's Made button.
  await expect(
    page.getByRole("dialog", { name: /record conversion/i }),
  ).toBeVisible({ timeout: 5_000 });
  // Dialog is open: pick the second on-field player as the kicker
  // (anyone but the try-scorer to exercise picker selection).
  const kicker = players[1]; // "Brendan"
  // Each kicker row in RecordConversionDialog has a `rounded-lg`
  // outer border class (vs the dialog itself which uses
  // `rounded-2xl`). Filter the row by player name then click its
  // own Made button — avoids the strict-mode "11 matches" failure.
  const kickerRow = page
    .getByRole("dialog", { name: /record conversion/i })
    .locator("div.rounded-lg")
    .filter({ hasText: kicker.full_name });
  await kickerRow.getByRole("button", { name: /^made$/i }).click();

  await expect
    .poll(
      async () => {
        const { data } = await admin
          .from("game_events")
          .select("metadata")
          .eq("game_id", game.id)
          .eq("type", "conversion_attempt");
        return (data ?? []).length;
      },
      { timeout: 5_000 },
    )
    .toBeGreaterThanOrEqual(1);

  // ─── Phase 4: End H1 via manual hooter ────────────────────
  // The auto-hooter in LeagueLiveGame uses real wall-clock time, so
  // we end the period deterministically via the manual affordance.
  // That affordance lives on the scorebug clock pill and is a
  // *paused-only* rescue control: "End half early" only renders
  // when the clock is paused (`!running`) — see LeagueScoreBug. So
  // the sequence is: tap the clock pill to pause → the "End half
  // early" chip drops in → click it → confirm in
  // ManualEndQuarterConfirm. The chip text has no period number
  // ("End half early", not "End half 1 early").
  await page.getByRole("button", { name: /pause clock/i }).click();
  await page
    .getByRole("button", { name: /end half early/i })
    .click();
  // ManualEndQuarterConfirm modal — confirm with the destructive
  // "End H{n}" button (U10 plays halves; the shared modal now
  // reads the periodLabel from the age-group config and renders
  // "H" instead of "Q" — see ManualEndQuarterConfirm).
  await page
    .getByRole("button", { name: /^end\s*[qh]\s*1$/i })
    .click();
  // Ending H1 fires LeagueLiveGame's qbreak auto-open effect, which
  // pops StartQuarterModal ("Ready for H2" → confirm with "Start H2")
  // on top of the inline "Ready for half 2" break card. That modal
  // (z-50) covers the inline button, so we drive H2 straight from the
  // modal's "Start H2" CTA. Wait for it so Phase 5 doesn't race the
  // auto-open.
  await expect(
    page.getByRole("button", { name: /^start\s*[qh]\s*2$/i }),
  ).toBeVisible({ timeout: 10_000 });

  // ─── H1 BOUNDARY assertion (D-10): periodCount=2, currentQuarter=1 ──
  // 1 < 2, so the shared period-boundary booleans (made sport-agnostic
  // in plan 08-03 — `isBetweenPeriods` keys off ageGroup.periodCount, not
  // a hardcoded 4) must put us BETWEEN PERIODS, i.e. the "Ready for half
  // 2" break surface above — and must NOT show the FULL-TIME review. This
  // is the assertion that proves a halves sport doesn't fall into the
  // full-time branch one period early: the "Finalise game" CTA (the
  // full-time/review surface) must be absent at the H1 boundary.
  await expect(
    page.getByRole("button", { name: /finalise game/i }),
  ).toBeHidden();

  // ─── Phase 5: Start H2, end via manual hooter ─────────────
  await page
    .getByRole("button", { name: /^start\s*[qh]\s*2$/i })
    .click();
  // H2 now active. Same paused-only flow as Phase 4: pause the clock
  // to surface the end-early chip, then end + confirm. An inline
  // KickoffPicker may render for H2, but it's a non-blocking
  // <section> (not an overlay), so it never covers the clock pill.
  await page.getByRole("button", { name: /pause clock/i }).click();
  await expect(
    page.getByRole("button", { name: /end half early/i }),
  ).toBeVisible({ timeout: 10_000 });
  await page
    .getByRole("button", { name: /end half early/i })
    .click();
  await page
    .getByRole("button", { name: /^end\s*[qh]\s*2$/i })
    .click();
  await expect(
    page.getByRole("button", { name: /finalise game/i }),
  ).toBeVisible({ timeout: 10_000 });

  // Pre-finalise the game must still be in_progress — coach hasn't
  // tapped Finalise yet.
  const { data: midReviewGame } = await admin
    .from("games")
    .select("status")
    .eq("id", game.id)
    .maybeSingle();
  expect(midReviewGame?.status).toBe("in_progress");

  // ─── Phase 6: Finalise ────────────────────────────────────
  await page.getByRole("button", { name: /finalise game/i }).click();

  // game_finalised event + status flip.
  await expect
    .poll(
      async () => {
        const { data } = await admin
          .from("game_events")
          .select("id")
          .eq("game_id", game.id)
          .eq("type", "game_finalised");
        return (data ?? []).length;
      },
      { timeout: 10_000 },
    )
    .toBeGreaterThanOrEqual(1);
  await expect
    .poll(
      async () => {
        const { data } = await admin
          .from("games")
          .select("status")
          .eq("id", game.id)
          .maybeSingle();
        return data?.status;
      },
      { timeout: 5_000 },
    )
    .toBe("completed");

  // No console errors logged during the playthrough.
  expect(consoleErrors).toEqual([]);
});
