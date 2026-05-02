// Regression coverage for "rotation changes when you start the next
// quarter": user reported that the lineup confirmed in QuarterBreak
// (e.g. 4 players in fwd) doesn't match the lineup displayed in Q2
// (e.g. 3 of those 4 in fwd, one missing). Setup mirrors the user's
// scenario: Q1 with a mid-quarter zone swap, then verify the
// QuarterBreak's displayed Q2 plan matches the live Q2 view tile-
// for-tile after the modal kickoff.
//
// Hypothesis: replayGame doesn't handle field_zone_swap events
// (verified by grepping fairness.ts) so any zone swap during Q1
// gets lost on the next page revalidate. The hydration bailout
// MIGHT protect us in same-session flow, but if the bailout fails
// for any reason, the lineup snaps back to the un-swapped state.
//
// Covers: src/lib/fairness.ts replayGame, field_zone_swap branch
//         src/components/live/QuarterBreak.tsx handleStart

import { test, expect } from "@playwright/test";
import { createAdminClient } from "../fixtures/supabase";
import { makeTeam, makePlayers, makeGame } from "../fixtures/factories";

test.describe.configure({ mode: "parallel" });

test("AFL: lineup confirmed in QuarterBreak after a Q1 zone swap survives Start Q2", async ({
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

  // Build a lineup: 4 back, 4 mid, 4 fwd, 3 bench.
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

  // Backdate the quarter so the auto-hooter has already fired by
  // page load — we want the QuarterEndModal up so the test can
  // confirm it and reach QuarterBreak directly.
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
    // Q1 mid-quarter zone swap: first fwd player and first mid
    // player swap zones. After replay, fwd should contain the
    // first mid id and mid should contain the first fwd id.
    {
      game_id: game.id,
      type: "field_zone_swap",
      metadata: {
        player_a_id: fwdIds[0],
        zone_a: "fwd",
        player_b_id: midIds[0],
        zone_b: "mid",
        quarter: 1,
        elapsed_ms: 5 * 60_000,
      },
      created_by: ownerId,
      created_at: new Date(Date.now() - 8 * 60_000).toISOString(),
    },
  ]);
  await admin.from("games").update({ status: "in_progress" }).eq("id", game.id);

  await page.goto(`/teams/${team.id}/games/${game.id}/live`);

  // QuarterEndModal pops because the clock ran past the hooter.
  // Confirm to reach QuarterBreak.
  await page
    .getByRole("button", { name: /select team for q2/i })
    .click({ timeout: 10_000 });

  // QuarterBreak is up. Capture which players are listed in the
  // forward zone (the rendered slot). We accept whatever the
  // suggester chose — the test's contract is "what you see here is
  // what you get in Q2", not "the suggester picked X".
  await expect(
    page.getByRole("button", { name: /^start q2$/i }),
  ).toBeVisible({ timeout: 5_000 });

  // Read the rendered FWD slot's player tiles. The slot heading
  // is "Fwd" (per QuarterBreak.tsx slotLabel + ZONE_SHORT_LABELS),
  // and the section structure is:
  //   <heading "Fwd"> ... <list> <listitem> <button "<Name> <transition>"> ...
  // We extract the first name (the leading word) from each tile's
  // accessible text.
  // Match known factory player names — textContent jams jersey
  // number + name + transition label together with no whitespace,
  // so a regex against the squad name pool is the most robust
  // extractor. The factory uses 15 distinct single-word first
  // names from PLAYER_FIRST_NAMES in fixtures/factories.ts.
  const SQUAD_NAMES = [
    "Alicia", "Brendan", "Camille", "Damian", "Elena",
    "Felix", "Gemma", "Harvey", "Ingrid", "Joaquin",
    "Karina", "Lachlan", "Maeve", "Nikolai", "Octavia",
  ];
  const namePattern = new RegExp(`(${SQUAD_NAMES.join("|")})`, "g");
  const fwdNamesInBreak = await page
    .locator('h3:has-text("Fwd")')
    .first()
    .locator("xpath=../following-sibling::ul[1]")
    .locator("li button")
    .evaluateAll((btns, names) => {
      const re = new RegExp(`(${(names as string[]).join("|")})`);
      return btns
        .map((b) => (b.textContent ?? "").trim())
        .map((t) => {
          const m = t.match(re);
          return m ? m[1] : "";
        })
        .filter((s) => s.length > 0);
    }, SQUAD_NAMES);
  expect(
    fwdNamesInBreak.length,
    "no fwd player tiles found in QuarterBreak — selector or DOM mismatch",
  ).toBeGreaterThan(0);

  // Tap "Start Q2" in the lineup picker, then "Start Q2" in the
  // await-kickoff modal to actually start the clock.
  await page.getByRole("button", { name: /^start q2$/i }).first().click();
  await expect(
    page.getByRole("heading", { name: /^ready for q2$/i }),
  ).toBeVisible({ timeout: 5_000 });
  await page.getByRole("button", { name: /^start q2$/i }).last().click();
  await expect(
    page.getByRole("heading", { name: /^ready for q2$/i }),
  ).toBeHidden({ timeout: 3_000 });

  // Q2 is now live. The Field component renders the lineup with
  // FWD/CENTRE/BACK columns. Read the FWD column's player tiles.
  await expect(
    page.getByRole("button", { name: /^pause clock$/i }),
  ).toBeVisible({ timeout: 5_000 });

  // PlayerTile buttons in the live Field render their accessible
  // name from concatenated child text — starting with the zone
  // short label "FWD"/"CEN"/"BCK" then first name then jersey/time.
  // Match by accessible-name prefix and extract the first name.
  const fwdNamesInLive = await page
    .getByRole("button", { name: /^FWD\s/ })
    .evaluateAll((btns) =>
      btns
        .map((b) => (b.textContent ?? "").trim())
        // Text content is "FWD<First>#N · <time>..." with no
        // separators between tokens — split on whitespace OR # to
        // pull the first name reliably.
        .map((text) => {
          // Strip the leading "FWD" then take the next alphabetic run.
          const stripped = text.replace(/^FWD\s*/, "");
          const m = stripped.match(/^([A-Za-z]+)/);
          return m ? m[1] : "";
        })
        .filter((s) => s.length > 0),
    );
  expect(fwdNamesInLive.length).toBe(fwdNamesInBreak.length);

  // Both lists should contain the same set of player first names.
  // The pre-fix bug causes the suggester to re-run after setLineup
  // updates the store mid-handleStart, picking a different bench
  // player to bring on — so the user sees one set in QuarterBreak
  // but a different set in Q2.
  const sortedBreak = [...fwdNamesInBreak].sort();
  const sortedLive = [...fwdNamesInLive].sort();
  expect(
    sortedLive,
    `FWD lineup mismatch — QuarterBreak: [${sortedBreak.join(", ")}], Live Q2: [${sortedLive.join(", ")}]`,
  ).toEqual(sortedBreak);
});
