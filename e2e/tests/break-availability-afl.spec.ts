// ─── B2 / AVAIL-02 regression: manage availability at the break (AFL) ───
// At a period break a coach must be able to:
//   1. ADD a newly-arrived player (one who was NOT available pre-game)
//      into the game — lands a `player_arrived` event + flips
//      game_availability to 'available' (canonical addLateArrival writer).
//   2. MARK a present on-field player OUT — forces a replacement pick
//      (InjuryReplacementModal); records an injury event with
//      metadata.reason === "out" (distinct from a plain injury) AND a
//      swap event placing the bench player at the vacated zone.
//   3. MARK a player INJURED — the existing affordance still works
//      (regression guard).
//
// Pre-fix this FAILS: the AFL QuarterBreak surface has no "Manage
// availability" entry — add-arrived and mark-out do not exist at the
// break, so those interactions can't be driven and the events never land.
//
// Covers:
//   - src/components/live/QuarterBreak.tsx (the new break entry)
//   - addLateArrival / markInjury(reason:"out") + recordSwap writers

import { test, expect } from "@playwright/test";
import { createAdminClient } from "../fixtures/supabase";
import { makeTeam, makePlayers, makeGame } from "../fixtures/factories";

test.describe.configure({ mode: "parallel" });

// Suppress the first-visit walkthrough overlay so it doesn't intercept
// the test's interactions. Must run before goto.
async function suppressWalkthrough(
  page: import("@playwright/test").Page,
): Promise<void> {
  await page.addInitScript(() => {
    try {
      localStorage.setItem("gm-walkthrough-seen", "1");
    } catch {}
  });
}

test("AFL: at the break a coach can add an arrived player, mark a player out (forced replacement), and mark a player injured", async ({
  page,
}) => {
  const admin = createAdminClient();
  const { data: superAdmin } = await admin.auth.admin.listUsers();
  const ownerId = superAdmin.users.find(
    (u) => u.email === process.env.TEST_SUPER_ADMIN_EMAIL,
  )!.id;

  const team = await makeTeam(admin, { ownerId, ageGroup: "U10" });
  // 15 players. 12 on field (U10 defaultOnFieldSize), 3 bench.
  const players = await makePlayers(admin, {
    teamId: team.id,
    ownerId,
    count: 15,
  });
  const game = await makeGame(admin, { teamId: team.id, ownerId });

  const onField = players.slice(0, game.on_field_size);
  const bench = players.slice(game.on_field_size);
  const third = Math.floor(game.on_field_size / 3);
  const backIds = onField.slice(0, third).map((p) => p.id);
  const midIds = onField.slice(third, third * 2).map((p) => p.id);
  const fwdIds = onField.slice(third * 2).map((p) => p.id);
  const lineup = {
    back: backIds,
    hback: [],
    mid: midIds,
    hfwd: [],
    fwd: fwdIds,
    bench: bench.map((p) => p.id),
  };

  // The player who ARRIVES at the break — deliberately NOT placed on
  // the field and NOT marked available pre-game. With a 15-name squad
  // and 15 players seeded, the only non-lineup player is the last one
  // we explicitly leave out: drop bench[bench.length-1] from the
  // lineup AND from the availability seed so they're a true late
  // arrival candidate.
  const arrival = bench[bench.length - 1];
  lineup.bench = lineup.bench.filter((id) => id !== arrival.id);

  // The on-field player we'll mark OUT, and the bench player who comes on.
  const outPlayer = onField[third]; // first MID player
  const replacement = bench[0];

  // Backdate the quarter so the auto-hooter already fired — the
  // QuarterEndModal pops on load and confirming it lands us in
  // QuarterBreak directly.
  const aMomentAgo = new Date(Date.now() - 13 * 60_000).toISOString();
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
      created_at: new Date(Date.now() - 60_000).toISOString(),
    },
  ]);
  // Everyone available EXCEPT the late arrival.
  await admin.from("game_availability").upsert(
    players
      .filter((p) => p.id !== arrival.id)
      .map((p) => ({
        game_id: game.id,
        player_id: p.id,
        status: "available",
        updated_by: ownerId,
        updated_at: new Date().toISOString(),
      })),
    { onConflict: "game_id,player_id" },
  );
  await admin.from("games").update({ status: "in_progress" }).eq("id", game.id);

  await suppressWalkthrough(page);
  await page.goto(`/teams/${team.id}/games/${game.id}/live`);

  // The QuarterEndModal pops because the clock ran past the hooter (and
  // quarter_end is seeded). If it's up, confirm to reach QuarterBreak;
  // otherwise we're already on the break surface.
  const selectTeamBtn = page.getByRole("button", {
    name: /select team for q2/i,
  });
  if (await selectTeamBtn.isVisible().catch(() => false)) {
    await selectTeamBtn.click({ timeout: 10_000 });
  }
  await expect(
    page.getByRole("button", { name: /^ready for q2$/i }),
  ).toBeVisible({ timeout: 15_000 });

  // Open the break-surface availability controls. The new entry lives
  // in the "Game settings" collapse (mirrors the existing Lend /
  // Mark-injured panel rhythm).
  const adjustments = page.getByRole("button", {
    name: /game settings/i,
  });
  if ((await adjustments.getAttribute("aria-expanded")) !== "true") {
    await adjustments.click();
  }

  // Freeze the lineup to "Keep last quarter" so the fairness suggester
  // doesn't rotate the seeded field/bench out from under us — the
  // mark-out flow needs `outPlayer` to still be on the field and
  // `replacement` to still be on the bench when we pick them.
  await page
    .getByRole("button", { name: /keep last quarter/i })
    .click();

  // ─── 1. ADD ARRIVED ────────────────────────────────────────────
  await page
    .getByRole("button", { name: /add (an )?arrived player|add arrived/i })
    .click();
  // A SlotFillSheet of not-yet-available squad members opens. Scope the
  // pick to the sheet dialog — the arrival's name can also appear in the
  // background lineup grid otherwise.
  const addArrivedSheet = page.getByRole("dialog", { name: /add arrived/i });
  await expect(addArrivedSheet).toBeVisible({ timeout: 5_000 });
  await addArrivedSheet
    .getByRole("button", { name: new RegExp(arrival.full_name, "i") })
    .click();

  // Assert a player_arrived event landed for the arrival.
  await expect
    .poll(
      async () => {
        const { data } = await admin
          .from("game_events")
          .select("type, player_id")
          .eq("game_id", game.id)
          .eq("type", "player_arrived")
          .eq("player_id", arrival.id);
        return data?.length ?? 0;
      },
      { timeout: 10_000, intervals: [200, 200, 500, 500, 1000] },
    )
    .toBeGreaterThanOrEqual(1);

  // ...and game_availability flipped to 'available' for the arrival.
  await expect
    .poll(
      async () => {
        const { data } = await admin
          .from("game_availability")
          .select("status")
          .eq("game_id", game.id)
          .eq("player_id", arrival.id)
          .maybeSingle();
        return data?.status ?? null;
      },
      { timeout: 10_000, intervals: [200, 200, 500, 500, 1000] },
    )
    .toBe("available");

  // ─── 2. MARK OUT (forced replacement) ──────────────────────────
  await page
    .getByRole("button", { name: /mark (a player|player) out|mark out/i })
    .click();
  // Pick the on-field player to take out — scope to the sheet dialog so
  // the same name in the background lineup grid doesn't collide.
  const markOutSheet = page.getByRole("dialog", { name: /mark out/i });
  await expect(markOutSheet).toBeVisible({ timeout: 5_000 });
  await markOutSheet
    .getByRole("button", { name: new RegExp(outPlayer.full_name, "i") })
    .click();
  // The InjuryReplacementModal opens — pick the bench replacement.
  const replacementDialog = page.getByRole("dialog", {
    name: /who comes on at/i,
  });
  await expect(replacementDialog).toBeVisible({ timeout: 5_000 });
  await replacementDialog
    .getByRole("button", { name: new RegExp(replacement.full_name, "i") })
    .click();

  // Assert BOTH an out event (injury with reason "out") AND a swap
  // event placing the bench replacement at the vacated MID zone.
  await expect
    .poll(
      async () => {
        const { data } = await admin
          .from("game_events")
          .select("type, player_id, metadata")
          .eq("game_id", game.id)
          .in("type", ["injury", "swap"]);
        const out = (data ?? []).find(
          (e) =>
            e.type === "injury" &&
            e.player_id === outPlayer.id &&
            (e.metadata as { injured?: boolean })?.injured === true &&
            (e.metadata as { reason?: string })?.reason === "out",
        );
        const sw = (data ?? []).find(
          (e) =>
            e.type === "swap" &&
            (e.metadata as { off_player_id?: string })?.off_player_id ===
              outPlayer.id &&
            (e.metadata as { on_player_id?: string })?.on_player_id ===
              replacement.id,
        );
        return Boolean(out) && Boolean(sw);
      },
      { timeout: 10_000, intervals: [200, 200, 500, 500, 1000] },
    )
    .toBe(true);

  // ─── 3. MARK INJURED (regression guard) ────────────────────────
  // The existing mark-injured affordance must still work at the break.
  // The mark-out flow's router.refresh() re-collapses Game settings, so
  // re-expand it before reaching for the Mark-injured trigger.
  if ((await adjustments.getAttribute("aria-expanded")) !== "true") {
    await adjustments.click();
  }
  const injurePlayer = backIds[0]; // a back-zone on-field player
  await page
    .getByRole("button", { name: /^mark injured$/i })
    .first()
    .click();
  // Scope the pick to the Mark-injured sheet dialog (the same name can
  // appear in the background lineup grid).
  const injuredSheet = page.getByRole("dialog", { name: /mark injured/i });
  await expect(injuredSheet).toBeVisible({ timeout: 5_000 });
  await injuredSheet
    .getByRole("button", {
      name: new RegExp(
        players.find((p) => p.id === injurePlayer)!.full_name,
        "i",
      ),
    })
    .click();

  await expect
    .poll(
      async () => {
        const { data } = await admin
          .from("game_events")
          .select("type, player_id, metadata")
          .eq("game_id", game.id)
          .eq("type", "injury")
          .eq("player_id", injurePlayer);
        return (data ?? []).some(
          (e) =>
            (e.metadata as { injured?: boolean })?.injured === true &&
            (e.metadata as { reason?: string })?.reason !== "out",
        );
      },
      { timeout: 10_000, intervals: [200, 200, 500, 500, 1000] },
    )
    .toBe(true);
});
