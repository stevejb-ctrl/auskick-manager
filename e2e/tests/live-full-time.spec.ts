// Covers the Q4 endQuarter → game finalised → GameSummaryCard path.
// This is the emotional moment at the end of a Saturday game — the
// pulsing siren, the final score, the MVP banner. If this breaks
// nobody notices until the last 30 seconds of the game, which is
// the worst possible time.
//
// Covers: src/app/(app)/teams/[teamId]/games/[gameId]/live/actions.ts:
//         endQuarter (quarter === 4 branch) → game_finalised event

import { test, expect } from "@playwright/test";
import { createAdminClient } from "../fixtures/supabase";
import { makeTeam, makePlayers, makeGame } from "../fixtures/factories";
import { ALL_ZONES, zoneCapsFor } from "../../src/lib/fairness";
import { aflPositionModel, getAgeGroupConfig } from "../../src/lib/sports";
import type { Lineup } from "../../src/lib/types";

test.describe.configure({ mode: "parallel" });

type Seeded = Awaited<ReturnType<typeof seedGameAtQ4Hooter>>;

/** A U10 game three quarters in, with Q4 already past the hooter. */
async function seedGameAtQ4Hooter(
  scores: (
    players: Array<{ id: string }>,
    quarterAt: (q: number) => string,
  ) => Array<Record<string, unknown>> = () => [],
) {
  const admin = createAdminClient();
  const { data: superAdmin } = await admin.auth.admin.listUsers();
  const ownerId = superAdmin.users.find(
    (u) => u.email === process.env.TEST_SUPER_ADMIN_EMAIL
  )!.id;

  const team = await makeTeam(admin, { ownerId, ageGroup: "U10", sport: "afl" });
  const players = await makePlayers(admin, {
    teamId: team.id,
    ownerId,
    count: 15,
  });
  const game = await makeGame(admin, { teamId: team.id, ownerId });

  // Build the same `Lineup` shape startGame writes — `{back, hback, mid,
  // hfwd, fwd, bench}` — keyed off the team's age-group position model.
  const positionModel = aflPositionModel(getAgeGroupConfig("afl", team.ageGroup));
  const zoneCaps = zoneCapsFor(game.on_field_size, positionModel);
  const lineup: Lineup = {
    back: [], hback: [], mid: [], hfwd: [], fwd: [], bench: [],
  };
  let cursor = 0;
  for (const z of ALL_ZONES) {
    for (let i = 0; i < zoneCaps[z]; i++) {
      lineup[z].push(players[cursor++].id);
    }
  }
  lineup.bench = players.slice(cursor).map((p) => p.id);

  // Q1–Q3 ran 13 mins each (so each was past the 12-min hooter at
  // the time it ended), then Q4 has been running for 13 mins now.
  // Backdating like this means LiveGame's maybeTrigger effect sees
  // Q4 elapsed >= QUARTER_MS on mount and auto-opens the
  // QuarterEndModal. There's no manual "End Q4" button — the hooter
  // fires the flow, and for the final quarter the modal CTA reads
  // "End game".
  const now = Date.now();
  const QUARTER_DURATION = 13 * 60_000; // > QUARTER_MS so each quarter ran past the hooter
  const events: Array<Record<string, unknown>> = [
    {
      game_id: game.id,
      type: "lineup_set",
      metadata: { lineup },
      created_by: ownerId,
      created_at: new Date(now - 5 * QUARTER_DURATION).toISOString(),
    },
  ];
  for (let q = 1; q <= 4; q++) {
    events.push({
      game_id: game.id,
      type: "quarter_start",
      metadata: { quarter: q },
      created_by: ownerId,
      created_at: new Date(now - (5 - q) * QUARTER_DURATION).toISOString(),
    });
    if (q < 4) {
      events.push({
        game_id: game.id,
        type: "quarter_end",
        metadata: { quarter: q, elapsed_ms: QUARTER_DURATION },
        created_by: ownerId,
        created_at: new Date(now - (4 - q) * QUARTER_DURATION).toISOString(),
      });
    }
  }
  // Scores land a minute into their quarter.
  const quarterAt = (q: number) =>
    new Date(now - (5 - q) * QUARTER_DURATION + 60_000).toISOString();
  for (const e of scores(players, quarterAt)) {
    events.push({ game_id: game.id, created_by: ownerId, ...e });
  }
  await admin.from("game_events").insert(events);
  await admin.from("games").update({ status: "in_progress" }).eq("id", game.id);
  return { admin, team, players, game };
}

test("ending Q4 completes the game and renders the summary card", async ({
  page,
}) => {
  const { admin, team, game }: Seeded = await seedGameAtQ4Hooter();

  await page.goto(`/teams/${team.id}/games/${game.id}/live`);

  // QuarterEndModal auto-opens (Q4 is past hooter). For the final
  // quarter the modal's CTA reads "End game".
  await page.getByRole("button", { name: /^end game$/i }).click();

  // The Phase B+ change split Q4 into TWO steps. Tapping "End game"
  // writes quarter_end and renders the FullTimeReview screen — the
  // shareable summary doesn't appear until the coach explicitly
  // taps "Finalise game" so they can fix scores in between.
  await expect(
    page.getByRole("button", { name: /finish game/i }),
  ).toBeVisible({ timeout: 10_000 });

  // The game's status should still be "in_progress" at this point —
  // games.status doesn't flip to "completed" until finalise fires.
  const { data: midReview } = await admin
    .from("games")
    .select("status")
    .eq("id", game.id)
    .single();
  expect(midReview?.status).toBe("in_progress");

  // Tap Finalise. That writes game_finalised + flips status to
  // completed; the GameSummaryCard renders below.
  await page.getByRole("button", { name: /finish game/i }).click();

  // Summary card content — "full time" / "game summary" / similar.
  await expect(
    page.getByText(/full time|final score|game summary/i).first(),
  ).toBeVisible({ timeout: 10_000 });

  // finaliseGame runs in startTransition. Poll until the DB catches
  // up rather than hard-coding a sleep.
  await expect
    .poll(
      async () => {
        const { data: updated } = await admin
          .from("games")
          .select("status")
          .eq("id", game.id)
          .single();
        return updated?.status;
      },
      { timeout: 5_000, intervals: [200, 200, 500, 500, 1000] },
    )
    .toBe("completed");

  const { data: finalised } = await admin
    .from("game_events")
    .select("type")
    .eq("game_id", game.id)
    .eq("type", "game_finalised");
  expect(finalised?.length ?? 0).toBeGreaterThanOrEqual(1);
});

// Round 5 (Stagehand whole-game-afl): a behind deleted in the full-time
// Fix scores panel came off the scoreline but stayed in the summary's
// scorers line ("Ava 0.1" with only three behinds on the board). The
// panel moved the team total in the live store but never the player's
// own tally, and the store doesn't re-hydrate on router.refresh().
test("Fix scores at full time keeps the summary's scorers in step", async ({
  page,
}) => {
  const { admin, team, players, game } = await seedGameAtQ4Hooter(
    (p, at) => [
      { type: "goal", player_id: p[0].id, metadata: { quarter: 1 }, created_at: at(1) },
      { type: "behind", player_id: p[1].id, metadata: { quarter: 2 }, created_at: at(2) },
    ],
  );
  // Track scoring on so the full-time review shows Fix scores.
  await admin.from("teams").update({ track_scoring: true }).eq("id", team.id);
  const [kicker, wrongBehind, missedGoal] = players as Array<{
    id: string;
    full_name: string;
    jersey_number: number;
  }>;

  await page.goto(`/teams/${team.id}/games/${game.id}/live`);
  await page.getByRole("button", { name: /^end game$/i }).click();
  await expect(page.getByRole("button", { name: /finish game/i })).toBeVisible({
    timeout: 10_000,
  });

  // Delete the behind that was never kicked.
  const row = page.getByRole("listitem").filter({ hasText: wrongBehind.full_name });
  await row.getByRole("button", { name: /^delete (goal|behind)/i }).click();
  await page.getByRole("button", { name: /^delete$/i }).click();
  await expect
    .poll(async () => {
      const { data } = await admin
        .from("game_events")
        .select("id")
        .eq("game_id", game.id)
        .eq("type", "score_undo");
      return data?.length ?? 0;
    })
    .toBe(1);

  // Add the goal nobody tapped.
  await page.getByRole("button", { name: /\+ add a missed score/i }).click();
  await page.getByLabel("Type").selectOption("goal");
  await page.getByLabel("Player").selectOption(missedGoal.id);
  await page.getByRole("button", { name: /^add$/i }).click();
  await expect
    .poll(async () => {
      const { data } = await admin
        .from("game_events")
        .select("id")
        .eq("game_id", game.id)
        .eq("type", "goal")
        .eq("player_id", missedGoal.id);
      return data?.length ?? 0;
    })
    .toBe(1);

  await page.getByRole("button", { name: /finish game/i }).click();
  const summary = page.locator("#game-summary-text");
  await expect(summary).toContainText(/def|drew/, { timeout: 10_000 });
  const text = (await summary.textContent()) ?? "";
  const scorers = text.split("Scorers:")[1]?.split("\n")[0] ?? "";
  expect(scorers).toContain(`${kicker.full_name} (#${kicker.jersey_number}) 1.0`);
  expect(scorers).toContain(`${missedGoal.full_name} (#${missedGoal.jersey_number}) 1.0`);
  expect(scorers).not.toContain(wrongBehind.full_name);
});
