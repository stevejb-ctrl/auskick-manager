// Shared setup and measuring for the accessibility and small-screen
// specs (UX round 3, e4: devices and accessibility, 24 Oct 2026).
//
// Games are seeded straight into the event log mid-period, as the
// sideline specs do, so each spec spends its time on the screen it
// measures. The measures read the rendered page: where a control sits
// against the viewport and the sticky bars, what a screen reader is
// told, and the colours actually painted.

import { expect, type Locator, type Page } from "@playwright/test";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "../fixtures/supabase";
import { makeTeam, makePlayers, makeGame } from "../fixtures/factories";
import { waitForHydration } from "./navigation";

export async function ownerOf(admin: SupabaseClient): Promise<string> {
  const { data } = await admin.auth.admin.listUsers();
  return data.users.find((u) => u.email === process.env.TEST_SUPER_ADMIN_EMAIL)!.id;
}

/** No walkthroughs or long-press hint over the screen. */
export async function skipHints(page: Page): Promise<void> {
  await page.addInitScript(() => {
    try {
      for (const k of ["league-walkthrough-seen", "nb-walkthrough-seen", "gm-walkthrough-seen"]) localStorage.setItem(k, "1");
      localStorage.setItem("siren-longpress-seen-v1", "true");
    } catch {}
  });
}

/**
 * Large text the way the e4 run measured it: the root font size, so
 * every rem grows (real Android text scaling also grows px text).
 */
export async function largeText(page: Page, percent: number): Promise<void> {
  await page.addStyleTag({ content: `html { font-size: ${percent}% !important; }` });
  // Let ResizeObservers (the score bar's spacer) settle.
  await page.waitForTimeout(300);
}

export async function openLive(page: Page, teamId: string, gameId: string, clock: RegExp = /^clock — /i): Promise<void> {
  await page.goto(`/teams/${teamId}/games/${gameId}/live`);
  await waitForHydration(page);
  await expect(page.getByRole("button", { name: clock }).first()).toBeVisible({ timeout: 15_000 });
}

export interface Box {
  top: number;
  bottom: number;
  left: number;
  right: number;
  height: number;
  width: number;
}

/** The fixed or sticky bar an element sits in (the score bar from its clock pill). */
export async function barOf(el: Locator): Promise<Box> {
  return el.evaluate((node) => {
    let n: HTMLElement | null = node as HTMLElement;
    while (n && n !== document.body) {
      const pos = getComputedStyle(n).position;
      if (pos === "fixed" || pos === "sticky") break;
      n = n.parentElement;
    }
    const r = (n ?? (node as HTMLElement)).getBoundingClientRect();
    return { top: r.top, bottom: r.bottom, left: r.left, right: r.right, height: r.height, width: r.width };
  });
}

export async function boxOf(el: Locator): Promise<Box> {
  return el.evaluate((node) => {
    const r = (node as HTMLElement).getBoundingClientRect();
    return { top: r.top, bottom: r.bottom, left: r.left, right: r.right, height: r.height, width: r.width };
  });
}

/** The live screen's bars: the top bar (from Exit) and the score bar (from the clock). */
export async function liveChrome(page: Page): Promise<{ top: Box; bottom: Box; viewport: { width: number; height: number } }> {
  const top = await barOf(page.getByRole("button", { name: "Exit live game" }).first());
  const bottom = await barOf(page.getByRole("button", { name: /^clock — /i }).first());
  const viewport = await page.evaluate(() => ({ width: window.innerWidth, height: window.innerHeight }));
  return { top, bottom, viewport };
}

// ─── Colour ──────────────────────────────────────────────────────

/** WCAG contrast of an element's text against what's painted behind it (alpha-blended). */
export async function contrastOf(el: Locator): Promise<number> {
  return el.evaluate((node) => {
    const parse = (c: string): [number, number, number, number] => {
      const m = c.match(/rgba?\(([^)]+)\)/);
      if (!m) return [0, 0, 0, 0];
      const p = m[1].split(/[ ,/]+/).filter(Boolean).map(Number);
      return [p[0], p[1], p[2], p.length > 3 ? p[3] : 1];
    };
    const over = (top: number[], under: number[]) => {
      const a = top[3];
      return [0, 1, 2].map((i) => top[i] * a + under[i] * (1 - a)).concat(1);
    };
    // Backgrounds from the element up, then blend top-down onto white.
    const layers: number[][] = [];
    let n: HTMLElement | null = node as HTMLElement;
    while (n) {
      const bg = parse(getComputedStyle(n).backgroundColor);
      if (bg[3] > 0) layers.push(bg);
      if (bg[3] >= 1) break;
      n = n.parentElement;
    }
    let bg = [255, 255, 255, 1];
    for (const layer of layers.reverse()) bg = over(layer, bg);
    const s = getComputedStyle(node as HTMLElement);
    const fg = over(parse(s.color), bg);
    // Faded text (opacity on the element or an ancestor) blends too.
    let opacity = 1;
    for (let o: HTMLElement | null = node as HTMLElement; o; o = o.parentElement) opacity *= Number(getComputedStyle(o).opacity);
    const shown = [0, 1, 2].map((i) => fg[i] * opacity + bg[i] * (1 - opacity));
    const lum = (rgb: number[]) => {
      const [r, g, b] = rgb.map((v) => {
        const c = v / 255;
        return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
      });
      return 0.2126 * r + 0.7152 * g + 0.0722 * b;
    };
    const [l1, l2] = [lum(shown), lum(bg)].sort((a, b) => b - a);
    return (l1 + 0.05) / (l2 + 0.05);
  });
}

/** Contrast of a CSS colour against a fixed background (for a token). */
export function contrast(fg: [number, number, number], bg: [number, number, number]): number {
  const lum = (rgb: number[]) => {
    const [r, g, b] = rgb.map((v) => {
      const c = v / 255;
      return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const [l1, l2] = [lum(fg), lum(bg)].sort((a, b) => b - a);
  return (l1 + 0.05) / (l2 + 0.05);
}

// ─── Screen readers ──────────────────────────────────────────────

/**
 * Mark every live region on the page now, so a later check can tell an
 * announcement made into a region that was already there (read out)
 * from one mounted with its text inside (often skipped).
 */
export async function markLiveRegions(page: Page): Promise<void> {
  await page.evaluate(() => {
    for (const el of Array.from(document.querySelectorAll("[aria-live], [role=status], [role=alert], [role=log]"))) {
      (el as HTMLElement).dataset.e2ePresent = "1";
    }
  });
}

/** The text of every live region that was on the page before markLiveRegions, joined. */
export async function announcedText(page: Page): Promise<string> {
  return page.evaluate(() =>
    Array.from(document.querySelectorAll("[data-e2e-present]"))
      .filter((el) => (el.getAttribute("aria-live") ?? "polite") !== "off")
      .map((el) => el.textContent ?? "")
      .join(" | "),
  );
}

/** Whether keyboard focus is inside the open dialog (or is the dialog). */
export async function focusInDialog(page: Page): Promise<boolean> {
  return page.evaluate(() => {
    const a = document.activeElement;
    const dialogs = Array.from(document.querySelectorAll("[role=dialog][aria-modal=true]"));
    const top = dialogs[dialogs.length - 1];
    return !!a && !!top && top.contains(a);
  });
}

// ─── Seeds ───────────────────────────────────────────────────────

type Row = { type: string; metadata?: Record<string, unknown>; player_id?: string };

async function seedEvents(admin: SupabaseClient, gameId: string, ownerId: string, startMs: number, rows: Row[]) {
  const { error } = await admin.from("game_events").insert(
    rows.map((r, i) => ({ game_id: gameId, created_by: ownerId, created_at: new Date(startMs + i * 10).toISOString(), ...r })),
  );
  if (error) throw new Error(`seedEvents: ${error.message}`);
  await admin.from("games").update({ status: "in_progress" }).eq("id", gameId);
}

/**
 * Rugby union U12 (15 a side, +T +C +PG +DG a side) in H1, started
 * `elapsedSec` ago. `ended`: H1 is over and the break is up.
 */
export async function unionGame(opts: {
  name: string;
  count?: number;
  available?: number;
  elapsedSec?: number;
  subIntervalSec?: number;
  ended?: boolean;
  names?: string[];
  /** false: before kickoff (the lineup picker). */
  seed?: boolean;
  /** Events in H1, after the kickoff (scores, swaps). */
  rows?: (ids: string[]) => Row[];
}) {
  const admin = createAdminClient();
  const ownerId = await ownerOf(admin);
  const team = await makeTeam(admin, { ownerId, sport: "rugby_union", ageGroup: "U12", name: `${opts.name} ${Date.now() % 100000}` });
  await admin.from("teams").update({ track_scoring: true }).eq("id", team.id);
  const players = await makePlayers(admin, { teamId: team.id, ownerId, count: opts.count ?? 17 });
  if (opts.names) {
    for (let i = 0; i < opts.names.length; i++) {
      const full_name = opts.names[i];
      await admin.from("players").update({ full_name }).eq("id", players[i].id);
      players[i].full_name = full_name;
    }
  }
  const game = await makeGame(admin, { teamId: team.id, ownerId });
  await admin.from("games").update({ sub_interval_seconds: opts.subIntervalSec ?? 900 }).eq("id", game.id);
  const available = players.slice(0, opts.available ?? players.length);
  await admin
    .from("game_availability")
    .insert(available.map((p) => ({ game_id: game.id, player_id: p.id, status: "available" as const, updated_by: ownerId })));
  const ids = available.map((p) => p.id);
  const lineup = { forwards: ids.slice(0, 8), backs: ids.slice(8, 15), bench: ids.slice(15) };
  if (opts.seed === false) return { admin, ownerId, team, game, players, lineup };
  const start = Date.now() - (opts.elapsedSec ?? 60) * 1000;
  await seedEvents(admin, game.id, ownerId, start, [
    { type: "lineup_set", metadata: { lineup, sport: "rugby_union" } },
    { type: "quarter_start", metadata: { quarter: 1, sport: "rugby_union" } },
    ...(opts.rows?.(ids) ?? []).map((r) => ({ ...r, metadata: { ...r.metadata, sport: "rugby_union" } })),
    ...(opts.ended ? [{ type: "quarter_end", metadata: { quarter: 1, elapsed_ms: 1_500_000, sport: "rugby_union" } }] : []),
  ]);
  return { admin, ownerId, team, game, players, lineup };
}

const NETBALL_KEYS = ["gs", "ga", "wa", "c", "wd", "gd", "gk"] as const;

/** Netball ("go", 10-minute quarters) in Q1, started `elapsedSec` ago. `seed: false`: before kickoff. */
export async function netballGame(opts: { name: string; elapsedSec?: number; seed?: boolean; rows?: (ids: string[]) => Row[]; ended?: boolean }) {
  const admin = createAdminClient();
  const ownerId = await ownerOf(admin);
  const team = await makeTeam(admin, { ownerId, sport: "netball", ageGroup: "go", name: `${opts.name} ${Date.now() % 100000}` });
  await admin.from("teams").update({ track_scoring: true }).eq("id", team.id);
  const players = await makePlayers(admin, { teamId: team.id, ownerId, count: 9, ageGroup: "U10" });
  const game = await makeGame(admin, { teamId: team.id, ownerId, opponent: "Hawks" });
  await admin.from("game_availability").insert(players.map((p) => ({ game_id: game.id, player_id: p.id, status: "available" as const })));
  if (opts.seed !== false) {
    const positions = Object.fromEntries(NETBALL_KEYS.map((k, i) => [k, [players[i].id]]));
    const lineup = { positions, bench: players.slice(7).map((p) => p.id) };
    await seedEvents(admin, game.id, ownerId, Date.now() - (opts.elapsedSec ?? 60) * 1000, [
      { type: "lineup_set", metadata: { lineup } },
      { type: "quarter_start", metadata: { quarter: 1 } },
      ...(opts.rows?.(players.map((p) => p.id)) ?? []),
      ...(opts.ended ? [{ type: "quarter_end", metadata: { quarter: 1, elapsed_ms: 600_000 } }] : []),
    ]);
  }
  return { admin, ownerId, team, game, players };
}

/** Basketball U12 (+1 +2 +3 a side) in H1, started `elapsedSec` ago. */
export async function basketballGame(opts: { name: string; elapsedSec?: number; subIntervalSec?: number; count?: number }) {
  const admin = createAdminClient();
  const ownerId = await ownerOf(admin);
  const team = await makeTeam(admin, { ownerId, sport: "basketball", ageGroup: "U12", name: `${opts.name} ${Date.now() % 100000}` });
  await admin.from("teams").update({ track_scoring: true }).eq("id", team.id);
  const players = await makePlayers(admin, { teamId: team.id, ownerId, count: opts.count ?? 8 });
  const game = await makeGame(admin, { teamId: team.id, ownerId, opponent: "Fdggd" });
  if (opts.subIntervalSec) await admin.from("games").update({ sub_interval_seconds: opts.subIntervalSec }).eq("id", game.id);
  const ids = players.map((p) => p.id);
  const lineup = { lines: { guard: ids.slice(0, 2), forward: ids.slice(2, 5), court: [] }, bench: ids.slice(5) };
  await seedEvents(admin, game.id, ownerId, Date.now() - (opts.elapsedSec ?? 30) * 1000, [
    { type: "lineup_set", metadata: { lineup, sport: "basketball" } },
    { type: "quarter_start", metadata: { quarter: 1, sport: "basketball" } },
  ]);
  return { admin, ownerId, team, game, players };
}
