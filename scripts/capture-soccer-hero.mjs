// Capture the homepage's football (soccer) hero screenshot: a U9 game
// mid-way through the first half, on a phone (390 × 845 at 2×). Seeds
// a team and game in the LOCAL database (refuses any other), shoots the
// live screen, then deletes the team.
//
// Needs a production build served locally (CAPTURE_BASE, default
// http://localhost:3500) with .env.test loaded, and a signed-in account:
// the saved e2e sign-in (playwright/.auth/super-admin.json) for
// CAPTURE_EMAIL, else it signs in as TEST_SUPER_ADMIN_EMAIL.
//   node scripts/capture-soccer-hero.mjs public/marketing/screenshots/soccer/live-game.png
import { chromium } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import fs from "node:fs";

const BASE = process.env.CAPTURE_BASE ?? "http://localhost:3500";
const OUT = process.argv[2];
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!OUT || !url || !key || !/127\.0\.0\.1|localhost/.test(url)) {
  console.error("Refusing: needs an output path and a local Supabase URL.");
  process.exit(1);
}
const admin = createClient(url, key, { auth: { persistSession: false } });
// The account the saved sign-in (playwright/.auth) belongs to.
const email = process.env.CAPTURE_EMAIL ?? process.env.TEST_SUPER_ADMIN_EMAIL;
const { data: users } = await admin.auth.admin.listUsers({ perPage: 1000 });
const owner = users.users.find((u) => u.email === email);
if (!owner) throw new Error(`no user ${email}`);

const { data: team, error: teamErr } = await admin
  .from("teams")
  .insert({ name: "Kingsway United", age_group: "U9", sport: "soccer", track_scoring: true, created_by: owner.id })
  .select("id")
  .single();
if (teamErr) throw teamErr;

try {
  const names = [
    "Mia Torres", "Leo Nguyen", "Zara Kowalski", "Noah Petrakis", "Ruby Okafor",
    "Eli Haddad", "Ava Lindqvist", "Kian Patel", "Sienna Rossi", "Theo Barker",
  ];
  const { data: players, error: pErr } = await admin
    .from("players")
    .insert(names.map((n, i) => ({ team_id: team.id, full_name: n, jersey_number: i + 1, is_active: true, created_by: owner.id })))
    .select("id, full_name");
  if (pErr) throw pErr;
  const id = (n) => players.find((p) => p.full_name === n).id;

  const { data: game, error: gErr } = await admin
    .from("games")
    .insert({
      team_id: team.id,
      opponent: "Coogee Crabs",
      scheduled_at: new Date().toISOString(),
      round_number: 3,
      on_field_size: 7,
      sub_interval_seconds: 300,
      status: "in_progress",
      created_by: owner.id,
    })
    .select("id")
    .single();
  if (gErr) throw gErr;
  await admin.from("game_availability").insert(
    players.map((p) => ({ game_id: game.id, player_id: p.id, status: "available", updated_by: owner.id })),
  );

  // H1 started 9 minutes ago: 11:00 left of 20. A sub at 5:00 (the next
  // falls due at 10:00, so the sub card counts down), goals at 3:10 and
  // 7:30 for us, 6:05 for them.
  const started = Date.now() - 9 * 60_000;
  const at = (ms) => new Date(started + ms).toISOString();
  const lineup = {
    keeper: id("Ruby Okafor"),
    lines: {
      def: [id("Leo Nguyen"), id("Eli Haddad")],
      mid: [id("Zara Kowalski"), id("Mia Torres"), id("Kian Patel")],
      att: [id("Noah Petrakis")],
      field: [],
    },
    bench: [id("Ava Lindqvist"), id("Sienna Rossi"), id("Theo Barker")],
  };
  const sp = { sport: "soccer" };
  const evs = [
    { type: "lineup_set", metadata: { lineup, ...sp }, created_at: at(-2000) },
    { type: "quarter_start", metadata: { quarter: 1, ...sp }, created_at: at(0) },
    { type: "goal", player_id: id("Noah Petrakis"), metadata: { quarter: 1, elapsed_ms: 190_000, ...sp }, created_at: at(190_000) },
    {
      type: "swap",
      player_id: id("Ava Lindqvist"),
      metadata: { off_player_id: id("Eli Haddad"), on_player_id: id("Ava Lindqvist"), line: "def", quarter: 1, elapsed_ms: 300_000, ...sp },
      created_at: at(300_000),
    },
    { type: "opponent_goal", metadata: { quarter: 1, elapsed_ms: 365_000, ...sp }, created_at: at(365_000) },
    { type: "goal", player_id: id("Mia Torres"), metadata: { quarter: 1, elapsed_ms: 450_000, ...sp }, created_at: at(450_000) },
  ];
  const { error: eErr } = await admin
    .from("game_events")
    .insert(evs.map((e) => ({ ...e, game_id: game.id, created_by: owner.id })));
  if (eErr) throw eErr;

  const browser = await chromium.launch();
  const context = await browser.newContext({
    viewport: { width: 390, height: 845 },
    deviceScaleFactor: 2,
    storageState: fs.existsSync("playwright/.auth/super-admin.json") ? "playwright/.auth/super-admin.json" : undefined,
  });
  // A returning coach: the first-visit long-press hint is already seen.
  await context.addInitScript(() => {
    try {
      window.localStorage.setItem("siren-longpress-seen-v1", "true");
    } catch {}
  });
  const page = await context.newPage();
  await page.goto(`${BASE}/teams/${team.id}/games/${game.id}/live`);
  if (page.url().includes("/login")) {
    await page.getByTestId("login-mode-toggle").click();
    await page.getByTestId("login-email").fill(email);
    await page.getByTestId("login-password").fill(process.env.TEST_SUPER_ADMIN_PASSWORD);
    await page.getByTestId("login-submit").click();
    await page.waitForURL(/\/dashboard/, { timeout: 60_000 });
    await page.goto(`${BASE}/teams/${team.id}/games/${game.id}/live`);
  }
  try {
    await page.getByRole("button", { name: /^clock — h1, running$/i }).waitFor({ timeout: 30_000 });
  } catch (e) {
    console.log("url:", page.url());
    await page.screenshot({ path: process.env.CAPTURE_DEBUG ?? "capture-debug.png" });
    throw e;
  }
  // Let fonts settle and the long-press hint pass.
  await page.waitForTimeout(2500);
  await page.screenshot({ path: OUT });
  await browser.close();
  console.log(`captured ${OUT}`);
} finally {
  await admin.from("teams").delete().eq("id", team.id);
  console.log("seeded team deleted");
}
