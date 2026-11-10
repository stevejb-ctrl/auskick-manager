// ─── The starting-lineup picker on live v3, in every sport ───────
// Steve, 10 Nov 2026: "the lineup picker in AFL still uses the old
// design. Fix this and ensure all sports are all on the same design."
// The pickers drew their own old fields: AFL's white cards with
// FWD/CEN/BCK colour tags, jumper numbers and three-colour season bars
// under a "Season time in zone" key, netball's court tokens and a white
// Bench card of chips, league's white "Starting field" card, and so on.
//
// Now every sport's picker is PickerField: the sport's own ground, as
// its live screen and break draw it (grass, court or wood), the kids as
// KidTiles in its lines, and the bench under it (KidBench). Tap two
// players to swap them, a field kid with a bench kid included.
//
// Covers: src/components/lineup/PickerField.tsx and the six pickers
// (live/LineupPicker, netball/LineupPicker, league/LeagueLineupPicker,
// soccer/SoccerLineupPicker, basketball/BasketballLineupPicker,
// touch/TouchLineupPicker).

import { test, expect, type Page } from "@playwright/test";
import { createAdminClient } from "../fixtures/supabase";
import { makeTeam, makePlayers, makeGame } from "../fixtures/factories";
import { coachId } from "../helpers/people";
import { waitForHydration } from "../helpers/navigation";

test.describe.configure({ mode: "parallel" });
test.use({ viewport: { width: 390, height: 844 } });

type Case = {
  key: string;
  sport: string;
  age: string;
  count: number;
  onField?: number;
  ground: "field" | "court" | "wood";
  lines: string[];
  tile?: string;
};

const CASES: Case[] = [
  { key: "AFL", sport: "afl", age: "U10", count: 15, ground: "field", lines: ["Forward", "Centre", "Back"] },
  { key: "AFL big field", sport: "afl", age: "U16", count: 22, onField: 18, ground: "field", lines: ["Forward", "Centre", "Back"] },
  { key: "netball", sport: "netball", age: "11u", count: 9, ground: "court", lines: ["Attack third", "Centre third", "Defence third"] },
  { key: "rugby league", sport: "rugby_league", age: "U10", count: 13, onField: 11, ground: "field", lines: ["Forwards", "Backs"], tile: "league-player-tile-" },
  { key: "rugby union", sport: "rugby_union", age: "U12", count: 17, ground: "field", lines: ["Forwards", "Backs"], tile: "league-player-tile-" },
  { key: "soccer", sport: "soccer", age: "U10", count: 10, ground: "field", lines: [] },
  { key: "futsal", sport: "futsal", age: "U10", count: 8, ground: "court", lines: [] },
  { key: "hockey", sport: "hockey", age: "U13", count: 14, ground: "field", lines: [] },
  { key: "basketball", sport: "basketball", age: "U12", count: 8, ground: "wood", lines: [] },
  { key: "touch", sport: "touch", age: "U12", count: 10, ground: "field", lines: [] },
  { key: "oztag", sport: "oztag", age: "U10", count: 10, ground: "field", lines: ["Field"] },
];

async function skipTours(page: Page) {
  await page.addInitScript(() => {
    try {
      for (const k of ["nb-walkthrough-seen", "gm-walkthrough-seen", "rl-walkthrough-seen", "league-walkthrough-seen"]) localStorage.setItem(k, "1");
    } catch {}
  });
}

for (const c of CASES) {
  test(`${c.key}: the picker is the live v3 field, and two taps swap a field kid with a bench kid`, async ({ page }) => {
    const admin = createAdminClient();
    const ownerId = await coachId(admin);
    const team = await makeTeam(admin, { ownerId, sport: c.sport as never, ageGroup: c.age, name: `V3P ${c.key} ${Date.now() % 100000}` });
    const players = await makePlayers(admin, { teamId: team.id, ownerId, count: c.count, ageGroup: c.age });
    const game = await makeGame(admin, { teamId: team.id, ownerId });
    if (c.onField) await admin.from("games").update({ on_field_size: c.onField }).eq("id", game.id);
    await admin
      .from("game_availability")
      .insert(players.map((p) => ({ game_id: game.id, player_id: p.id, status: "available" as const, updated_by: ownerId })));

    await skipTours(page);
    await page.goto(`/teams/${team.id}/games/${game.id}/live`);
    await waitForHydration(page);
    const picker = page.getByRole("region", { name: "Starting lineup" });
    await expect(picker).toBeVisible({ timeout: 20_000 });

    // The sport's ground, as its live screen draws it.
    const field = picker.getByTestId("lineup-field");
    await expect(field).toBeVisible();
    await expect(field.locator(":scope > div").first()).toHaveClass(new RegExp(`\\bbg-${c.ground}\\b`));
    for (const line of c.lines) await expect(field.getByRole("group", { name: line, exact: true })).toBeVisible();

    // The old look is gone: no season key, no zone-colour tags or bars,
    // no white Bench card.
    await expect(picker.getByText("Season time in zone")).toHaveCount(0);
    await expect(picker.locator('[class*="bg-zone-"]')).toHaveCount(0);
    await expect(picker.getByText(/^Bench \(\d+\)$/)).toHaveCount(0);
    await expect(picker.locator('[data-testid^="bench-chip-"]')).toHaveCount(0);

    // The tap hint is the break's words.
    await expect(picker.getByText(/^Tap two players to swap — any position or bench\./)).toBeVisible();

    const prefix = c.tile ?? "player-tile-";
    const bench = picker.getByRole("group", { name: "Bench", exact: true });
    const onField = field.locator(`[data-testid^="${prefix}"]`);
    const onBench = bench.locator(`[data-testid^="${prefix}"]`);
    await expect(onField.first()).toBeVisible();
    await expect(onBench.first()).toBeVisible();
    if (c.key === "AFL big field") {
      // The formation, each kid in their position ("CHB Jack S").
      await expect(onField).toHaveCount(18);
      await expect(field).toContainText("CHB");
    }

    // Two taps: a field kid and a bench kid trade places.
    const fieldId = (await onField.first().getAttribute("data-testid"))!.slice(prefix.length);
    const benchId = (await onBench.first().getAttribute("data-testid"))!.slice(prefix.length);
    await onField.first().click();
    await expect(field.getByTestId(`${prefix}${fieldId}`)).toHaveAttribute("aria-pressed", "true");
    await bench.getByTestId(`${prefix}${benchId}`).click();
    await expect(bench.getByTestId(`${prefix}${fieldId}`)).toBeVisible();
    await expect(field.getByTestId(`${prefix}${benchId}`)).toBeVisible();
  });
}

test("AFL: a short side shows its empty spot on the field; tapping it first offers the bench", async ({ page }) => {
  const admin = createAdminClient();
  const ownerId = await coachId(admin);
  const team = await makeTeam(admin, { ownerId, sport: "afl", ageGroup: "U10", name: `V3P short ${Date.now() % 100000}` });
  const players = await makePlayers(admin, { teamId: team.id, ownerId, count: 14 });
  const game = await makeGame(admin, { teamId: team.id, ownerId });
  await admin
    .from("game_availability")
    .insert(players.map((p) => ({ game_id: game.id, player_id: p.id, status: "available" as const, updated_by: ownerId })));
  await skipTours(page);
  await page.goto(`/teams/${team.id}/games/${game.id}/live`);
  await waitForHydration(page);
  await page.getByRole("button", { name: /game settings/i }).click();
  const size = page.locator("#on-field-size");
  await size.selectOption(String(Number(await size.inputValue()) - 1));

  const field = page.getByTestId("lineup-field");
  const empty = field.getByRole("button", { name: /^Empty (FWD|CEN|BCK) spot$/ });
  await expect(empty).toHaveCount(1);
  // The line that's short says so in its margin ("3 on", underlined).
  await expect(field).toContainText("3 on");
  await empty.click();
  await expect(page.getByRole("dialog")).toBeVisible();
});

test("at the phone's 200% text setting the AFL picker's tiles keep each kid's short name whole, and every tile is a 44 px target", async ({ page, browserName }) => {
  test.skip(browserName !== "chromium", "CDP Page.setFontSizes is Chromium-only");
  const admin = createAdminClient();
  const ownerId = await coachId(admin);
  const team = await makeTeam(admin, { ownerId, sport: "afl", ageGroup: "U10", name: `V3P big text ${Date.now() % 100000}` });
  const players = await makePlayers(admin, { teamId: team.id, ownerId, count: 15 });
  const game = await makeGame(admin, { teamId: team.id, ownerId });
  await admin
    .from("game_availability")
    .insert(players.map((p) => ({ game_id: game.id, player_id: p.id, status: "available" as const, updated_by: ownerId })));
  await skipTours(page);
  // The phone's own text size, which the tiles' bigtext: rows answer to
  // (a11y-large-text's court check does the same).
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Page.setFontSizes", { fontSizes: { standard: 32, fixed: 26 } });
  await page.goto(`/teams/${team.id}/games/${game.id}/live`);
  await waitForHydration(page);
  await expect(page.getByTestId("lineup-field")).toBeVisible({ timeout: 20_000 });

  const tiles = page.locator('[data-testid="lineup-field"] [data-testid^="player-tile-"], [role="group"][aria-label="Bench"] [data-testid^="player-tile-"]');
  const n = await tiles.count();
  expect(n).toBe(15);
  for (let i = 0; i < n; i++) {
    const tile = tiles.nth(i);
    await tile.scrollIntoViewIfNeeded();
    const box = (await tile.boundingBox())!;
    expect(box.height, "tile height").toBeGreaterThanOrEqual(44);
    expect(box.width, "tile width").toBeGreaterThanOrEqual(44);
    const name = tile.locator("span.truncate").first();
    const clipped = await name.evaluate((el) => el.scrollWidth > el.clientWidth + 1);
    expect(clipped, `${await name.textContent()} is cut off`).toBe(false);
  }
  // Nothing runs off the side of the phone.
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
});
