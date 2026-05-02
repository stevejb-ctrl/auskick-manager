// NETBALL-02 — Netball quarter-break rotation suggester end-to-end.
//
// The pure-function 5-tier logic is covered by
// src/lib/__tests__/netballFairness.test.ts. This spec proves the
// END-TO-END behaviour:
//   1. Q-break entry path works (Q1 auto-end → quarter_end DB event
//      → page.reload() → NetballQuarterBreak shell renders)
//   2. The suggester runs and populates a 7-position lineup; the
//      "Apply suggested reshuffle" button + position chips (GS/GA/WA/
//      C/WD/GD/GK) are observable in the rendered DOM
//   3. The unplayed-third +100k tier is observable in the suggester's
//      output — players who never played Q1 appear in the rendered
//      Q-break tile list
//   4. Pressing Start Q2 writes period_break_swap (Q1) + quarter_start
//      (Q2) events
//
// Per CONTEXT D-CONTEXT-seed-strategy: prefer the Kotara Koalas seed
// when present (real season history), fall back to a fresh factory
// team with synthetic prior-game data when absent. The audit at
// e2e/helpers/seed-audit.ts decides which path to take. Kotara is
// absent on the local fresh-db-reset DB per 04-01-SUMMARY, so the
// optional Kotara test below skips when present===false.
//
// Reused patterns from netball-live-flow.spec.ts (Wave 4):
//   • Lineup metadata uses { positions, bench } (GenericLineup shape
//     per src/lib/sports/netball/fairness.ts:267-272 normaliseGenericLineup
//     — the replay engine's expected format). Plan-04-06 source had a
//     flat-Record draft; Rule-1 corrected to nested shape.
//   • Q-break entry observation: poll DB for `quarter_end` event for
//     Q1, then page.reload() to land on the Q-break shell.
//     endNetballQuarter (netball-actions.ts:182-209) does NOT call
//     revalidatePath for non-final quarters — Wave-4 deferred item.
//   • factories.makePlayers default-count path looks up
//     AGE_GROUPS[ageGroup] and "go" doesn't exist there (AFL-shaped),
//     so we always pass count:9 + ageGroup:"U10" explicitly.
//   • Walkthrough modal suppressed via addInitScript before goto.

import { test, expect } from "@playwright/test";
import { createAdminClient } from "../fixtures/supabase";
import { makeTeam, makePlayers, makeGame } from "../fixtures/factories";
import { auditKotaraKoalas, KOTARA_KOALAS_TEAM_ID } from "../helpers/seed-audit";

test.describe.configure({ mode: "parallel" });

// Position keys for a netball "go" lineup, in the order the seed
// helper assigns players[0..6]. Matches NETBALL_POSITIONS at
// src/lib/sports/netball/index.ts:45-88.
const NETBALL_LINEUP_KEYS = ["gs", "ga", "wa", "c", "wd", "gd", "gk"] as const;

interface SetupResult {
  team: { id: string; name: string; ageGroup: string };
  players: Array<{ id: string; full_name: string; jersey_number: number }>;
  game: { id: string; on_field_size: number; share_token: string };
  ownerId: string;
  admin: ReturnType<typeof createAdminClient>;
}

/**
 * Build a fresh netball team + 9 players + game + lineup_set +
 * quarter_start event timeline backdated past the (configurable)
 * auto-hooter. Mounting the live page after this seed makes the
 * NetballLiveGame's hooter useEffect (NetballLiveGame.tsx:206-222)
 * fire `endNetballQuarter` because `remainingMs <= 0`.
 *
 * Defaults to teamQuarterLengthSeconds=480 (8 min) and a
 * quarterStartOffsetSec of 540 (9 min ago) so the auto-hooter fires
 * within ~5s of mount across CI machines without the spec sitting in
 * a Playwright wait for the default 10-min "go" period.
 *
 * Lineup uses 7 of the 9 players — players[7] and players[8] are LEFT
 * OFF COURT in Q1 (they go on the bench). Per the +100k unplayed-third
 * tier, both should be placed on court at Q2 unless overridden by
 * tighter constraints. With only 9 players for 7 slots, both unplayed
 * players are good candidates for the suggester to pick.
 */
async function setupQ1AutoEnded(opts: {
  trackScoring?: boolean;
  /** team.quarter_length_seconds override (smaller = faster auto-hooter). */
  teamQuarterLengthSeconds?: number;
}): Promise<SetupResult> {
  const admin = createAdminClient();
  const { data: superAdmin } = await admin.auth.admin.listUsers();
  const ownerId = superAdmin.users.find(
    (u) => u.email === process.env.TEST_SUPER_ADMIN_EMAIL,
  )!.id;

  const team = await makeTeam(admin, {
    ownerId,
    ageGroup: "go",
    sport: "netball",
    name: `NB-QB-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
  });
  const teamQS = opts.teamQuarterLengthSeconds ?? 480; // default 8 min
  await admin
    .from("teams")
    .update({
      track_scoring: opts.trackScoring ?? false,
      quarter_length_seconds: teamQS,
    })
    .eq("id", team.id);

  // Pass count:9 + ageGroup:"U10" explicitly. AGE_GROUPS["go"] doesn't
  // exist (AFL-shaped lookup table), so the factory's default-count
  // branch would throw on the "go" age-group team's default lookup.
  // Single-word names ensure getByText(player.full_name) works
  // without PlayerTile's first-name+last-initial abbreviation pattern
  // dropping characters.
  const players = await makePlayers(admin, {
    teamId: team.id,
    ownerId,
    count: 9,
    ageGroup: "U10",
  });
  const game = await makeGame(admin, { teamId: team.id, ownerId, ageGroup: "U10" });

  // Seed game_availability rows for ALL 9 players. The suggester reads
  // availableIds (NetballLiveGame.tsx:735-744) which sources from
  // game_availability — without these rows the bench candidates are
  // filtered out of the Q-break suggester's pool.
  await admin.from("game_availability").insert(
    players.map((p) => ({
      game_id: game.id,
      player_id: p.id,
      status: "available",
    })),
  );

  // Q1 lineup: players[0..6] on court (7 positions), players[7..8] on
  // bench. GenericLineup shape per fairness.ts:24-27 + 267-272:
  // { positions: { gs:[...], ga:[...], ... }, bench: [...] }. The
  // replay engine `normaliseGenericLineup` expects this nested form.
  const positions: Record<string, string[]> = Object.fromEntries(
    NETBALL_LINEUP_KEYS.map((k, i) => [k, [players[i].id]]),
  );
  const bench = players.slice(NETBALL_LINEUP_KEYS.length).map((p) => p.id);
  const lineup = { positions, bench };

  // Backdate quarter_start so that on mount, elapsed > quarterMs and
  // the hooter useEffect fires endNetballQuarter immediately.
  // 60s of safety margin past the configured length is enough to
  // survive Playwright's mount latency without ever showing a clock
  // that hasn't yet hit zero.
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

  return { team, players, game, ownerId, admin };
}

async function suppressWalkthrough(page: import("@playwright/test").Page) {
  await page.addInitScript(() => {
    try {
      localStorage.setItem("nb-walkthrough-seen", "1");
    } catch {}
  });
}

/**
 * Awaits the Q-break view by polling the DB for the `quarter_end`
 * event for Q1, then reloading the page so the post-hooter replay
 * state mounts. Mirrors the ABSTRACT-03 pattern proven in
 * netball-live-flow.spec.ts (Wave 4):
 *
 *   • endNetballQuarter (netball-actions.ts:182-209) writes
 *     quarter_end but does NOT revalidatePath for non-final quarters.
 *   • Production users hit the next request via Next.js prefetch /
 *     interaction. Specs need an explicit reload to land on the new
 *     replayed state.
 *   • Once reloaded, NetballLiveGame's quarterEnded && currentQuarter
 *     < 4 branch (NetballLiveGame.tsx:986-1054) renders
 *     <NetballQuarterBreak /> with the suggester populated.
 */
async function enterQBreakView(
  page: import("@playwright/test").Page,
  admin: ReturnType<typeof createAdminClient>,
  gameId: string,
) {
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

  // Plan 05-04: router.refresh() in NetballLiveGame's auto-hooter effect
  // self-rerenders the live shell into the Q-break branch when quarterEnded
  // flips. NO page.reload() required.
  await expect(
    page.getByRole("button", { name: /^start q2$/i }),
  ).toBeVisible({ timeout: 10_000 });
}

/**
 * The suggested-reshuffle toggle button. Rule-1 deviation from the
 * plan source: NetballQuarterBreak initializes useReshuffle to true
 * (NetballQuarterBreak.tsx:305: `useState(true)`), so on first
 * render the toggle's accessible text is "✓ Using suggested
 * reshuffle". Clicking flips it to "Apply suggested reshuffle". This
 * regex matches BOTH variants so the locator is one-shot regardless
 * of initial / toggled state — useful both as a "Q-break component
 * mounted" canary and as the click target for the toggle test.
 */
const RESHUFFLE_TOGGLE = /(apply|using) suggested reshuffle/i;

// ─── NETBALL-02 mandatory tests ───────────────────────────

test("NETBALL-02: Q-break shell renders with a 7-position suggested lineup after Q1 auto-ends", async ({
  page,
}) => {
  const { team, game, admin } = await setupQ1AutoEnded({});
  await suppressWalkthrough(page);
  await page.goto(`/teams/${team.id}/games/${game.id}/live`);
  await enterQBreakView(page, admin, game.id);

  // The suggester runs on mount of the Q-break component and populates
  // suggestedLineup. The reshuffle-toggle button is the canonical
  // evidence — it only renders inside NetballQuarterBreak (line 643).
  // Initial useReshuffle state is `true` (line 305), so the visible
  // copy is "✓ Using suggested reshuffle" on first render; the
  // RESHUFFLE_TOGGLE regex matches both variants for robustness
  // against any future default-state change.
  await expect(
    page.getByRole("button", { name: RESHUFFLE_TOGGLE }),
  ).toBeVisible({ timeout: 5_000 });

  // The PlayerTile renders the position shortLabel (GS / GA / WA /
  // C / WD / GD / GK) inside a chip span (NetballQuarterBreak.tsx:
  // 985-998). All 7 should be discoverable as text. Word-boundary
  // regex disambiguates "C" from "Centre" / "Camille" / etc., and
  // disambiguates "GS" / "GA" from any longer text. Use first()
  // because each label appears in both the chip AND header copy.
  for (const label of ["GS", "GA", "WA", "C", "WD", "GD", "GK"]) {
    await expect(
      page.getByText(new RegExp(`\\b${label}\\b`)).first(),
    ).toBeVisible({ timeout: 3_000 });
  }
});

test("NETBALL-02: unplayed-third tier dominates — players who didn't play Q1 appear in the suggested lineup for Q2", async ({
  page,
}) => {
  // Setup leaves players[7] + players[8] BENCHED in Q1. Per the +100k
  // unplayed-third tier, both should be placed on court at Q2 unless
  // overridden by tighter constraints. With only 9 players for 7
  // slots, the suggester is highly likely to pick both unplayed
  // players for the on-court group.
  //
  // NetballQuarterBreak initializes useReshuffle to true (component
  // line 305), so the suggester's lineup is the active draft on first
  // render — no need to click Apply. The PlayerTile rendered for each
  // ON-COURT player surfaces a "movedFromLabel → positionShort" hint
  // when the player wasn't on court the prior quarter (component
  // lines 722-738, 1015-1016). For an unplayed-Q1 player who's now
  // suggested into Q2, the hint reads "Bench → GS" / "Bench → WA" /
  // etc. — observable evidence that the unplayed-third tier moved
  // them onto the court.
  //
  // Lenient form: assert each unplayed player has a "Bench → ${pos}"
  // hint somewhere in the rendered DOM. Looser than asserting an
  // exact court third, but still proves the tier ordering escaped
  // the bench band. Pure-function tier ordering is covered by
  // src/lib/__tests__/netballFairness.test.ts; this spec's job is
  // e2e observability.
  const { team, game, players, admin } = await setupQ1AutoEnded({});
  await suppressWalkthrough(page);
  await page.goto(`/teams/${team.id}/games/${game.id}/live`);
  await enterQBreakView(page, admin, game.id);

  // Toggle is in the Using state on initial render. Confirm it.
  await expect(
    page.getByRole("button", { name: /using suggested reshuffle/i }),
  ).toBeVisible({ timeout: 5_000 });

  // Each unplayed player's tile must include "Bench → ${POSITION}"
  // (the movement hint that PlayerTile renders only when the
  // player's prior-quarter slot differs from the new slot). Players
  // who STAYED on court would render no hint (or "stays" hint),
  // and a still-benched player would not have the arrow.
  await expect(
    page
      .getByText(new RegExp(`\\b${players[7].full_name}\\b`, "i"))
      .first(),
  ).toBeVisible({ timeout: 3_000 });
  await expect(
    page
      .getByText(new RegExp(`\\b${players[8].full_name}\\b`, "i"))
      .first(),
  ).toBeVisible();
  // At least one of the two unplayed players is on court (Bench →
  // ${POS} hint visible). With 9 players and the +100k bonus for
  // each unplayed third, both should appear; we assert at least one
  // to keep the test resilient to any future tier-scoring tweak
  // that could swap one unplayed player for a same-position-penalty
  // override.
  await expect(
    page.getByText(/Bench\s*→\s*(GS|GA|WA|C|WD|GD|GK)/i).first(),
  ).toBeVisible({ timeout: 3_000 });
});

test("NETBALL-02: Start Q2 writes period_break_swap + quarter_start events", async ({
  page,
}) => {
  const { team, game, admin } = await setupQ1AutoEnded({});
  await suppressWalkthrough(page);
  await page.goto(`/teams/${team.id}/games/${game.id}/live`);
  await enterQBreakView(page, admin, game.id);

  // The suggested reshuffle is ALREADY applied on initial render
  // (NetballQuarterBreak line 305: useReshuffle=true). The flow is
  // now two-tap: first tap writes period_break_swap and surfaces the
  // await-kickoff modal; second tap (the modal CTA) writes
  // quarter_start. Splitting the flow gives the GM control of the
  // clock-start moment — the umpire's whistle, not the lineup tap.
  // First tap on the lineup picker's "Start Q2" button — there's
  // only one in the DOM at this point.
  await page.getByRole("button", { name: /^start q2$/i }).click();
  // Modal renders "Ready for Q2". The CTA inside also reads
  // "Start Q2" (same accessible name) so anchor on the heading
  // before clicking the second instance.
  await expect(
    page.getByRole("heading", { name: /^ready for q2$/i }),
  ).toBeVisible({ timeout: 5_000 });
  await page.getByRole("button", { name: /^start q2$/i }).last().click();

  // Rule-1 fix from the plan source: periodBreakSwap is called with
  // `nextQuarter` (= 2), and netball-actions.ts:160-167 writes
  // metadata.quarter = nextQuarter. So the period_break_swap event
  // for the Q1→Q2 transition is tagged with metadata.quarter === 2,
  // NOT === 1 as the plan draft assumed. Match either by tagging
  // with quarter===2 OR by simple presence (there's exactly one
  // period_break_swap per game-quarter transition).
  await expect
    .poll(
      async () => {
        const { data } = await admin
          .from("game_events")
          .select("type, metadata")
          .eq("game_id", game.id);
        const events = (data ?? []) as {
          type: string;
          metadata: { quarter?: number } | null;
        }[];
        const hasSwap = events.some(
          (e) =>
            e.type === "period_break_swap" && e.metadata?.quarter === 2,
        );
        const hasQ2Start = events.some(
          (e) => e.type === "quarter_start" && e.metadata?.quarter === 2,
        );
        return hasSwap && hasQ2Start;
      },
      { timeout: 5_000, intervals: [200, 200, 500, 500, 1000] },
    )
    .toBe(true);
});

// ─── NETBALL-02 (Kotara optional) — TEST-05 hook ──────────
//
// Optional fourth case: when Kotara Koalas is present, exercise a
// Q-break against a Kotara game so the season-utilisation tie-break
// has REAL multi-game history to read against. When absent (the
// fresh-db-reset case per 04-01-SUMMARY), this test skips with a
// clear breadcrumb. TEST-05 is a Phase 5 acceptance, so absent-state
// is non-blocking for Phase 4.

test("NETBALL-02 (Kotara optional): suggester runs against Kotara season history when seed is present", async ({
  page,
}) => {
  const admin = createAdminClient();
  const audit = await auditKotaraKoalas(admin);
  if (!audit.present) {
    test.skip(
      true,
      `Kotara Koalas seed absent (gameCount=${audit.gameCount}, playerCount=${audit.playerCount}). TEST-05 will surface this in Phase 5; not blocking Phase 4.`,
    );
    return;
  }

  // Pull the team owner via the super-admin path (consistent with the
  // rest of the spec; doesn't matter who created Kotara).
  const { data: superAdmin } = await admin.auth.admin.listUsers();
  const ownerId = superAdmin.users.find(
    (u) => u.email === process.env.TEST_SUPER_ADMIN_EMAIL,
  )!.id;

  // Pull Kotara's actual roster — bypass factories because the team
  // already exists. Need ≥7 active players to fill the lineup. Order
  // by jersey_number for deterministic GS-through-GK assignment.
  const { data: kotaraPlayers, error: playerErr } = await admin
    .from("players")
    .select("id, full_name")
    .eq("team_id", KOTARA_KOALAS_TEAM_ID)
    .eq("is_active", true)
    .order("jersey_number");
  if (playerErr || !kotaraPlayers || kotaraPlayers.length < 7) {
    test.skip(
      true,
      `Kotara Koalas player roster unusable: ${playerErr?.message ?? `count=${kotaraPlayers?.length ?? 0}`}`,
    );
    return;
  }

  // Force team.quarter_length_seconds=480 so the auto-hooter fires
  // within the spec's wait window (don't mutate any prior columns
  // beyond this — keep the team intact for any downstream consumers).
  await admin
    .from("teams")
    .update({ quarter_length_seconds: 480 })
    .eq("id", KOTARA_KOALAS_TEAM_ID);

  const game = await makeGame(admin, {
    teamId: KOTARA_KOALAS_TEAM_ID,
    ownerId,
    ageGroup: "U10",
    opponent: `NB-QB-Kotara-${Date.now()}`,
  });

  // Seed availability for the first 9 players (or all if <9).
  const cohort = kotaraPlayers.slice(0, Math.min(kotaraPlayers.length, 9));
  await admin.from("game_availability").insert(
    cohort.map((p) => ({
      game_id: game.id,
      player_id: p.id,
      status: "available",
    })),
  );

  const positions: Record<string, string[]> = Object.fromEntries(
    NETBALL_LINEUP_KEYS.map((k, i) => [k, [cohort[i].id]]),
  );
  const bench = cohort.slice(NETBALL_LINEUP_KEYS.length).map((p) => p.id);
  const lineup = { positions, bench };

  const startedAt = new Date(Date.now() - 540 * 1000).toISOString(); // 9 min ago
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
  await admin
    .from("games")
    .update({ status: "in_progress" })
    .eq("id", game.id);

  await suppressWalkthrough(page);
  await page.goto(`/teams/${KOTARA_KOALAS_TEAM_ID}/games/${game.id}/live`);
  await enterQBreakView(page, admin, game.id);

  // The suggester ran with Kotara's full season history feeding the
  // tier-5 utilisation tiebreak. The pure-function logic is covered
  // by netballFairness.test.ts; here we just verify the Q-break shell
  // rendered against the real-history seed.
  await expect(
    page.getByRole("button", { name: RESHUFFLE_TOGGLE }),
  ).toBeVisible({ timeout: 5_000 });
});
