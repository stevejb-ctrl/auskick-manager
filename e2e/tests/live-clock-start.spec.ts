// Regression coverage for the "two clicks to start the clock" bug
// introduced by 10bf677 (#31, "fix(live): restart-game now actually
// clears the in-memory live store").
//
// The fix in #31 added `currentQuarter` to the hydration useEffect's
// dep array AND introduced a `storeAheadOfServer` re-init trigger so
// "Restart game" would actually wipe the in-memory store. Side effect:
// every time the user advanced the quarter via the UI (Start Q1, or
// "Start Q{n+1}" at a quarter break), the store's currentQuarter
// changed BEFORE Next.js revalidatePath had refreshed `initialState`
// from the server. That made the effect fire with
// `storeAheadOfServer = true` and re-run init() with the stale
// initialState, wiping the just-applied beginNextQuarter()+startClock()
// updates. The user had to tap a second time once initialState had
// caught up — by which point the bailout took effect and the second
// tap stuck.
//
// These tests fail against the pre-fix code (the second tap is what
// actually starts the clock / advances to StartQuarterModal) and pass
// after the fix. The fix reads the store's currentQuarter via
// useLiveGame.getState() inside the effect and removes currentQuarter
// from the dep array.
//
// Covers: src/components/live/LiveGame.tsx hydration effect (~L327).

import { test, expect } from "@playwright/test";
import { createAdminClient } from "../fixtures/supabase";
import { makeTeam, makePlayers, makeGame } from "../fixtures/factories";
import { ALL_ZONES, zoneCapsFor } from "../../src/lib/fairness";
import { positionsFor } from "../../src/lib/ageGroups";
import type { AgeGroup, Lineup } from "../../src/lib/types";

test.describe.configure({ mode: "parallel" });

async function buildLineup(opts: {
  playerIds: string[];
  onFieldSize: number;
  ageGroup: AgeGroup;
}): Promise<Lineup> {
  const positionModel = positionsFor(opts.ageGroup);
  const zoneCaps = zoneCapsFor(opts.onFieldSize, positionModel);
  const lineup: Lineup = {
    back: [], hback: [], mid: [], hfwd: [], fwd: [], bench: [],
  };
  let cursor = 0;
  for (const z of ALL_ZONES) {
    for (let i = 0; i < zoneCaps[z]; i++) {
      lineup[z].push(opts.playerIds[cursor++]);
    }
  }
  lineup.bench = opts.playerIds.slice(cursor);
  return lineup;
}

test("Start Q1 advances to the await-kickoff modal (clock waits for the user)", async ({
  page,
}) => {
  // The "Start Q1" button no longer auto-starts the clock — it
  // advances the quarter, persists `quarter_start`, and renders
  // StartQuarterModal so the GM can tap when the umpire blows the
  // whistle. Mirrors Q2–Q4's pattern. Pre-modal-feature, this
  // assertion would fail because the clock was already running and
  // the modal was gated to currentQuarter >= 2.
  //
  // This test ALSO covers the original "two clicks" regression
  // (10bf677 / #31): pre-fix, the hydration effect re-ran on every
  // store-side currentQuarter change and reset the store back to
  // pre-game before the modal could render. Post-fix, the single
  // tap reliably reaches the modal.
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

  // Seed a lineup_set event + flip status to in_progress. With NO
  // quarter_start, replayGame returns currentQuarter=0 and the live
  // page renders LiveGame with isPreGame=true — the "Start Q1"
  // button is visible.
  const lineup = await buildLineup({
    playerIds: players.map((p) => p.id),
    onFieldSize: game.on_field_size,
    ageGroup: team.ageGroup,
  });
  await admin.from("game_events").insert({
    game_id: game.id,
    type: "lineup_set",
    metadata: { lineup },
    created_by: ownerId,
  });
  await admin.from("games").update({ status: "in_progress" }).eq("id", game.id);

  await page.goto(`/teams/${team.id}/games/${game.id}/live`);

  // Tap the pre-game "Start Q1" button. Both this button AND the
  // modal's CTA share the accessible name "Start Q1", so we anchor
  // on the page-level button via .first() (the modal isn't visible
  // yet, so .first() picks the live-game one).
  const startQ1Initial = page.getByRole("button", { name: /^start q1$/i }).first();
  await expect(startQ1Initial).toBeVisible({ timeout: 10_000 });
  await startQ1Initial.click();

  // StartQuarterModal renders "Ready for Q1" — the clock has NOT
  // started, the modal CTA is what kicks it off. Pre-fix (modal
  // gated to >= Q2), this heading would never appear and the clock
  // would already be running.
  await expect(
    page.getByRole("heading", { name: /^ready for q1$/i }),
  ).toBeVisible({ timeout: 2_000 });

  // Clock pill is in pre-running state (aria-label "Resume clock").
  // If the clock were running, the label would flip to "Pause clock".
  await expect(
    page.getByRole("button", { name: /^resume clock$/i }),
  ).toBeVisible();

  // Server has the quarter_start event — single tap persisted it.
  await expect
    .poll(
      async () => {
        const { data: events } = await admin
          .from("game_events")
          .select("type, metadata")
          .eq("game_id", game.id)
          .eq("type", "quarter_start");
        return (events ?? []).filter(
          (e) => (e.metadata as { quarter?: number } | null)?.quarter === 1,
        ).length;
      },
      { timeout: 5_000, intervals: [200, 200, 500, 500, 1000] },
    )
    .toBe(1);

  // Tapping the modal's CTA finally starts the clock. The pre-game
  // button is gone now (isPreGame=false after the first tap), so a
  // bare getByRole resolves uniquely to the modal's "Start Q1".
  await page.getByRole("button", { name: /^start q1$/i }).click();
  await expect(
    page.getByRole("heading", { name: /^ready for q1$/i }),
  ).toBeHidden({ timeout: 2_000 });
  await expect(
    page.getByRole("button", { name: /^pause clock$/i }),
  ).toBeVisible({ timeout: 2_000 });
});

test("Start Q2 from QuarterBreak advances to StartQuarterModal on a single tap", async ({
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

  // Seed lineup_set + quarter_start(1) + quarter_end(1) so the live
  // page mounts in the between-quarters phase. replayGame returns
  // currentQuarter=1, quarterEnded=true → isBetweenQuarters=true →
  // <QuarterBreak> is rendered with the "Start Q2" CTA.
  const lineup = await buildLineup({
    playerIds: players.map((p) => p.id),
    onFieldSize: game.on_field_size,
    ageGroup: team.ageGroup,
  });
  const aMomentAgo = new Date(Date.now() - 60_000).toISOString();
  await admin.from("game_events").insert([
    {
      game_id: game.id,
      type: "lineup_set",
      metadata: { lineup },
      created_by: ownerId,
      created_at: aMomentAgo,
    },
    {
      game_id: game.id,
      type: "quarter_start",
      metadata: { quarter: 1 },
      created_by: ownerId,
      created_at: aMomentAgo,
    },
    {
      game_id: game.id,
      type: "quarter_end",
      metadata: { quarter: 1, elapsed_ms: 12 * 60_000 },
      created_by: ownerId,
      created_at: aMomentAgo,
    },
  ]);
  await admin.from("games").update({ status: "in_progress" }).eq("id", game.id);

  await page.goto(`/teams/${team.id}/games/${game.id}/live`);

  // QuarterBreak's CTA is "Start Q2".
  const startQ2InBreak = page.getByRole("button", { name: /^start q2$/i });
  await expect(startQ2InBreak).toBeVisible({ timeout: 10_000 });

  await startQ2InBreak.click();

  // Post-fix: a single tap commits the lineup + quarter_start(2) and
  // calls beginNextQuarter() in the store. quarterEnded becomes false,
  // so isBetweenQuarters=false, QuarterBreak unmounts, and (per
  // LiveGame.tsx ~L1131) StartQuarterModal renders gating the clock
  // start until the GM taps "Start Q2" when the hooter goes.
  //
  // Pre-fix: the hydration effect re-runs on the currentQuarter
  // store change, sees storeAheadOfServer=true (initialState still
  // says Q1+quarterEnded=true), re-inits the store back to that, and
  // QuarterBreak re-renders — bouncing the GM back to the lineup
  // picker. They have to tap "Start Q2" a second time.
  //
  // Assert the QuarterBreak's distinctive sub-heading is gone and a
  // StartQuarterModal is up. The modal renders "Ready for Q2" and a
  // "Start Q2" button (different DOM node from QuarterBreak's CTA).
  await expect(
    page.getByText(/set zones for q2/i),
  ).toBeHidden({ timeout: 2_000 });
  await expect(
    page.getByRole("heading", { name: /^ready for q2$/i }),
  ).toBeVisible({ timeout: 2_000 });

  // And the server should have recorded exactly one quarter_start
  // for Q2 — single tap, single event.
  await expect
    .poll(
      async () => {
        const { data: events } = await admin
          .from("game_events")
          .select("type, metadata")
          .eq("game_id", game.id)
          .eq("type", "quarter_start");
        return (events ?? []).filter(
          (e) => (e.metadata as { quarter?: number } | null)?.quarter === 2,
        ).length;
      },
      { timeout: 5_000, intervals: [200, 200, 500, 500, 1000] },
    )
    .toBe(1);
});
