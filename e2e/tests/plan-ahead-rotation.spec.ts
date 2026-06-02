// ─── Plan-ahead rotation: override-then-honour (F1) ───────────────
// The headline F1 promise: a coach can decide the UPCOMING sub BEFORE
// it falls due, and the live game HONOURS that decision instead of the
// engine's own pick when the sub-due moment arrives.
//
// This spec drives that contract end-to-end through the real AFL live
// UI — no store pokes, no shortcuts:
//
//   1. Seed an AFL game mid-Q1 (lineup_set + quarter_start) with a
//      swappable bench, status in_progress.
//   2. Let the clock reach the sub-due moment. The SubDueModal fires;
//      dismiss it once. (It won't re-pop while no sub is actually made,
//      so this leaves a clean, modal-free editing window — and the
//      inline SwapCard stays mounted showing the live suggester pick.)
//   3. Open the shared rotation planner via "Plan ahead" and tap-to-swap
//      a SPECIFIC on-field player (Alicia) OFF for a SPECIFIC bench
//      player (Octavia — deliberately the LAST bench player, the one
//      the fairness engine would NOT naturally pick first). Pin it.
//   4. The "Planned sub ready" badge confirms the pin registered, and
//      the inline SwapCard now shows the PINNED pair (Alicia → Octavia)
//      instead of the engine default.
//   5. Expand the SwapCard, tap "Do all".
//   6. Assert a `swap` game-event landed with off=Alicia, on=Octavia —
//      proving the coach's pin was honoured, not the engine's pick.
//
// Why genuinely drive the clock to sub-due rather than fake it: the
// honour path only engages when the live suggester would ALSO fire
// (the pin never *creates* a sub — it only swaps in WHO when one is
// already due). Reaching that state for real is the whole point.
//
// Why dismiss the SubDueModal BEFORE editing: it's a full-screen modal
// whose backdrop would otherwise block the planner entry + the inline
// SwapCard. Dismissing once is race-free because subState stays "due"
// (no sub made yet) so the effect that opens it never re-fires.
//
// Clock config: clock_multiplier=1 (real-time) so the 12-min Q1 hooter
// stays ~12 minutes away — an enormous margin past this <1-min test.

import { test, expect } from "@playwright/test";
import { createAdminClient } from "../fixtures/supabase";
import { makeTeam, makePlayers, makeGame } from "../fixtures/factories";
import { ALL_ZONES, zoneCapsFor } from "../../src/lib/fairness";
import { positionsFor } from "../../src/lib/ageGroups";
import type { Lineup } from "../../src/lib/types";

test.describe.configure({ mode: "parallel" });

test("F1: a pinned upcoming sub is honoured over the engine pick when the sub falls due", async ({
  page,
}) => {
  // Real-time clock + a 40s sub interval: the editing window stays
  // open well before the sub is due, the hooter is ~12 min away, and
  // the whole spec finishes in under a minute. Generous test timeout
  // for CI slop on the sub-due wait.
  test.setTimeout(120_000);

  const admin = createAdminClient();
  const { data: superAdmin } = await admin.auth.admin.listUsers();
  const ownerId = superAdmin.users.find(
    (u) => u.email === process.env.TEST_SUPER_ADMIN_EMAIL,
  )!.id;

  const team = await makeTeam(admin, { ownerId, ageGroup: "U10" });
  const players = await makePlayers(admin, {
    teamId: team.id,
    ownerId,
    count: 15,
  });
  const game = await makeGame(admin, { teamId: team.id, ownerId });

  // Real-time clock + sub due ~40s in. See header note.
  await admin
    .from("games")
    .update({ clock_multiplier: 1, sub_interval_seconds: 40 })
    .eq("id", game.id);

  // Mark every player available so the live page + projector see the
  // full squad (the planner seeds from the available roster).
  await admin.from("game_availability").insert(
    players.map((p) => ({
      game_id: game.id,
      player_id: p.id,
      status: "available" as const,
      updated_by: ownerId,
    })),
  );

  // Seed a mid-Q1 live state: lineup_set + quarter_start, status
  // in_progress. Same shape startGame writes (see live/actions.ts).
  const positionModel = positionsFor(team.ageGroup);
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

  // The two players the test pins on. Alicia (players[0]) is the first
  // on-field player; Octavia (players[14]) is the LAST bench player —
  // deliberately the least likely engine pick, so honouring it proves
  // the pin won over the default suggestion.
  const fieldPlayer = players[0];
  const benchPlayer = players[players.length - 1];
  expect(
    lineup.bench,
    "Octavia must start on the bench for this scenario",
  ).toContain(benchPlayer.id);
  expect(
    lineup.bench,
    "Alicia must start on the field for this scenario",
  ).not.toContain(fieldPlayer.id);

  await admin.from("game_events").insert([
    {
      game_id: game.id,
      type: "lineup_set",
      metadata: { lineup },
      created_by: ownerId,
    },
    {
      game_id: game.id,
      type: "quarter_start",
      metadata: { quarter: 1 },
      created_by: ownerId,
    },
  ]);
  await admin.from("games").update({ status: "in_progress" }).eq("id", game.id);

  // Suppress the first-visit walkthrough overlay so it can't intercept
  // the planner entry. Same trick as the full-game playthrough spec.
  await page.addInitScript(() => {
    try {
      localStorage.setItem("gm-walkthrough-seen", "1");
    } catch {}
  });

  await page.goto(`/teams/${team.id}/games/${game.id}/live`);

  // The live field is up: the chosen players' tiles are present.
  await expect(page.getByTestId(`player-tile-${fieldPlayer.id}`)).toBeVisible({
    timeout: 10_000,
  });

  // ─── Wait for the sub to fall due, dismiss the SubDueModal ──────
  // The live suggester only fires (and the honour path only engages)
  // once a sub is genuinely due. The SubDueModal's backdrop would
  // block the planner + SwapCard, so dismiss it once up front; with no
  // sub yet made, subState stays "due" and it won't re-open.
  await expect(
    page.getByRole("button", { name: /^got it$/i }),
  ).toBeVisible({ timeout: 60_000 });
  await page.getByRole("button", { name: /^got it$/i }).click();

  // ─── Plan ahead: override the upcoming sub ──────────────────────
  await page.getByTestId("plan-ahead-entry").click();
  await expect(
    page.getByRole("heading", { name: /^game plan$/i }),
  ).toBeVisible({ timeout: 5_000 });

  // Tap-to-swap the chosen on-field player OFF for the chosen bench
  // player. Scope to the planner's player rows (testid) so we don't
  // collide with the copy-text block, which also mentions the names.
  const rows = page.getByTestId("game-plan-player");
  await rows.filter({ hasText: fieldPlayer.full_name }).click();
  await expect(page.getByText(/swapping…/i)).toBeVisible();
  await rows.filter({ hasText: benchPlayer.full_name }).click();

  // Pin it back to the live game (closes the planner).
  await page.getByTestId("game-plan-pin").click();

  // Pin registered: the "Planned sub ready" badge surfaces in the
  // plan-ahead row (D-15 — the pin is visible to the coach).
  await expect(page.getByTestId("planned-sub-badge")).toBeVisible({
    timeout: 5_000,
  });

  // The inline SwapCard now reflects the HONOURED pin, not the engine
  // pick: it names the chosen bench player coming on. Expand and apply.
  const toggle = page.getByTestId("swapcard-toggle");
  await expect(toggle).toBeVisible({ timeout: 5_000 });
  await expect(toggle).toContainText(benchPlayer.full_name.split(" ")[0]);
  await toggle.click();
  await page.getByTestId("swapcard-apply-all").click();

  // ─── Assert: the PINNED pair was applied, not the engine default ─
  // recordSwap writes a `swap` event with metadata
  // { off_player_id, on_player_id, zone, ... }. The pinned pair is
  // Alicia OFF, Octavia ON — Octavia being the last bench player makes
  // this a pair the engine would not have produced on its own.
  await expect
    .poll(
      async () => {
        const { data } = await admin
          .from("game_events")
          .select("metadata")
          .eq("game_id", game.id)
          .eq("type", "swap");
        return (data ?? []).some((e) => {
          const m = (e.metadata ?? {}) as {
            off_player_id?: string;
            on_player_id?: string;
          };
          return (
            m.off_player_id === fieldPlayer.id &&
            m.on_player_id === benchPlayer.id
          );
        });
      },
      { timeout: 7_000, intervals: [200, 200, 500, 500, 1000] },
    )
    .toBe(true);
});
