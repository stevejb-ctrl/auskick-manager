// ─── Rolling subs: a bench kid can still reach 50% ───────────
// Round 2 usability, 24 Oct 2026 (basketball P1, touch and Oztag P2):
// at half time the break said kids starting the 2nd half on the bench
// "can't reach 50% now" and Start asked "Start with 1 rule broken?",
// though subs roll on at any time in the half. Soccer was fixed in
// round 1; basketball and touch now count the half to come too, so the
// break starts with no "Start anyway".

import { test, expect, type Page } from "@playwright/test";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "../fixtures/supabase";
import { makeTeam, makePlayers, makeGame } from "../fixtures/factories";
import { waitForHydration } from "../helpers/navigation";
import { pickBreakStrategy } from "../helpers/break";

test.describe.configure({ mode: "parallel" });

async function ownerOf(admin: SupabaseClient): Promise<string> {
  const { data } = await admin.auth.admin.listUsers({ perPage: 1000 });
  return data.users.find((u) => u.email === process.env.TEST_SUPER_ADMIN_EMAIL)!.id;
}

/** A game at half time: `lineup` played all of H1 (`halfMs`), its bench sat it out. */
async function atHalfTime(
  admin: SupabaseClient,
  opts: { sport: "basketball" | "touch"; ageGroup: string; name: string; count: number; lineup: (ids: string[]) => unknown; halfMs: number },
) {
  const ownerId = await ownerOf(admin);
  const team = await makeTeam(admin, { ownerId, sport: opts.sport, ageGroup: opts.ageGroup, name: `${opts.name}-${Date.now() % 100000}` });
  const players = await makePlayers(admin, { teamId: team.id, ownerId, count: opts.count });
  const ids = players.map((p) => p.id);
  const game = await makeGame(admin, { teamId: team.id, ownerId, opponent: "Rivals" });
  const { error } = await admin.from("games").update({ status: "in_progress" }).eq("id", game.id);
  if (error) throw new Error(error.message);
  await admin.from("game_availability").insert(
    players.map((p) => ({ game_id: game.id, player_id: p.id, status: "available" as const, updated_by: ownerId })),
  );
  const start = Date.now() - opts.halfMs - 60_000;
  const ev = (type: string, s: number, metadata: Record<string, unknown>) => ({
    game_id: game.id,
    type,
    metadata: { ...metadata, sport: opts.sport },
    created_by: ownerId,
    created_at: new Date(start + s * 1000).toISOString(),
  });
  const { error: evErr } = await admin.from("game_events").insert([
    ev("lineup_set", 0, { lineup: opts.lineup(ids) }),
    ev("quarter_start", 1, { quarter: 1 }),
    ev("quarter_end", opts.halfMs / 1000, { quarter: 1, elapsed_ms: opts.halfMs }),
  ]);
  if (evErr) throw new Error(evErr.message);
  return { team, game };
}

/** Repeat keeps H1's bench on the bench; nothing is broken and Start goes straight through. */
async function repeatStartsClean(page: Page) {
  await expect(page.getByRole("heading", { name: "2nd half lineup" })).toBeVisible({ timeout: 15_000 });
  await pickBreakStrategy(page, "Repeat");
  await expect(page.getByText(/can't reach 50% now/)).toHaveCount(0);
  await expect(page.getByTestId("break-broken-rule")).toHaveCount(0);
  await page.getByRole("button", { name: /^start 2nd half/i }).click();
  await expect(page.getByRole("button", { name: /^start 2nd half now$/i })).toBeVisible();
  await expect(page.getByRole("button", { name: "Start anyway" })).toHaveCount(0);
  await page.getByRole("button", { name: /^start 2nd half now$/i }).click();
  await expect(page.getByRole("button", { name: /^clock — h2, running$/i })).toBeVisible({ timeout: 15_000 });
}

test("basketball half time: the kids who sat H1 start H2 on the bench, no rule broken", async ({ page }) => {
  test.setTimeout(120_000);
  const admin = createAdminClient();
  const { team, game } = await atHalfTime(admin, {
    sport: "basketball",
    ageGroup: "U12",
    name: "BBL-FLOOR",
    count: 10,
    lineup: (k) => ({ lines: { guard: k.slice(0, 2), forward: k.slice(2, 5), court: [] }, bench: k.slice(5) }),
    halfMs: 20 * 60_000,
  });
  await page.goto(`/teams/${team.id}/games/${game.id}/live`);
  await waitForHydration(page);
  await repeatStartsClean(page);
});

test("touch half time: the kids who sat H1 start H2 on the bench, no rule broken", async ({ page }) => {
  test.setTimeout(120_000);
  const admin = createAdminClient();
  const { team, game } = await atHalfTime(admin, {
    sport: "touch",
    ageGroup: "U11",
    name: "TCH-FLOOR",
    count: 12,
    lineup: (k) => ({ lines: { middle: k.slice(0, 2), link: k.slice(2, 4), wing: k.slice(4, 6), field: [] }, bench: k.slice(6) }),
    halfMs: 20 * 60_000,
  });
  await page.addInitScript(() => window.localStorage.setItem("siren-longpress-seen-v1", "true"));
  await page.goto(`/teams/${team.id}/games/${game.id}/live`);
  await waitForHydration(page);
  await repeatStartsClean(page);
});
