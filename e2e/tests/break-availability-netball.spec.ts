// ─── B2 / AVAIL-02 regression: manage availability at the break (netball) ───
// At a period break a netball coach must be able to:
//   1. ADD a newly-arrived player (NOT available pre-game) into the
//      game — lands a `player_arrived` event + flips game_availability
//      to 'available' (canonical addLateArrival writer).
//   2. MARK a present on-court player OUT — forces a replacement pick
//      (InjuryReplacementModal); records an injury event with
//      metadata.reason === "out" (distinct from a plain injury). Netball
//      has no `swap` event writer at the break — the durable
//      distinguishing record is the out-reason injury event; the
//      replacement takes the vacated court position in the next-quarter
//      lineup (period_break_swap on Start Q2). So we assert the OUT
//      event, NOT a swap event.
//   3. MARK a player INJURED — the existing affordance still works
//      (regression guard).
//
// Pre-fix this FAILS: NetballQuarterBreak has no "Manage availability"
// entry — add-arrived and mark-out do not exist at the break.
//
// Covers:
//   - src/components/netball/NetballQuarterBreak.tsx (the new break entry)
//   - addLateArrival / markInjury(reason:"out")

import { test, expect } from "@playwright/test";
import { createAdminClient } from "../fixtures/supabase";
import { makeTeam, makePlayers, makeGame } from "../fixtures/factories";

test.describe.configure({ mode: "parallel" });

const NETBALL_LINEUP_KEYS = ["gs", "ga", "wa", "c", "wd", "gd", "gk"] as const;

async function suppressWalkthrough(
  page: import("@playwright/test").Page,
): Promise<void> {
  await page.addInitScript(() => {
    try {
      localStorage.setItem("nb-walkthrough-seen", "1");
    } catch {}
  });
}

async function enterQBreakView(
  page: import("@playwright/test").Page,
  admin: ReturnType<typeof createAdminClient>,
  gameId: string,
): Promise<void> {
  await expect
    .poll(
      async () => {
        const { data } = await admin
          .from("game_events")
          .select("type, metadata")
          .eq("game_id", gameId)
          .eq("type", "quarter_end");
        return (data ?? []).some(
          (e) => (e.metadata as { quarter?: number } | null)?.quarter === 1,
        );
      },
      { timeout: 10_000, intervals: [200, 500, 500, 1000, 1000] },
    )
    .toBe(true);
  await expect(
    page.getByRole("button", { name: /^ready for q2$/i }),
  ).toBeVisible({ timeout: 10_000 });
}

async function expandGameSettings(
  page: import("@playwright/test").Page,
): Promise<void> {
  const trigger = page.getByRole("button", { name: /game settings/i });
  if ((await trigger.getAttribute("aria-expanded")) !== "true") {
    await trigger.click();
  }
  await expect(trigger).toHaveAttribute("aria-expanded", "true");
}

test("netball: at the break a coach can add an arrived player, mark a player out (out reason), and mark a player injured", async ({
  page,
}) => {
  const admin = createAdminClient();
  const { data: superAdmin } = await admin.auth.admin.listUsers();
  const ownerId = superAdmin.users.find(
    (u) => u.email === process.env.TEST_SUPER_ADMIN_EMAIL,
  )!.id;

  const team = await makeTeam(admin, {
    ownerId,
    ageGroup: "go",
    sport: "netball",
    name: `NB-AVAIL-BRK-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
  });
  const teamQS = 480; // 8-min quarter so the auto-hooter fires fast.
  await admin
    .from("teams")
    .update({ track_scoring: false, quarter_length_seconds: teamQS })
    .eq("id", team.id);

  // 10 players: 7 court + 2 bench + 1 LATE ARRIVAL kept off-court and
  // NOT available pre-game.
  const players = await makePlayers(admin, {
    teamId: team.id,
    ownerId,
    count: 10,
    ageGroup: "U10",
  });
  const game = await makeGame(admin, {
    teamId: team.id,
    ownerId,
    ageGroup: "U10",
  });

  const arrival = players[9]; // off-court, NOT available pre-game
  const outPlayer = players[0]; // GS — the on-court player to take out
  const replacement = players[7]; // first bench player
  const injurePlayer = players[1]; // GA — for the mark-injured regression

  // Seed game_availability for everyone EXCEPT the late arrival.
  await admin.from("game_availability").insert(
    players
      .filter((p) => p.id !== arrival.id)
      .map((p) => ({ game_id: game.id, player_id: p.id, status: "available" })),
  );

  // Q1 lineup: players[0..6] on the 7 court positions, players[7..8]
  // on the bench. arrival (players[9]) is nowhere.
  const positions: Record<string, string[]> = Object.fromEntries(
    NETBALL_LINEUP_KEYS.map((k, i) => [k, [players[i].id]]),
  );
  const bench = [players[7].id, players[8].id];
  const lineup = { positions, bench };

  const startedAt = new Date(Date.now() - (teamQS + 60) * 1000).toISOString();
  await admin.from("game_events").insert([
    {
      game_id: game.id,
      type: "lineup_set",
      metadata: { lineup },
      created_by: ownerId,
      created_at: startedAt,
    },
    {
      game_id: game.id,
      type: "quarter_start",
      metadata: { quarter: 1 },
      created_by: ownerId,
      created_at: startedAt,
    },
  ]);
  await admin.from("games").update({ status: "in_progress" }).eq("id", game.id);

  await suppressWalkthrough(page);
  await page.goto(`/teams/${team.id}/games/${game.id}/live`);
  await enterQBreakView(page, admin, game.id);

  // The break-surface availability controls live in the collapsed
  // "Game settings" / Match-adjustments section.
  await expandGameSettings(page);

  // ─── 1. ADD ARRIVED ────────────────────────────────────────────
  await page
    .getByRole("button", { name: /add (an )?arrived player|add arrived/i })
    .click();
  await page
    .getByRole("button", { name: new RegExp(arrival.full_name, "i") })
    .click();

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
  await page
    .getByRole("button", { name: new RegExp(outPlayer.full_name, "i") })
    .click();
  const replacementDialog = page.getByRole("dialog", {
    name: /who comes on at/i,
  });
  await expect(replacementDialog).toBeVisible({ timeout: 5_000 });
  await replacementDialog
    .getByRole("button", { name: new RegExp(replacement.full_name, "i") })
    .click();

  // Netball records an injury event with the OUT reason (no swap event
  // exists at the netball break — the replacement lands via the
  // next-quarter lineup / period_break_swap).
  await expect
    .poll(
      async () => {
        const { data } = await admin
          .from("game_events")
          .select("type, player_id, metadata")
          .eq("game_id", game.id)
          .eq("type", "injury")
          .eq("player_id", outPlayer.id);
        return (data ?? []).some(
          (e) =>
            (e.metadata as { injured?: boolean })?.injured === true &&
            (e.metadata as { reason?: string })?.reason === "out",
        );
      },
      { timeout: 10_000, intervals: [200, 200, 500, 500, 1000] },
    )
    .toBe(true);

  // ─── 3. MARK INJURED (regression guard) ────────────────────────
  await page
    .getByRole("button", { name: /mark (a player|player)? ?injured|injure/i })
    .first()
    .click();
  await page
    .getByRole("button", { name: new RegExp(injurePlayer.full_name, "i") })
    .click();

  await expect
    .poll(
      async () => {
        const { data } = await admin
          .from("game_events")
          .select("type, player_id, metadata")
          .eq("game_id", game.id)
          .eq("type", "injury")
          .eq("player_id", injurePlayer.id);
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
