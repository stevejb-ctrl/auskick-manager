// ─── Change who scored, at the break and at full time ────────
// Stagehand round 9 (9 Nov 2026: hockey, union, Oztag, the wrong-kid
// mission): the live Scores and fixes sheet can change who scored, but
// the break's and full time's score editors could only take a score off
// and add it again. Now they have the same "Change who scored", on the
// sheet's own list (LiveScoreFix) or, where the editor is the AFL-shaped
// ScoreReviewPanel, on its rows, and the fix is the sheet's: one
// "reassign" (the score taken off, the same score put back for the new
// kid in its own period), so the break's tiles, the share text and Stats
// follow.
//
// Covers: src/components/games/FixScoresDialog.tsx (ChangeScorer,
// fixScoreAs), src/components/live/ScoresSheet.tsx (LiveScoreFix),
// src/components/live/ScoreReviewPanel.tsx,
// src/components/quarter-break/BreakScoreEditor.tsx, and the breaks and
// full times that use them.

import { test, expect, type Locator, type Page } from "@playwright/test";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "../fixtures/supabase";
import { makeTeam, makePlayers, makeGame } from "../fixtures/factories";
import { waitForHydration } from "../helpers/navigation";
import { getAgeGroupConfig } from "../../src/lib/sports";
import type { SportId } from "../../src/lib/sports";

test.describe.configure({ mode: "parallel" });

type Kid = { id: string; full_name: string };

async function ownerOf(admin: SupabaseClient): Promise<string> {
  const { data } = await admin.auth.admin.listUsers({ perPage: 1000 });
  return data.users.find((u) => u.email === process.env.TEST_SUPER_ADMIN_EMAIL)!.id;
}

interface SportCase {
  sport: SportId;
  ageGroup: string;
  /** The score event, and what a break tile says for one. */
  scoreType: string;
  tileLabel: string;
  /** The share text's scorers line. */
  scorersLine: RegExp;
  lineup: (k: string[], size: number) => unknown;
  /** The wrong kid and the right one: two on the field (by squad index). */
  scorers: [number, number];
}

const CASES: Record<string, SportCase> = {
  afl: {
    sport: "afl",
    ageGroup: "U10",
    scoreType: "goal",
    tileLabel: "1 goals, 0 behinds",
    scorersLine: /Scorers: ([^\n]*)/,
    scorers: [8, 9],
    lineup: (k) => ({ back: k.slice(0, 4), hback: [], mid: k.slice(4, 8), hfwd: [], fwd: k.slice(8, 12), bench: k.slice(12) }),
  },
  hockey: {
    sport: "hockey",
    ageGroup: "U9",
    scoreType: "goal",
    tileLabel: "1 goals",
    scorersLine: /Goals: ([^\n]*)/,
    scorers: [5, 6],
    lineup: (k) => ({ keeper: k[0], lines: { def: k.slice(1, 3), mid: k.slice(3, 5), att: k.slice(5, 7), field: [] }, bench: k.slice(7) }),
  },
  union: {
    sport: "rugby_union",
    ageGroup: "U10",
    scoreType: "try",
    tileLabel: "1 tries",
    scorersLine: /Tries: ([^\n]*)/,
    scorers: [0, 1],
    lineup: (k, size) => ({ forwards: k.slice(0, Math.floor(size / 2)), backs: k.slice(Math.floor(size / 2), size), bench: k.slice(size) }),
  },
  oztag: {
    sport: "oztag",
    ageGroup: "U10",
    scoreType: "try",
    tileLabel: "1 try",
    scorersLine: /Tries: ([^\n]*)/,
    scorers: [0, 1],
    lineup: (k, size) => ({ lines: { middle: [], link: [], wing: [], field: k.slice(0, size) }, bench: k.slice(size) }),
  },
};

/**
 * A game with `upTo` periods played (1: at the first break; all of them:
 * at full time), and one score in period 1 by the first kid on the field.
 */
async function seed(c: SportCase, upTo: "break" | "full") {
  const admin = createAdminClient();
  const ownerId = await ownerOf(admin);
  const team = await makeTeam(admin, { ownerId, sport: c.sport, ageGroup: c.ageGroup, name: `CHG-${c.sport}-${Date.now() % 1e6}` });
  await admin.from("teams").update({ track_scoring: true }).eq("id", team.id);
  const game = await makeGame(admin, { teamId: team.id, ownerId, opponent: "Sharks" });
  const size = game.on_field_size;
  const players = (await makePlayers(admin, { teamId: team.id, ownerId, count: Math.max(size + 3, 15) })) as Kid[];
  const k = players.map((p) => p.id);
  await admin
    .from("game_availability")
    .insert(k.map((id) => ({ game_id: game.id, player_id: id, status: "available" as const, updated_by: ownerId })));
  const lineup = c.lineup(k, size);
  const periods = upTo === "break" ? 1 : getAgeGroupConfig(c.sport, c.ageGroup).periodCount;
  const periodMs = 8 * 60_000;
  const start = Date.now() - periods * (periodMs + 30_000) - 60_000;
  let t = 0;
  const row = (type: string, metadata: Record<string, unknown>, player_id: string | null = null) => ({
    game_id: game.id,
    type,
    player_id,
    metadata: { ...metadata, sport: c.sport },
    created_by: ownerId,
    created_at: new Date(start + (t += 1000)).toISOString(),
  });
  const [wrong, right] = c.scorers.map((i) => players[i]);
  const rows = [row("lineup_set", { lineup })];
  for (let q = 1; q <= periods; q++) {
    rows.push(row("quarter_start", { quarter: q }));
    if (q === 1) rows.push(row(c.scoreType, { quarter: 1, elapsed_ms: 60_000 }, wrong.id));
    t += periodMs;
    rows.push(row("quarter_end", { quarter: q, elapsed_ms: periodMs }));
  }
  const { error } = await admin.from("game_events").insert(rows);
  if (error) throw new Error(`seed: ${error.message}`);
  await admin.from("games").update({ status: "in_progress" }).eq("id", game.id);
  return { admin, team, game, wrong, right };
}

async function open(page: Page, teamId: string, gameId: string) {
  await page.addInitScript(() => {
    try {
      for (const k of ["gm-walkthrough-seen", "nb-walkthrough-seen", "league-walkthrough-seen"]) localStorage.setItem(k, "1");
      localStorage.setItem("siren-longpress-seen-v1", "true");
    } catch {}
  });
  await page.goto(`/teams/${teamId}/games/${gameId}/live`);
  await waitForHydration(page);
}

const changeButton = (scope: Locator | Page, kid: Kid) =>
  scope.getByRole("button", { name: new RegExp(`^Change who scored: ${kid.full_name},`) });

/** Change who scored, from `wrong` to `right`, in whatever list `scope` holds. */
async function changeScorer(scope: Locator | Page, wrong: Kid, right: Kid) {
  await changeButton(scope, wrong).click({ timeout: 15_000 });
  await scope.getByRole("combobox", { name: "Who scored" }).selectOption(right.id);
  await scope.getByRole("button", { name: "Save", exact: true }).click();
  await expect(changeButton(scope, right)).toBeVisible({ timeout: 15_000 });
  await expect(changeButton(scope, wrong)).toHaveCount(0);
}

/** The score now stands for `right`, still in period 1, and the old one's taken off. */
async function expectReassigned(admin: SupabaseClient, gameId: string, c: SportCase, wrong: Kid, right: Kid) {
  await expect
    .poll(
      async () => {
        const { data } = await admin
          .from("game_events")
          .select("id, type, player_id, metadata")
          .eq("game_id", gameId)
          .in("type", [c.scoreType, "score_undo"])
          .order("created_at");
        const rows = (data ?? []) as { id: string; type: string; player_id: string | null; metadata: Record<string, unknown> }[];
        const undone = new Set(rows.filter((r) => r.type === "score_undo").map((r) => r.metadata.target_event_id));
        return rows
          .filter((r) => r.type === c.scoreType && !undone.has(r.id))
          .map((r) => ({ player: r.player_id, quarter: r.metadata.quarter }));
      },
      { timeout: 15_000 },
    )
    .toEqual([{ player: right.id, quarter: 1 }]);
}

for (const [name, c] of Object.entries(CASES)) {
  test(`${name}: at the break, Change who scored moves the score to the right kid`, async ({ page }) => {
    const { admin, team, game, wrong, right } = await seed(c, "break");
    await open(page, team.id, game.id);
    const tile = (kid: Kid) => page.getByTestId(`player-tile-${kid.id}`);
    await expect(tile(wrong).getByLabel(c.tileLabel)).toBeVisible({ timeout: 20_000 });

    await page.getByRole("button", { name: /review and update scores/i }).click();
    const sheet = page.getByRole("dialog", { name: "Score" });
    await changeScorer(sheet, wrong, right);
    await expectReassigned(admin, game.id, c, wrong, right);
    await sheet.getByRole("button", { name: "Done" }).click();
    await expect(sheet).toHaveCount(0);

    // The kids' tiles follow: the score's on the right kid now.
    await expect(tile(right).getByLabel(c.tileLabel)).toBeVisible({ timeout: 15_000 });
    await expect(tile(wrong).getByLabel(c.tileLabel)).toHaveCount(0);
  });

  test(`${name}: at full time, Change who scored moves a first-period score, and the summary names the right kid`, async ({ page }) => {
    const { admin, team, game, wrong, right } = await seed(c, "full");
    await open(page, team.id, game.id);
    const finish = page.getByRole("button", { name: /^finish game$/i }).first();
    await expect(finish).toBeVisible({ timeout: 20_000 });

    await changeScorer(page, wrong, right);
    await expectReassigned(admin, game.id, c, wrong, right);

    // Finish: the share text's scorers are the right kid, not the wrong one.
    await finish.click();
    const summary = page.locator("pre").filter({ hasText: c.scorersLine });
    await expect(summary).toBeVisible({ timeout: 20_000 });
    const line = (await summary.innerText()).match(c.scorersLine)?.[1] ?? "";
    expect(line).toContain(right.full_name);
    expect(line).not.toContain(wrong.full_name);
  });
}
