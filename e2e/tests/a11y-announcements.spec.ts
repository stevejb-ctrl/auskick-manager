// ─── What a screen reader hears ─────────────────────────────────────
// UX round 3 (e4, 24 Oct 2026), watching live regions with a
// MutationObserver: before a goal there was no live region on the page,
// and the undo strip and swap toast were mounted already holding their
// text, which NVDA, JAWS and VoiceOver often skip. The toast read
// "Archie right arrow Paddy". A quarter running out, or End H1,
// announced nothing and dropped focus on BODY as the break replaced the
// screen.
//
// One live region is always on the page; the score, the swap and the
// period's end are said into it, and the break's heading takes focus.

import { test, expect } from "@playwright/test";
import { announcedText, markLiveRegions, netballGame, openLive, skipHints, unionGame } from "../helpers/a11y";

test.describe.configure({ mode: "parallel" });

test("a goal is said into a live region that was already on the page", async ({ page }) => {
  const { team, game } = await netballGame({ name: "A11Y-SR-GOAL" });
  await skipHints(page);
  await openLive(page, team.id, game.id);
  await markLiveRegions(page);

  await page.getByRole("button", { name: "Add goal, Hawks" }).click();
  await expect.poll(() => announcedText(page), { message: "the goal was announced" }).toMatch(/Hawks goal/);
  // With the score.
  await expect.poll(() => announcedText(page)).toMatch(/0[^0-9]+1|1[^0-9]+0/);
});

test("a swap is said as who's off and who's on, in words", async ({ page }) => {
  const { team, game, players, lineup } = await unionGame({ name: "A11Y-SR-SWAP" });
  await skipHints(page);
  await openLive(page, team.id, game.id);
  await markLiveRegions(page);

  const name = (id: string) => players.find((p) => p.id === id)!.full_name;
  const [on, off] = [lineup.bench[0], lineup.forwards[0]];
  await page.getByTestId(`league-player-tile-${on}`).click();
  await page.getByTestId(`league-player-tile-${off}`).click();
  await page.getByRole("dialog").getByRole("button", { name: "Confirm" }).click();
  await expect(page.getByTestId("swap-toast")).toBeVisible();
  await expect.poll(() => announcedText(page)).toContain(`${name(off)} off, ${name(on)} on`);
  expect(await announcedText(page)).not.toContain("→");
});

test("ending the half is announced, and focus lands on the break's heading", async ({ page }) => {
  const { team, game } = await unionGame({ name: "A11Y-SR-END" });
  await skipHints(page);
  await openLive(page, team.id, game.id);
  await markLiveRegions(page);

  await page.getByRole("button", { name: /^clock — h1, running$/i }).click();
  await page.getByRole("button", { name: /^end h1 now$/i }).click();
  await page.getByRole("button", { name: /^end\s*h\s*1$/i }).click();
  const heading = page.getByRole("heading", { name: /^2nd half lineup$/i });
  await expect(heading).toBeVisible({ timeout: 15_000 });
  await expect(heading).toBeFocused();
  await expect.poll(() => announcedText(page)).toMatch(/half[- ]time/i);
  await expect.poll(() => announcedText(page)).toMatch(/2nd half lineup/i);
});

test("a quarter running out is announced, and focus lands on the break's heading", async ({ page }) => {
  // Netball "go": 10-minute quarters. Fifteen seconds to the hooter: time
  // to load the page and mark its live regions first.
  const { team, game } = await netballGame({ name: "A11Y-SR-HOOTER", elapsedSec: 585 });
  await skipHints(page);
  await openLive(page, team.id, game.id);
  await markLiveRegions(page);

  const heading = page.getByRole("heading", { name: /lineup$/i });
  await expect(heading).toBeVisible({ timeout: 30_000 });
  await expect(heading).toBeFocused();
  await expect.poll(() => announcedText(page), { timeout: 5_000 }).toMatch(/Q1 break/i);
  await expect.poll(() => announcedText(page)).toMatch(/Q2 lineup/i);
});
