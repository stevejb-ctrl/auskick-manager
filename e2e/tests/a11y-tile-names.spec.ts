// ─── Player tiles: one name, read once, in order ───────────────────
// Accessibility follow-up to UX round 3's R6 (25 Oct 2026). A screen
// reader read each tile's parts in DOM order: AFL's "BCK #1 Coming off
// next, pair 4 Zara Q Fwd 0:00, Mid 0:00, Back 1:04 1:04" (the zone
// twice, the kid in the middle); netball's court token "Goal Shooter,
// Zara Quill", which hid its time; the break's "#1 Zara Quill Stays
// 25:00". Every tile now says the kid first (their whole name), then
// where they are, their number and time, then any state chips: "Zara
// Quill, Back, #1, 1:04, Coming off next, pair 4". The time in each
// zone is the tile's description.

import { test, expect, type Locator } from "@playwright/test";
import { accessibleName, aflGame, netballGame, openLive, skipHints, unionGame } from "../helpers/a11y";
import { waitForHydration } from "../helpers/navigation";

test.describe.configure({ mode: "parallel" });

const TIME = String.raw`\d+:\d\d`;
const NUM = String.raw`(, #\d+)?`;

async function expectTileName(tile: Locator, name: string, rest: string) {
  await expect(tile).toBeVisible({ timeout: 15_000 });
  const spoken = await accessibleName(tile);
  // State chips ("Coming off next, pair 1") come last, after the time.
  expect(spoken, `the tile reads "${spoken}"`).toMatch(new RegExp(`^${name}${rest}(, .+)?$`));
  // The kid is read once: neither the whole name nor the tile's short one twice.
  const short = name.replace(/^(\S+) (\S).*$/, "$1 $2");
  for (const n of [name, short]) expect(spoken.split(n).length - 1, `"${n}" is read once in "${spoken}"`).toBe(1);
}

test("AFL's field and bench tiles read name, zone, number, time", async ({ page }) => {
  const fillers = Array.from({ length: 11 }, (_, i) => `Kid${i} Avery`);
  const { team, game, players } = await aflGame({ name: "A11Y-TN-AFL", names: ["Zara Quill", ...fillers, "Yuri Pike"] });
  await skipHints(page);
  await openLive(page, team.id, game.id);
  await expectTileName(page.getByTestId(`player-tile-${players[0].id}`), "Zara Quill", `, Back${NUM}, ${TIME}`);
  // A bench kid who hasn't played shows no time, so reads none.
  await expectTileName(page.getByTestId(`player-tile-${players[12].id}`), "Yuri Pike", `${NUM}(, ${TIME})?`);
});

test("rugby's line tiles (the shared LinePlayerTile) read name, line, number, time", async ({ page }) => {
  const { team, game, lineup } = await unionGame({ name: "A11Y-TN-RU", names: ["Zara Quill"] });
  await skipHints(page);
  await openLive(page, team.id, game.id);
  await expectTileName(page.getByTestId(`league-player-tile-${lineup.forwards[0]}`), "Zara Quill", `, Forwards${NUM}, ${TIME}`);
});

test("netball's court token and bench tile read the kid first, then the position and time", async ({ page }) => {
  const { admin, team, game, players } = await netballGame({ name: "A11Y-TN-NB" });
  await admin.from("players").update({ full_name: "Zara Quill" }).eq("id", players[0].id);
  await admin.from("players").update({ full_name: "Yuri Pike" }).eq("id", players[7].id);
  await skipHints(page);
  await openLive(page, team.id, game.id);
  // The court token: its bib disc says GS.
  const token = page.getByRole("button").filter({ hasText: /^GS\s*Zara Q/ });
  await expectTileName(token, "Zara Quill", `, Goal Shooter, ${TIME}`);
  await expectTileName(page.getByTestId(`player-tile-${players[7].id}`), "Yuri Pike", `${NUM}, ${TIME}`);
});

test("the break's tiles read name, number, time, where they've come from", async ({ page }) => {
  const { team, game, players } = await unionGame({ name: "A11Y-TN-BRK", ended: true, names: ["Zara Quill"] });
  await skipHints(page);
  await page.goto(`/teams/${team.id}/games/${game.id}/live`);
  await waitForHydration(page);
  await expect(page.getByRole("button", { name: /^start 2nd half/i })).toBeVisible({ timeout: 15_000 });
  // Where they've come from ("Stays", "From bench") is a state, after the time.
  await expectTileName(page.getByTestId(`player-tile-${players[0].id}`), "Zara Quill", `${NUM}, ${TIME}, (Stays|From [^,]+)`);
});
