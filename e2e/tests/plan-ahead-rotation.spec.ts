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

// ─── Inline SwapCard override (F1 inline) ─────────────────────────
// The same override the planner does, but WITHOUT leaving the field:
// the coach taps the incoming chip on the SwapCard, picks a different
// bench player from the inline picker, and that choice is pinned via
// the SAME plannedRotation slice — the SwapCard shows it "Edited" and
// "Do all" applies the coach's pick, not the engine's.
//
//   1. Seed an AFL game mid-Q1 with a swappable bench (as F1 above).
//   2. Reach the sub-due moment, dismiss the SubDueModal once.
//   3. Expand the SwapCard, tap pair 0's incoming chip, and pick a
//      bench option the engine did NOT already have coming on there.
//   4. Assert: the pair shows the "Edited" badge + the "Planned sub
//      ready" badge surfaces (the inline edit pinned, same as the
//      planner's "Pin this sub").
//   5. "Do all", then assert a `swap` event landed bringing the
//      coach-picked player on — proving the inline override was
//      honoured end-to-end.
test("F1-inline: overriding the incoming player on the SwapCard pins it and is honoured", async ({
  page,
}) => {
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

  await admin
    .from("games")
    .update({ clock_multiplier: 1, sub_interval_seconds: 40 })
    .eq("id", game.id);

  await admin.from("game_availability").insert(
    players.map((p) => ({
      game_id: game.id,
      player_id: p.id,
      status: "available" as const,
      updated_by: ownerId,
    })),
  );

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

  await page.addInitScript(() => {
    try {
      localStorage.setItem("gm-walkthrough-seen", "1");
    } catch {}
  });

  await page.goto(`/teams/${team.id}/games/${game.id}/live`);
  await expect(page.getByTestId(`player-tile-${players[0].id}`)).toBeVisible({
    timeout: 10_000,
  });

  // Reach sub-due and clear the modal so the inline SwapCard is editable.
  await expect(
    page.getByRole("button", { name: /^got it$/i }),
  ).toBeVisible({ timeout: 60_000 });
  await page.getByRole("button", { name: /^got it$/i }).click();

  // Expand the SwapCard and open pair 0's incoming picker.
  const toggle = page.getByTestId("swapcard-toggle");
  await expect(toggle).toBeVisible({ timeout: 5_000 });
  await toggle.click();
  await page.getByTestId("swap-pair-0-on").click();

  // Pick a bench option the engine did NOT already have coming on here
  // (the picker marks the current pick with bg-brand-600, so a
  // :not(.bg-brand-600) option is guaranteed to be a real change).
  const freshOption = page
    .locator('[data-testid^="swap-option-"]:not(.bg-brand-600)')
    .first();
  await expect(freshOption).toBeVisible({ timeout: 5_000 });
  const optionTestId = await freshOption.getAttribute("data-testid");
  const chosenOnId = optionTestId!.replace("swap-option-", "");
  await freshOption.click();

  // The edit pinned: the pair now wears the inline "Edited" badge. (The
  // old "Planned sub ready" row badge went away with the Plan-ahead
  // button in issue 6 — the SwapCard's own Edited badge is the pin's
  // visible state now.)
  await expect(page.getByTestId("swap-pair-0-edited")).toBeVisible({
    timeout: 5_000,
  });

  // Apply everything and confirm the coach-picked player came on.
  await page.getByTestId("swapcard-apply-all").click();
  await expect
    .poll(
      async () => {
        const { data } = await admin
          .from("game_events")
          .select("metadata")
          .eq("game_id", game.id)
          .eq("type", "swap");
        return (data ?? []).some(
          (e) =>
            ((e.metadata ?? {}) as { on_player_id?: string }).on_player_id ===
            chosenOnId,
        );
      },
      { timeout: 7_000, intervals: [200, 200, 500, 500, 1000] },
    )
    .toBe(true);
});

// ─── Plan-ahead rotation: build-next-period → pre-seed (F2) ───────
// The headline F2 promise: in the final minutes of a period the coach
// can build the NEXT period's lineup, and when the break arrives it
// opens PRE-SEEDED from that pin instead of recomputing its own cold
// suggestion.
//
// This spec drives that contract end-to-end through the real AFL live
// UI — the SAME shared GamePlanModal F1 uses, no store pokes:
//
//   1. Seed an AFL game already INSIDE Q1's final rotation window by
//      backdating the quarter_start event so the live clock derives a
//      mid-window elapsed on load (quarterStartedAt = the event's
//      created_at, see fairness replay). A short quarter keeps the
//      hooter close enough to reach the break inside the test budget
//      but far enough that pinning happens comfortably first.
//   2. Assert the "Plan Q2" entry is visible — proving the final-window
//      gate (inFinalWindow && !isLastPeriod) engaged from the real
//      clock, not a hardcoded period count.
//   3. Open the shared planner on the NEXT period's tab and pin it.
//      The "Next period ready" badge confirms the pin registered into
//      the ONE shared plannedRotation slice (the nextPeriod* fields).
//   4. Let the hooter fire and confirm the QuarterEndModal. The break
//      (QuarterBreak) renders.
//   5. Assert the "Pre-filled from your planned Q2 lineup" banner is up
//      — proving the break opened SEEDED from the pin (the banner only
//      renders when seedNextPeriodLineup returns a non-null lineup for
//      the upcoming period). The reconcile specifics (stale-drop, per-
//      group shape) are pinned by the cross-sport unit spec.
//
// Sport-neutral by construction: AFL is the reference here, but the
// seed helper + GamePlanModal + break pre-seed are shared verbatim by
// netball + league, so this one UI proof covers the shared contract.
test("F2: a pinned next-period lineup pre-seeds the quarter break", async ({
  page,
}) => {
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

  // Real-time clock, a SHORT 50s quarter, and a 45s sub interval.
  // inFinalWindow = nowMs >= quarterMs - effectiveSubIntervalMs
  //              = nowMs >= 50s - 45s = nowMs >= 5s.
  // Backdating quarter_start ~12s puts us in the window on load with a
  // ~38s margin to the hooter (50s) — long enough to pin first — and
  // the auto-sub falls due at ~57s (12 + 45), AFTER the hooter, so the
  // SubDueModal never pops to block the planner.
  await admin
    .from("games")
    .update({
      clock_multiplier: 1,
      sub_interval_seconds: 45,
      quarter_length_seconds: 50,
    })
    .eq("id", game.id);

  await admin.from("game_availability").insert(
    players.map((p) => ({
      game_id: game.id,
      player_id: p.id,
      status: "available" as const,
      updated_by: ownerId,
    })),
  );

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

  // Backdate the clock: lineup_set just before quarter_start, and
  // quarter_start ~12s ago so the replay's quarterStartedAt lands us
  // mid-final-window on load.
  const quarterStartedAt = new Date(Date.now() - 12_000).toISOString();
  const lineupSetAt = new Date(Date.now() - 13_000).toISOString();
  await admin.from("game_events").insert([
    {
      game_id: game.id,
      type: "lineup_set",
      metadata: { lineup },
      created_by: ownerId,
      created_at: lineupSetAt,
    },
    {
      game_id: game.id,
      type: "quarter_start",
      metadata: { quarter: 1 },
      created_by: ownerId,
      created_at: quarterStartedAt,
    },
  ]);
  await admin.from("games").update({ status: "in_progress" }).eq("id", game.id);

  await page.addInitScript(() => {
    try {
      localStorage.setItem("gm-walkthrough-seen", "1");
    } catch {}
  });

  await page.goto(`/teams/${team.id}/games/${game.id}/live`);

  // The live field is up.
  await expect(page.getByTestId(`player-tile-${players[0].id}`)).toBeVisible({
    timeout: 10_000,
  });

  // ─── Final-window gate: the "Plan Q2" entry is offered ──────────
  const planNextEntry = page.getByTestId("plan-next-period-entry");
  await expect(planNextEntry).toBeVisible({ timeout: 10_000 });

  // ─── Build the next period + pin it ─────────────────────────────
  await planNextEntry.click();
  await expect(
    page.getByRole("heading", { name: /^game plan$/i }),
  ).toBeVisible({ timeout: 5_000 });

  // Pin the projected Q2 lineup straight back to the live game (the
  // "build next period" action). Closes the planner.
  await page.getByTestId("game-plan-pin").click();

  // Pin registered: the "Next period ready" badge surfaces (D-15).
  await expect(page.getByTestId("planned-next-period-badge")).toBeVisible({
    timeout: 5_000,
  });

  // ─── Reach the break: hooter → confirm → QuarterBreak ───────────
  // The auto-hooter fires at ~38s and opens the QuarterEndModal; its
  // primary CTA ends Q1 and transitions to the break.
  await page
    .getByRole("button", { name: /select team for q2/i })
    .click({ timeout: 60_000 });

  // ─── Assert: the break opened PRE-SEEDED from the pin ───────────
  // The banner only renders when the seed helper returns a non-null
  // lineup for the upcoming period — i.e. the pin was honoured.
  await expect(page.getByTestId("planned-seed-banner")).toBeVisible({
    timeout: 15_000,
  });
});
