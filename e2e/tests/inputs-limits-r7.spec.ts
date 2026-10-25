// Round 3 edge-case testing (24 Oct 2026), the leftover P2s and P3s:
// hostile inputs, limits and finished games. Each test fails on the
// code before the fix (cb2f0f63).
//
// Covers src/lib/names.ts (+ components/live/SquadNames), the squad's
// add and paste paths, long names, stale games, dates, the opponent's
// name, deleting a live game, short sides, number inputs, team names,
// fixing a finished game's scores and undoing a batch of swaps.

import { test, expect, type Page } from "@playwright/test";
import { createAdminClient } from "../fixtures/supabase";
import { makeTeam, makePlayers, makeGame } from "../fixtures/factories";
import { finishedGame, playPeriod, fullTime } from "../helpers/finished-game";
import { waitForHydration } from "../helpers/navigation";

test.describe.configure({ mode: "parallel" });

async function ownerIdOf(): Promise<string> {
  const admin = createAdminClient();
  const { data } = await admin.auth.admin.listUsers({ perPage: 1000 });
  return data.users.find((u) => u.email === process.env.TEST_SUPER_ADMIN_EMAIL)!.id;
}

const tag = () => `${Date.now() % 1e6}${Math.random().toString(36).slice(2, 5)}`;

async function namedSquad(teamId: string, ownerId: string, kids: { name: string; num?: number | null }[]) {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("players")
    .insert(kids.map((k) => ({ team_id: teamId, full_name: k.name, jersey_number: k.num ?? null, is_active: true, created_by: ownerId })))
    .select("id, full_name, jersey_number");
  if (error || !data) throw new Error(`namedSquad: ${error?.message}`);
  return data as { id: string; full_name: string; jersey_number: number | null }[];
}

async function allIn(gameId: string, ids: string[], ownerId: string) {
  const admin = createAdminClient();
  await admin.from("game_availability").insert(ids.map((id) => ({ game_id: gameId, player_id: id, status: "available", updated_by: ownerId })));
}

async function noSidewaysScroll(page: Page) {
  const { scroll, client } = await page.evaluate(() => ({
    scroll: document.scrollingElement!.scrollWidth,
    client: document.scrollingElement!.clientWidth,
  }));
  expect(scroll, "the page scrolls sideways").toBeLessThanOrEqual(client);
}

// ─── Duplicate names ────────────────────────────────────────────────
test.describe("two kids with the same name", () => {
  test("adding one warns and still adds; the paste agrees", async ({ page }) => {
    const ownerId = await ownerIdOf();
    const admin = createAdminClient();
    const team = await makeTeam(admin, { ownerId, sport: "afl", name: `R7 Dupes ${tag()}` });
    await namedSquad(team.id, ownerId, [{ name: "Jack Smith" }]);

    await page.goto(`/teams/${team.id}/squad`);
    await waitForHydration(page);
    await page.getByLabel("Player name").fill("Jack Smith");
    await page.getByRole("button", { name: "Add player" }).click();
    await expect(page.getByText(/There's already a Jack Smith on the squad/)).toBeVisible();
    await page.getByRole("button", { name: "Add anyway" }).click();
    await expect.poll(async () => (await admin.from("players").select("id").eq("team_id", team.id).eq("full_name", "Jack Smith")).data?.length).toBe(2);

    // The paste used to refuse "listed twice"; it warns and adds now.
    await page.getByRole("button", { name: "Paste a list" }).click();
    await page.getByLabel(/paste your squad/i).fill("Ava Smith #3\nAva Smith #12");
    await expect(page.getByTestId("paste-warnings")).toContainText("Ava Smith is listed twice");
    await page.getByRole("button", { name: "Add 2 players" }).click();
    await expect(page.getByText("Added 2 players.")).toBeVisible({ timeout: 15_000 });
  });

  test("tiles and the share text tell them apart", async ({ page }) => {
    const ownerId = await ownerIdOf();
    const admin = createAdminClient();
    const team = await makeTeam(admin, { ownerId, sport: "afl", name: `R7 Tiles ${tag()}` });
    const kids = await namedSquad(team.id, ownerId, [
      { name: "Jack Smith", num: 1 },
      { name: "Jack Stone", num: 2 },
      { name: "😀 Emoji Kid", num: 3 },
      ...["Alicia", "Brendan", "Camille", "Damian", "Elena", "Felix", "Gemma", "Harvey", "Ingrid"].map((name, i) => ({ name, num: i + 10 })),
    ]);
    const game = await makeGame(admin, { teamId: team.id, ownerId });
    await allIn(game.id, kids.map((k) => k.id), ownerId);

    await page.goto(`/teams/${team.id}/games/${game.id}/live`);
    await expect(page.getByRole("button", { name: /^start q1$/i })).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText("Jack Sm", { exact: true })).toHaveCount(1);
    await expect(page.getByText("Jack St", { exact: true })).toHaveCount(1);
    await expect(page.getByText("Emoji K", { exact: true })).toHaveCount(1);
    await expect(page.getByText("Jack S", { exact: true })).toHaveCount(0);
  });

  test("the finished game's share text says which Mia", async ({ page }) => {
    const { team, game, players, admin } = await finishedGame("afl", 12, (ids) => [
      { type: "lineup_set", metadata: { lineup: { back: ids.slice(0, 4), hback: [], mid: ids.slice(4, 8), hfwd: [], fwd: ids.slice(8, 12), bench: [] } } },
      ...playPeriod(1, [{ type: "goal", player_id: ids[0], metadata: { quarter: 1 } }]),
      fullTime,
    ]);
    await admin.from("players").update({ full_name: "Mia Chen" }).eq("id", players[0].id);
    await admin.from("players").update({ full_name: "Mia Tran" }).eq("id", players[1].id);

    await page.goto(`/teams/${team.id}/games/${game.id}`);
    const text = page.locator("#game-summary-text");
    await expect(text).toContainText("Mia C (#1) 1.0");
    await expect(text).toContainText("#2 Mia T —");
  });
});

// ─── Paste a list ───────────────────────────────────────────────────
test("a pasted group-chat message adds only the kids, each with a tick", async ({ page }) => {
  const ownerId = await ownerIdOf();
  const admin = createAdminClient();
  const team = await makeTeam(admin, { ownerId, sport: "afl", name: `R7 Paste ${tag()}` });

  await page.goto(`/teams/${team.id}/squad`);
  await waitForHydration(page);
  await page.getByRole("button", { name: "Paste a list" }).click();
  await page
    .getByLabel(/paste your squad/i)
    .fill(
      [
        "Hi all, here is the U12 list for Saturday!",
        "Forwards:",
        "Ava Smith #3",
        "Ben Jones 7",
        "Backs:",
        "Cara Lee",
        "Thanks 🙏",
        "https://example.com/fixture",
        "Cheers",
        "— Coach Dave 0412 345 678",
      ].join("\n"),
    );
  const preview = page.getByTestId("paste-preview");
  await expect(preview.getByRole("checkbox")).toHaveCount(3);
  await expect(page.getByTestId("paste-skipped")).toContainText("Skipped 7 lines");
  await expect(page.getByText(/jersey #678/)).toHaveCount(0);

  // Untick one: it isn't added.
  await preview.getByRole("checkbox", { name: /Cara Lee/ }).uncheck();
  await page.getByRole("button", { name: "Add 2 players" }).click();
  await expect(page.getByText("Added 2 players.")).toBeVisible({ timeout: 15_000 });
  const { data: rows } = await admin.from("players").select("full_name").eq("team_id", team.id).order("full_name");
  expect(rows?.map((r) => r.full_name)).toEqual(["Ava Smith", "Ben Jones"]);
});

// ─── Long names ─────────────────────────────────────────────────────
test.describe("a very long name", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("doesn't hide anyone's minutes on Stats or push pages sideways", async ({ page }) => {
    const LONG = "Supercalifragilisticexpialidociousfrankensteinmonstermashupkidd";
    const { team, game, players, admin } = await finishedGame("afl", 12, (ids) => [
      { type: "lineup_set", metadata: { lineup: { back: ids.slice(0, 4), hback: [], mid: ids.slice(4, 8), hfwd: [], fwd: ids.slice(8, 12), bench: [] } } },
      ...playPeriod(1, [{ type: "goal", player_id: ids[0], metadata: { quarter: 1 } }]),
      fullTime,
    ]);
    await admin.from("players").update({ full_name: LONG }).eq("id", players[0].id);

    await page.goto(`/teams/${team.id}/stats`);
    const totals = page.getByText("total min", { exact: true });
    await expect(totals.first()).toBeVisible({ timeout: 15_000 });
    const boxes = await totals.evaluateAll((els) => els.map((el) => el.getBoundingClientRect().right));
    expect(boxes.length).toBeGreaterThanOrEqual(12);
    for (const right of boxes) expect(right, "a TOTAL MIN is off the card").toBeLessThanOrEqual(390);
    await noSidewaysScroll(page);

    await page.goto(`/teams/${team.id}/squad`);
    await expect(page.getByText(LONG)).toBeVisible();
    await noSidewaysScroll(page);

    await page.goto(`/teams/${team.id}/games/${game.id}`);
    await expect(page.locator("#game-summary-text")).toContainText("Supercali");
    await noSidewaysScroll(page);
  });
});

// ─── Dates ──────────────────────────────────────────────────────────
test.describe("game dates", () => {
  test("year 9999 is refused, and a game next year shows its year", async ({ page }) => {
    const ownerId = await ownerIdOf();
    const admin = createAdminClient();
    const team = await makeTeam(admin, { ownerId, sport: "afl", name: `R7 Dates ${tag()}` });
    const nextYear = new Date(new Date().getFullYear() + 1, 2, 6, 9, 0);
    await makeGame(admin, { teamId: team.id, ownerId, opponent: "Next Season Opener", scheduledAt: nextYear.toISOString() });

    await page.goto(`/teams/${team.id}/games`);
    await waitForHydration(page);
    await expect(page.getByRole("link", { name: /Next Season Opener/ })).toContainText(String(nextYear.getFullYear()));

    await page.getByRole("button", { name: /create manually/i }).click();
    await page.getByLabel(/opponent/i).fill("Typo Year");
    await page.getByLabel(/date.*time/i).fill("9999-12-31T23:59");
    await page.getByRole("button", { name: /^create game$/i }).click();
    await expect(page.getByText(/more than 18 months away/)).toBeVisible();
    const { data } = await admin.from("games").select("id").eq("team_id", team.id).eq("opponent", "Typo Year");
    expect(data).toEqual([]);
  });

  test("a finished game's opponent can be fixed", async ({ page }) => {
    const { team, game, admin } = await finishedGame("afl", 12, (ids) => [
      { type: "lineup_set", metadata: { lineup: { back: ids.slice(0, 4), hback: [], mid: ids.slice(4, 8), hfwd: [], fwd: ids.slice(8, 12), bench: [] } } },
      ...playPeriod(1, []),
      fullTime,
    ]);
    await page.goto(`/teams/${team.id}/games/${game.id}`);
    await waitForHydration(page);
    await page.getByRole("button", { name: /more actions/i }).click();
    await page.getByRole("button", { name: /^edit details/i }).click();
    await page.getByLabel(/opponent/i).fill("Kotara Koalas");
    await page.getByRole("button", { name: /^save changes$/i }).click();
    await expect.poll(async () => (await admin.from("games").select("opponent").eq("id", game.id).single()).data?.opponent).toBe("Kotara Koalas");
  });
});

// ─── Opponent with the team's own name ──────────────────────────────
test("an opponent with the team's own name gets a warning", async ({ page }) => {
  const ownerId = await ownerIdOf();
  const admin = createAdminClient();
  const name = `Saints ${tag()}`;
  const team = await makeTeam(admin, { ownerId, sport: "rugby_union", ageGroup: "U12", name });

  await page.goto(`/teams/${team.id}/games`);
  await waitForHydration(page);
  await page.getByRole("button", { name: /create manually/i }).click();
  await page.getByLabel(/opponent/i).fill("Merewether Magpies");
  await expect(page.getByText(/your team's name too/)).toHaveCount(0);
  await page.getByLabel(/opponent/i).fill(name.toUpperCase());
  await expect(page.getByText(/your team's name too/)).toBeVisible();
});

// ─── A past game never run ──────────────────────────────────────────
test("last week's unplayed game leaves Next up; mark it played or delete it", async ({ page }) => {
  const ownerId = await ownerIdOf();
  const admin = createAdminClient();
  const team = await makeTeam(admin, { ownerId, sport: "afl", name: `R7 Stale ${tag()}` });
  await admin.from("teams").update({ track_scoring: true }).eq("id", team.id);
  await makePlayers(admin, { teamId: team.id, ownerId, count: 12 });
  const day = 86_400_000;
  const missed = await makeGame(admin, { teamId: team.id, ownerId, opponent: "Washed Out Wolves", scheduledAt: new Date(Date.now() - 8 * day).toISOString() });
  const missed2 = await makeGame(admin, { teamId: team.id, ownerId, opponent: "Forgotten Foxes", scheduledAt: new Date(Date.now() - 15 * day).toISOString() });
  await makeGame(admin, { teamId: team.id, ownerId, opponent: "Saturday Sharks", scheduledAt: new Date(Date.now() + 2 * day).toISOString() });

  await page.goto(`/teams/${team.id}`);
  await waitForHydration(page);
  await expect(page.getByText(/Next up/i).first()).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText("Saturday Sharks").first()).toBeVisible();
  const notPlayed = page.getByRole("region", { name: "Not played" });
  await expect(notPlayed).toContainText("Washed Out Wolves");
  await expect(notPlayed).toContainText("Didn't play? Delete it, or mark it played.");

  await notPlayed.locator("li", { hasText: "Washed Out Wolves" }).getByRole("button", { name: "Mark played" }).click();
  await expect.poll(async () => (await admin.from("games").select("status").eq("id", missed.id).single()).data?.status).toBe("completed");
  await expect(notPlayed).not.toContainText("Washed Out Wolves");
  // Played without the app: counted, but not a 0–0 draw.
  await expect(page.getByRole("region", { name: /^season$/i })).toContainText("1 played");
  await expect(page.getByRole("region", { name: /^season$/i })).not.toContainText("drawn");

  await page.goto(`/teams/${team.id}/games`);
  await waitForHydration(page);
  const listed = page.getByRole("region", { name: "Not played" });
  await listed.locator("li", { hasText: "Forgotten Foxes" }).getByRole("button", { name: "Delete" }).click();
  await page.getByRole("button", { name: /yes, delete this game/i }).click();
  await expect.poll(async () => (await admin.from("games").select("id").eq("id", missed2.id)).data?.length).toBe(0);
});

// ─── Deleting a live game ───────────────────────────────────────────
test("deleting a live game asks harder, and the open live screen notices", async ({ page, context }) => {
  test.setTimeout(90_000);
  const ownerId = await ownerIdOf();
  const admin = createAdminClient();
  const team = await makeTeam(admin, { ownerId, sport: "afl", name: `R7 LiveDel ${tag()}` });
  const players = await makePlayers(admin, { teamId: team.id, ownerId, count: 12 });
  const game = await makeGame(admin, { teamId: team.id, ownerId, scheduledAt: new Date(Date.now() - 600_000).toISOString() });
  const ids = players.map((p) => p.id);
  await allIn(game.id, ids, ownerId);
  const t = (s: number) => new Date(Date.now() - 300_000 + s * 1000).toISOString();
  await admin.from("game_events").insert([
    { game_id: game.id, type: "lineup_set", metadata: { sport: "afl", lineup: { back: ids.slice(0, 4), hback: [], mid: ids.slice(4, 8), hfwd: [], fwd: ids.slice(8, 12), bench: [] } }, created_at: t(0), created_by: ownerId },
    { game_id: game.id, type: "quarter_start", metadata: { sport: "afl", quarter: 1 }, created_at: t(1), created_by: ownerId },
  ]);
  await admin.from("games").update({ status: "in_progress" }).eq("id", game.id);

  await page.goto(`/teams/${team.id}/games/${game.id}/live`);
  await waitForHydration(page);
  await expect(page.getByText(players[0].full_name, { exact: true }).first()).toBeVisible({ timeout: 15_000 });

  const hub = await context.newPage();
  await hub.goto(`/teams/${team.id}/games/${game.id}`);
  await waitForHydration(hub);
  await hub.getByRole("button", { name: /more actions/i }).click();
  await hub.getByRole("button", { name: /^delete game/i }).click();
  await expect(hub.getByText(/This game is live right now/)).toBeVisible();
  const confirm = hub.getByRole("button", { name: "Delete the live game" });
  await expect(confirm).toBeDisabled();
  await hub.getByLabel(/I know it's live/).check();
  await confirm.click();
  await expect.poll(async () => (await admin.from("games").select("id").eq("id", game.id)).data?.length, { timeout: 20_000 }).toBe(0);
  await hub.close();

  await expect(page.getByRole("heading", { name: "This game was deleted" })).toBeVisible({ timeout: 25_000 });
  await expect(page.getByRole("link", { name: "Back to games" })).toHaveAttribute("href", `/teams/${team.id}/games`);
});

// ─── Short sides ────────────────────────────────────────────────────
test.describe("kicking off short", () => {
  test("AFL 12-a-side with 10 says 'Playing 10 of 12'", async ({ page }) => {
    const ownerId = await ownerIdOf();
    const admin = createAdminClient();
    const team = await makeTeam(admin, { ownerId, sport: "afl", ageGroup: "U10", name: `R7 Short ${tag()}` });
    const players = await makePlayers(admin, { teamId: team.id, ownerId, count: 10 });
    const game = await makeGame(admin, { teamId: team.id, ownerId });
    await allIn(game.id, players.map((p) => p.id), ownerId);

    await page.goto(`/teams/${team.id}/games/${game.id}/live`);
    await page.getByRole("button", { name: /^start q1$/i }).click({ timeout: 15_000 });
    await expect(page.getByTestId("short-side")).toHaveText(/^Playing 10 of 12\./);
  });

  test("futsal with 2 kids says it's under the minimum", async ({ page }) => {
    const ownerId = await ownerIdOf();
    const admin = createAdminClient();
    const team = await makeTeam(admin, { ownerId, sport: "futsal", ageGroup: "U8", name: `R7 Short Futsal ${tag()}` });
    const players = await makePlayers(admin, { teamId: team.id, ownerId, count: 2 });
    const game = await makeGame(admin, { teamId: team.id, ownerId });
    await allIn(game.id, players.map((p) => p.id), ownerId);

    await page.goto(`/teams/${team.id}/games/${game.id}/live`);
    await page.getByRole("button", { name: /^start (h|q)1$/i }).click({ timeout: 15_000 });
    await expect(page.getByTestId("short-side")).toHaveText(/^Playing 2 of \d+, under the 3 this age group plays with/);
  });
});

// ─── P3s: numbers, team names, Delete team ──────────────────────────
test("jersey 1.5 is refused, not saved as #1", async ({ page }) => {
  const ownerId = await ownerIdOf();
  const admin = createAdminClient();
  const team = await makeTeam(admin, { ownerId, sport: "afl", name: `R7 Jersey ${tag()}` });
  await page.goto(`/teams/${team.id}/squad`);
  await waitForHydration(page);
  await page.getByLabel("Player name").fill("Decimal Kid");
  await page.getByLabel("Jersey #").fill("1.5");
  await page.getByRole("button", { name: "Add player" }).click();
  await expect(page.getByText("Jersey must be a whole number from 1 to 99.")).toBeVisible();
  const { data } = await admin.from("players").select("id").eq("team_id", team.id);
  expect(data).toEqual([]);
});

test("a new team's name has the rename's 80-character limit", async ({ page }) => {
  await page.goto("/teams/new");
  await waitForHydration(page);
  await expect(page.getByLabel(/team name/i)).toHaveAttribute("maxlength", "80");
});

test("Delete team takes the name without its emoji, in any case", async ({ page }) => {
  const ownerId = await ownerIdOf();
  const admin = createAdminClient();
  const t = tag();
  const team = await makeTeam(admin, { ownerId, sport: "afl", name: `Zoë’s ⚽ Stars ${t}` });
  await page.goto(`/teams/${team.id}/settings`);
  await waitForHydration(page);
  await page.getByRole("button", { name: "Delete team" }).click();
  const confirm = page.getByRole("dialog").getByRole("button", { name: "Delete team" });
  await page.getByLabel(/type the team name/i).fill(`zoë's stars ${t}`);
  await expect(confirm).toBeEnabled();
  await confirm.click();
  await expect.poll(async () => (await admin.from("teams").select("id").eq("id", team.id)).data?.length, { timeout: 20_000 }).toBe(0);
});

// ─── Fixing a finished game's scores ────────────────────────────────
test("a finished game's scores can be fixed from More, and the summary follows", async ({ page }) => {
  test.setTimeout(90_000);
  const { team, game, players, admin } = await finishedGame("basketball", 6, (ids) => [
    { type: "lineup_set", metadata: { lineup: { lines: { guard: ids.slice(0, 2), forward: ids.slice(2, 5), court: [] }, bench: [ids[5]] } } },
    ...playPeriod(1, [
      { type: "two_pointer", player_id: ids[0], metadata: { quarter: 1 } },
      { type: "opponent_two_pointer", metadata: { quarter: 1 } },
    ]),
    ...playPeriod(2, []),
    fullTime,
  ]);
  const [kai, b] = players;

  await page.goto(`/teams/${team.id}/games/${game.id}`);
  await waitForHydration(page);
  await page.getByRole("button", { name: /more actions/i }).click();
  await page.getByRole("button", { name: /^fix scores/i }).click();
  const dialog = page.getByRole("dialog", { name: "Fix scores" });
  await expect(dialog.getByTestId("fix-scores-total")).toHaveText(new RegExp(`2 – 2`));

  // Change who scored.
  await dialog.getByRole("button", { name: new RegExp(`^Change who scored: ${kai.full_name}`) }).click();
  await dialog.getByRole("combobox", { name: "Who scored" }).selectOption({ label: b.full_name });
  await dialog.getByRole("button", { name: "Save" }).click();
  await expect(dialog.getByTestId("fix-score-row").first()).toContainText(b.full_name, { timeout: 15_000 });

  // Take off their basket.
  await dialog.getByRole("button", { name: /^Take off Test Opponent's two in H1/ }).click();
  await page.getByRole("dialog", { name: "Take off this score?" }).getByRole("button", { name: "Take it off" }).click();
  await expect(dialog.getByTestId("fix-scores-total")).toHaveText(/2 – 0/, { timeout: 15_000 });

  // Add a missed three.
  await dialog.getByRole("button", { name: "+ Add a missed score" }).click();
  await dialog.getByRole("combobox", { name: "Score", exact: true }).selectOption({ label: `Three (${team.name})` });
  await dialog.getByRole("combobox", { name: "Who scored" }).selectOption({ label: kai.full_name });
  await dialog.getByRole("button", { name: "Add", exact: true }).click();
  await expect(dialog.getByTestId("fix-scores-total")).toHaveText(/5 – 0/, { timeout: 15_000 });
  await dialog.getByRole("button", { name: "Done" }).click();

  // Logged as events, so the summary recomputes.
  await expect(page.locator("#basketball-game-summary-text")).toContainText(`${team.name} 5 def`);
  const { data: fixes } = await admin.from("game_events").select("type").eq("game_id", game.id).contains("metadata", { fixed_after_finish: true });
  expect(fixes?.map((f) => f.type).sort()).toEqual(["score_undo", "score_undo", "three_pointer", "two_pointer"]);
});

// ─── Undoing a batch of swaps ───────────────────────────────────────
test("'Make all swaps' can be undone from the toast", async ({ page }) => {
  test.setTimeout(90_000);
  const ownerId = await ownerIdOf();
  const admin = createAdminClient();
  const team = await makeTeam(admin, { ownerId, sport: "soccer", ageGroup: "U8", name: `R7 Undo ${tag()}` });
  const players = await makePlayers(admin, { teamId: team.id, ownerId, count: 9 });
  const game = await makeGame(admin, { teamId: team.id, ownerId });
  const ids = players.map((p) => p.id);
  await allIn(game.id, ids, ownerId);
  // A two-minute sub clock, three minutes into the half: subs are due.
  await admin.from("games").update({ sub_interval_seconds: 120 }).eq("id", game.id);
  const lineup = { keeper: ids[0], lines: { def: [ids[1], ids[2]], mid: [ids[3], ids[4], ids[5]], att: [ids[6]], field: [] }, bench: [ids[7], ids[8]] };
  const at = (ms: number) => new Date(Date.now() - 180_000 + ms).toISOString();
  await admin.from("game_events").insert([
    { game_id: game.id, type: "lineup_set", metadata: { lineup, sport: "soccer" }, created_at: at(-2000), created_by: ownerId },
    { game_id: game.id, type: "quarter_start", metadata: { quarter: 1, sport: "soccer" }, created_at: at(-1000), created_by: ownerId },
  ]);
  await admin.from("games").update({ status: "in_progress" }).eq("id", game.id);

  await page.goto(`/teams/${team.id}/games/${game.id}/live`);
  await waitForHydration(page);
  const makeAll = page.getByRole("button", { name: /^Make all \d+ swaps$/ });
  await expect(makeAll).toBeVisible({ timeout: 20_000 });
  const n = Number((await makeAll.innerText()).match(/\d+/)![0]);
  await makeAll.click();
  const toast = page.getByTestId("swap-toast");
  await expect(toast).toContainText(`${n} subs made`);
  await toast.getByRole("button", { name: "Undo swaps" }).click();
  await expect(toast).toContainText("Swaps undone");

  type Swap = { off_player_id: string; on_player_id: string };
  await expect
    .poll(async () => (await admin.from("game_events").select("id").eq("game_id", game.id).eq("type", "swap")).data?.length, { timeout: 20_000 })
    .toBe(2 * n);
  const { data } = await admin.from("game_events").select("metadata").eq("game_id", game.id).eq("type", "swap").order("created_at");
  const swaps = (data ?? []).map((r) => r.metadata as Swap);
  // The undo is the batch back, last first: each kid back where they were.
  for (let i = 0; i < n; i++) {
    expect(swaps[n + i]).toMatchObject({ off_player_id: swaps[n - 1 - i].on_player_id, on_player_id: swaps[n - 1 - i].off_player_id });
  }
});
