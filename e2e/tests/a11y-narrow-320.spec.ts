// ─── The smallest phones (320 px wide) ──────────────────────────────
// UX round 3 (e4, 24 Oct 2026) at 320×568:
//   - Basketball's six 48 px chips need ~324 px of a 288 px row: the
//     opposition's +3 was 20 px off the screen, and our +3 sat 12 px
//     from their +1, so a tap meant for our three could score theirs.
//     League's scorebug wraps; basketball's didn't.
//   - Netball's stats cards grew to the min-content of their metric
//     row and clipped total minutes, Goals and the Def pill.
//   - Long squad names ran under the Role button, and every row's
//     Edit and Deactivate were named the same for a screen reader.

import { test, expect } from "@playwright/test";
import { createAdminClient } from "../fixtures/supabase";
import { makeTeam, makePlayers, makeGame } from "../fixtures/factories";
import { basketballGame, boxOf, openLive, ownerOf, skipHints } from "../helpers/a11y";
import { waitForHydration } from "../helpers/navigation";

test.describe.configure({ mode: "parallel" });
test.use({ viewport: { width: 320, height: 568 } });

test("basketball's score chips all fit, with clear space between the two teams'", async ({ page }) => {
  const { team, game } = await basketballGame({ name: "A11Y-320-BB" });
  await skipHints(page);
  await openLive(page, team.id, game.id);

  const ours = await Promise.all([1, 2, 3].map((n) => boxOf(page.getByRole("button", { name: `Add ${n} ${n === 1 ? "point" : "points"}, ${team.name}` }))));
  const theirs = await Promise.all([1, 2, 3].map((n) => boxOf(page.getByRole("button", { name: `Add ${n} ${n === 1 ? "point" : "points"}, Fdggd` }))));
  for (const b of [...ours, ...theirs]) {
    expect(b.left).toBeGreaterThanOrEqual(8);
    expect(b.right).toBeLessThanOrEqual(312);
    expect(b.height).toBeGreaterThanOrEqual(44);
  }
  // Our +3 and their +1: on separate rows, or at least 24 px apart.
  const [our3, their1] = [ours[2], theirs[0]];
  const sameRow = Math.abs(our3.top - their1.top) < our3.height / 2;
  if (sameRow) expect(their1.left - our3.right).toBeGreaterThanOrEqual(24);
  else expect(their1.top).toBeGreaterThanOrEqual(our3.bottom);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320);
});

test("netball's stats cards fit the screen", async ({ page }) => {
  const admin = createAdminClient();
  const ownerId = await ownerOf(admin);
  const team = await makeTeam(admin, { ownerId, sport: "netball", ageGroup: "go", name: `A11Y-320-NB ${Date.now() % 100000}` });
  await admin.from("teams").update({ track_scoring: true }).eq("id", team.id);
  const players = await makePlayers(admin, { teamId: team.id, ownerId, count: 9, ageGroup: "U10" });
  // A long name: the card's one-line name (truncate) can't shrink below
  // its text, so it widened the grid's implicit column past the screen.
  await admin.from("players").update({ full_name: "Isabella Papadopoulos-Nguyen" }).eq("id", players[0].id);
  const g = await makeGame(admin, { teamId: team.id, ownerId, opponent: "Hawks", scheduledAt: new Date(Date.now() - 3_600_000).toISOString() });
  await admin.from("games").update({ status: "completed" }).eq("id", g.id);
  const keys = ["gs", "ga", "wa", "c", "wd", "gd", "gk"];
  const lineup = { positions: Object.fromEntries(keys.map((k, i) => [k, [players[i].id]])), bench: [players[7].id, players[8].id] };
  const base = Date.now() - 3_600_000;
  const at = (min: number) => new Date(base + min * 60_000).toISOString();
  const rows = [
    { type: "lineup_set", metadata: { lineup }, created_at: at(0) },
    { type: "quarter_start", metadata: { quarter: 1 }, created_at: at(1) },
    { type: "goal", metadata: { quarter: 1 }, player_id: players[0].id, created_at: at(5) },
    { type: "quarter_end", metadata: { quarter: 1 }, created_at: at(10) },
    { type: "quarter_start", metadata: { quarter: 2 }, created_at: at(11) },
    { type: "quarter_end", metadata: { quarter: 2 }, created_at: at(20) },
    { type: "game_finalised", metadata: {}, created_at: at(21) },
  ].map((r) => ({ ...r, game_id: g.id, created_by: ownerId }));
  const { error } = await admin.from("game_events").insert(rows);
  if (error) throw new Error(error.message);

  await page.goto(`/teams/${team.id}/stats`);
  const cards = page.locator("[data-testid^='player-stats-']");
  await expect(cards.first()).toBeVisible({ timeout: 15_000 });
  const fits = await cards.evaluateAll((els) =>
    els.map((el) => {
      const r = el.getBoundingClientRect();
      return { right: r.right, overflow: el.scrollWidth - el.clientWidth };
    }),
  );
  for (const f of fits) {
    expect(f.right).toBeLessThanOrEqual(320);
    expect(f.overflow, "nothing inside the card is cut off").toBeLessThanOrEqual(1);
  }
});

test("long squad names wrap clear of the row's buttons, and each button names its kid", async ({ page }) => {
  const admin = createAdminClient();
  const ownerId = await ownerOf(admin);
  const team = await makeTeam(admin, { ownerId, sport: "netball", ageGroup: "go", name: `A11Y-320-SQ ${Date.now() % 100000}` });
  const players = await makePlayers(admin, { teamId: team.id, ownerId, count: 3, ageGroup: "U10" });
  const names = ["Daisy Papadopoulos", "Ava Long-Hyphenated-Surname", "Chloe Tran"];
  for (let i = 0; i < names.length; i++) await admin.from("players").update({ full_name: names[i] }).eq("id", players[i].id);

  await page.goto(`/teams/${team.id}/squad`);
  await waitForHydration(page);
  for (let i = 0; i < names.length; i++) {
    const name = names[i];
    const row = page.getByTestId(`player-row-${players[i].id}`);
    await expect(row).toBeVisible({ timeout: 15_000 });
    const edit = row.getByRole("button", { name: `Edit ${name}`, exact: true });
    await expect(edit).toBeVisible();
    await expect(row.getByRole("switch", { name: `Deactivate ${name}`, exact: true })).toBeVisible();
    // The name's text stays inside its own box…
    const text = row.getByText(name, { exact: true });
    const m = await text.evaluate((el) => ({ overflow: el.scrollWidth - el.clientWidth }));
    expect(m.overflow, `${name} runs past its column`).toBeLessThanOrEqual(1);
    // …which no button overlaps.
    const nameBox = await boxOf(text);
    for (const button of [row.getByRole("button", { name: `Role for ${name}` }), edit]) {
      const b = await boxOf(button);
      const overlaps = b.left < nameBox.right - 1 && b.right > nameBox.left + 1 && b.top < nameBox.bottom - 1 && b.bottom > nameBox.top + 1;
      expect(overlaps, `${name} under a button`).toBe(false);
    }
  }
  // The Deactivate switch is a 44 px target.
  const sw = await boxOf(page.getByRole("switch", { name: `Deactivate ${names[0]}` }));
  expect(sw.height).toBeGreaterThanOrEqual(44);
  expect(sw.width).toBeGreaterThanOrEqual(44);
});
