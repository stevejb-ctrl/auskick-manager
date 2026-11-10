// ─── Netball's full time, on the other sports' review ────────────────
// Live v3 (Steve, 10 Nov 2026): netball's full time was still the old
// review: the dark-pill score card, "Us" / "Them" boxes and the
// AFL-shaped "Fix scores" panel with its small "+ Add a missed score".
// Soccer, hockey, futsal, basketball, touch, Oztag and both rugbies use
// the shared BreakScoreEditor: the score by quarter, a missed goal for
// either side on buttons that name the team, Undo last score and the
// game's scores with "Change who scored". Netball now does too, with its
// own rule kept: a goal for us is a GS or a GA's.
//
// Covers: src/components/netball/NetballFullTimeReview.tsx,
// NetballLiveGame's full-time branch, and the shared
// src/components/quarter-break/BreakScoreEditor.tsx.

import { test, expect } from "@playwright/test";
import { createAdminClient } from "../fixtures/supabase";
import { makeTeam, makePlayers, makeGame } from "../fixtures/factories";
import { ownerOf, skipHints } from "../helpers/a11y";
import { waitForHydration } from "../helpers/navigation";

test.describe.configure({ mode: "parallel" });

const KEYS = ["gs", "ga", "wa", "c", "wd", "gd", "gk"] as const;

/** Four quarters played: GS scored in Q1, the Sharks in Q2. Not finished yet. */
async function atFullTime() {
  const admin = createAdminClient();
  const ownerId = await ownerOf(admin);
  const team = await makeTeam(admin, { ownerId, sport: "netball", ageGroup: "go", name: `NB-FT ${Date.now() % 100000}` });
  await admin.from("teams").update({ track_scoring: true }).eq("id", team.id);
  const players = await makePlayers(admin, { teamId: team.id, ownerId, count: 9, ageGroup: "U10" });
  const game = await makeGame(admin, { teamId: team.id, ownerId, opponent: "Sharks" });
  const ids = players.map((p) => p.id);
  const lineup = { positions: Object.fromEntries(KEYS.map((k, i) => [k, [ids[i]]])), bench: ids.slice(7) };
  const rows: { type: string; player_id?: string; metadata: Record<string, unknown> }[] = [
    { type: "lineup_set", metadata: { lineup } },
  ];
  for (let q = 1; q <= 4; q++) {
    rows.push({ type: "quarter_start", metadata: { quarter: q } });
    if (q === 1) rows.push({ type: "goal", player_id: ids[0], metadata: { quarter: 1, elapsed_ms: 60_000 } });
    if (q === 2) rows.push({ type: "opponent_goal", metadata: { quarter: 2, elapsed_ms: 60_000 } });
    rows.push({ type: "quarter_end", metadata: { quarter: q, elapsed_ms: 600_000 } });
  }
  const t0 = Date.now() - 3_600_000;
  const { error } = await admin.from("game_events").insert(
    rows.map((r, i) => ({
      ...r,
      player_id: r.player_id ?? null,
      game_id: game.id,
      created_by: ownerId,
      created_at: new Date(t0 + i * 1000).toISOString(),
    })),
  );
  if (error) throw new Error(`seed: ${error.message}`);
  await admin.from("games").update({ status: "in_progress", quarter_length_seconds: 600 }).eq("id", game.id);
  return { admin, team, game, players };
}

test("netball's full time is the shared review: the teams by name, their goal buttons, Undo, and the game's scores", async ({ page }) => {
  test.setTimeout(90_000);
  const { admin, team, game, players } = await atFullTime();
  await skipHints(page);
  await page.goto(`/teams/${team.id}/games/${game.id}/live`);
  await waitForHydration(page);
  const finish = page.getByRole("button", { name: /^finish game$/i });
  await expect(finish).toBeVisible({ timeout: 30_000 });

  // The old review's parts are gone: its "Us" / "Them" boxes and the
  // AFL-shaped Fix scores panel.
  await expect(page.getByText("Fix scores", { exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: /add a missed score/i })).toHaveCount(0);
  await expect(page.getByText("Them", { exact: true })).toHaveCount(0);

  // The shared editor: the game's scores, each with Change who scored.
  const scores = page.getByTestId("live-score-fix");
  await expect(scores).toBeVisible({ timeout: 15_000 });
  await expect(scores.getByRole("button", { name: new RegExp(`^Change who scored: ${players[0].full_name},`) })).toBeVisible({
    timeout: 15_000,
  });

  // A goal the Sharks scored that was missed: their button names them,
  // and it counts in Q4.
  const theirs = page.getByRole("button", { name: "Add goal, Sharks" });
  await expect(theirs).toBeVisible();
  const box = await theirs.boundingBox();
  expect(box?.height ?? 0, "the Sharks' +G is a 44 pt button").toBeGreaterThanOrEqual(44);
  await theirs.click();
  await expect
    .poll(async () => {
      const { data } = await admin.from("game_events").select("metadata").eq("game_id", game.id).eq("type", "opponent_goal");
      return (data ?? []).map((r) => (r.metadata as { quarter?: number }).quarter).sort();
    }, { timeout: 15_000 })
    .toEqual([2, 4]);

  // Ours: only the GS and the GA can score, so the picker offers those two.
  await page.getByRole("button", { name: new RegExp(`^Add goal, ${team.name}`) }).click();
  const picker = page.getByRole("dialog", { name: /record goal/i });
  await expect(picker).toBeVisible();
  await expect(picker.getByRole("button", { name: new RegExp(players[0].full_name) })).toBeVisible();
  await expect(picker.getByRole("button", { name: new RegExp(players[1].full_name) })).toBeVisible();
  await expect(picker.getByRole("button", { name: new RegExp(players[2].full_name) })).toHaveCount(0);
  await picker.getByRole("button", { name: new RegExp(players[1].full_name) }).click();
  await expect
    .poll(async () => {
      const { data } = await admin.from("game_events").select("player_id, metadata").eq("game_id", game.id).eq("type", "goal");
      return (data ?? []).filter((r) => r.player_id === players[1].id && (r.metadata as { quarter?: number }).quarter === 4).length;
    }, { timeout: 15_000 })
    .toBe(1);

  // Undo last score takes back the GA's goal, once.
  await page.getByRole("button", { name: /^undo last score$/i }).click();
  await expect
    .poll(async () => {
      const { data } = await admin.from("game_events").select("id").eq("game_id", game.id).eq("type", "score_undo");
      return data?.length ?? 0;
    }, { timeout: 15_000 })
    .toBe(1);

  // Then finish: the summary.
  await finish.click();
  await expect(page.getByText(/game summary/i).first()).toBeVisible({ timeout: 20_000 });
});
