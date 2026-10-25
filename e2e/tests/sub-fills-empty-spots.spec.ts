// ─── Sub suggestions fill empty spots first ──────────────────
// Round 3 edge cases, 24 Oct 2026:
//
//   - Basketball P1: with empty spots on court the sub card only offered
//     swaps ("Ruby → Archie"); following it took a kid off a short side.
//   - Hockey P1: the keeper was hurt with nobody to replace them; the
//     goal stayed empty with kids on the bench, nothing said so, and the
//     card offered outfield swaps.
//
// The card's first suggestion now puts a bench kid into the empty spot
// ("Empty spot → …", Put on), and hockey says "No keeper".

import { test, expect, type Page } from "@playwright/test";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "../fixtures/supabase";
import { makeTeam, makePlayers, makeGame } from "../fixtures/factories";
import { waitForHydration } from "../helpers/navigation";

test.describe.configure({ mode: "parallel" });

async function ownerOf(admin: SupabaseClient): Promise<string> {
  const { data } = await admin.auth.admin.listUsers({ perPage: 1000 });
  return data.users.find((u) => u.email === process.env.TEST_SUPER_ADMIN_EMAIL)!.id;
}

/** A game in its first period, events `ago` seconds back (a second apart). */
async function inPlay(
  admin: SupabaseClient,
  opts: { sport: "basketball" | "hockey"; ageGroup: string; name: string; count: number; events: (ids: string[]) => { type: string; player_id?: string; metadata: Record<string, unknown> }[] },
) {
  const ownerId = await ownerOf(admin);
  const team = await makeTeam(admin, { ownerId, sport: opts.sport, ageGroup: opts.ageGroup, name: `${opts.name}-${Date.now() % 100000}` });
  const players = await makePlayers(admin, { teamId: team.id, ownerId, count: opts.count });
  const ids = players.map((p) => p.id);
  const game = await makeGame(admin, { teamId: team.id, ownerId, opponent: "Rivals" });
  const { error } = await admin.from("games").update({ status: "in_progress", sub_interval_seconds: 600 }).eq("id", game.id);
  if (error) throw new Error(error.message);
  await admin.from("game_availability").insert(
    players.map((p) => ({ game_id: game.id, player_id: p.id, status: "available" as const, updated_by: ownerId })),
  );
  const rows = opts.events(ids);
  const { error: evErr } = await admin.from("game_events").insert(
    rows.map((e, i) => ({
      type: e.type,
      player_id: e.player_id ?? null,
      metadata: { ...e.metadata, sport: opts.sport },
      game_id: game.id,
      created_by: ownerId,
      created_at: new Date(Date.now() - (240 - i) * 1000).toISOString(),
    })),
  );
  if (evErr) throw new Error(evErr.message);
  return { team, game, players, ids, nameOf: (pid: string) => players.find((p) => p.id === pid)!.full_name };
}

async function lastSwap(admin: SupabaseClient, gameId: string) {
  const { data } = await admin.from("game_events").select("metadata, created_at").eq("game_id", gameId).eq("type", "swap").order("created_at", { ascending: false }).limit(1);
  return (data?.[0]?.metadata ?? null) as { off_player_id: string | null; on_player_id: string; line?: string } | null;
}

/** The sub card, opened. */
async function openSubCard(page: Page) {
  const header = page.locator("button[aria-expanded='false']").filter({ hasText: "→" });
  const open = page.locator("button[aria-expanded='true']").filter({ hasText: "→" });
  await expect(header.or(open)).toBeVisible({ timeout: 15_000 });
  if (await header.isVisible()) await header.click();
}

test("basketball: two hurt with nobody on, a late arrival goes on into the empty spot", async ({ page }) => {
  test.setTimeout(120_000);
  const admin = createAdminClient();
  // Five on (2 guards, 3 forwards); c and d hurt a minute in with nobody
  // on for them; f turns up at 2:00.
  const { team, game, ids, nameOf } = await inPlay(admin, {
    sport: "basketball",
    ageGroup: "U12",
    name: "BBL-FILL",
    count: 6,
    events: (k) => [
      { type: "lineup_set", metadata: { lineup: { lines: { guard: [k[0], k[1]], forward: [k[2], k[3], k[4]], court: [] }, bench: [] } } },
      { type: "quarter_start", metadata: { quarter: 1 } },
      { type: "injury", player_id: k[2], metadata: { quarter: 1, elapsed_ms: 60_000, injured: true } },
      { type: "injury", player_id: k[3], metadata: { quarter: 1, elapsed_ms: 70_000, injured: true } },
      { type: "player_arrived", player_id: k[5], metadata: { quarter: 1, elapsed_ms: 120_000 } },
    ],
  });
  await page.addInitScript(() => window.localStorage.setItem("siren-longpress-seen-v1", "true"));
  await page.goto(`/teams/${team.id}/games/${game.id}/live`);
  await waitForHydration(page);
  await openSubCard(page);
  const pair = page.getByTestId("basketball-swap-pair-0");
  await expect(pair).toContainText("Empty spot");
  await expect(pair).toContainText(nameOf(ids[5]).split(" ")[0]);
  await pair.getByRole("button", { name: /^Put .+ on$/ }).click();
  await expect.poll(() => lastSwap(admin, game.id), { timeout: 15_000 }).toMatchObject({ off_player_id: null, on_player_id: ids[5] });
});

test("hockey: the keeper hurt with nobody on — 'No keeper', and the card fills the goal first", async ({ page }) => {
  test.setTimeout(120_000);
  const admin = createAdminClient();
  // U10, 7 a side with a keeper (2-2-2): k0 in goal, k7 and k8 on the bench.
  const { team, game, ids } = await inPlay(admin, {
    sport: "hockey",
    ageGroup: "U10",
    name: "HOC-NOKEEP",
    count: 9,
    events: (k) => [
      { type: "lineup_set", metadata: { lineup: { keeper: k[0], lines: { def: [k[1], k[2]], mid: [k[3], k[4]], att: [k[5], k[6]], field: [] }, bench: [k[7], k[8]] } } },
      { type: "quarter_start", metadata: { quarter: 1 } },
      { type: "injury", player_id: k[0], metadata: { quarter: 1, elapsed_ms: 60_000, injured: true } },
    ],
  });
  await page.addInitScript(() => window.localStorage.setItem("siren-longpress-seen-v1", "true"));
  await page.goto(`/teams/${team.id}/games/${game.id}/live`);
  await waitForHydration(page);
  await expect(page.getByTestId("no-keeper")).toContainText("No keeper: put someone in goal", { timeout: 15_000 });
  await openSubCard(page);
  const pair = page.getByTestId("soccer-swap-pair-0");
  await expect(pair).toContainText("GK");
  await expect(pair).toContainText("Empty spot");
  await pair.getByRole("button", { name: /^Put .+ on$/ }).click();
  await expect.poll(async () => (await lastSwap(admin, game.id))?.line, { timeout: 15_000 }).toBe("gk");
  const fill = await lastSwap(admin, game.id);
  expect(fill?.off_player_id ?? null).toBeNull();
  expect([ids[7], ids[8]]).toContain(fill!.on_player_id);
  await expect(page.getByTestId("no-keeper")).toHaveCount(0, { timeout: 15_000 });
});
