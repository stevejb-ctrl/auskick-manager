// Shared helpers for the help-screenshot seed + capture scripts (see
// capture.mjs for how to run them). LOCAL SUPABASE ONLY: reads .env.test
// and refuses to run against anything that isn't 127.0.0.1 / localhost.

import { createRequire } from "node:module";
import { mkdirSync, readFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
/** Seeded ids, saved sign-ins and raw captures. Never committed. */
export const STATE_DIR = path.join(os.tmpdir(), "siren-help-shots");
mkdirSync(STATE_DIR, { recursive: true });
export const req = createRequire(path.join(REPO, "package.json"));

const env = Object.fromEntries(
  readFileSync(path.join(REPO, ".env.test"), "utf8")
    .split(/\r?\n/)
    .filter((l) => l && !l.startsWith("#") && l.includes("="))
    .map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1)]),
);
export const SUPABASE_URL = env.NEXT_PUBLIC_SUPABASE_URL;
if (!/^http:\/\/(127\.0\.0\.1|localhost)/.test(SUPABASE_URL ?? "")) {
  throw new Error(`refusing to run against non-local Supabase: ${SUPABASE_URL}`);
}
const { createClient } = req("@supabase/supabase-js");
export const admin = createClient(SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

export const COACH = {
  email: "sam.taylor@siren.test",
  password: "help-shots-pw-4821",
  name: "Sam Taylor",
};
export const NEW_COACH = {
  email: "alex.rivera@siren.test",
  password: "help-shots-pw-4821",
  name: "Alex Rivera",
};

/** Owns one demo team per sport (sport-teams.mjs) for the sport hubs' shots. */
export const SPORTS_COACH = {
  email: "jordan.lee@siren.test",
  password: "help-shots-pw-4821",
  name: "Jordan Lee",
};

export const MIN = 60_000;

/** Deterministic PRNG so re-seeding gives the same games. */
export function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export async function must(p, what) {
  const { data, error } = await p;
  if (error) throw new Error(`${what}: ${error.message}`);
  return data;
}

export async function findUser(email) {
  const { data, error } = await admin.auth.admin.listUsers({ perPage: 1000 });
  if (error) throw new Error(error.message);
  return data.users.find((u) => u.email === email) ?? null;
}

/** Replace a game's event log and set its status. */
export async function setGameEvents(gameId, ownerId, events, status) {
  await must(admin.from("game_events").delete().eq("game_id", gameId), "clear events");
  await must(admin.from("game_lineup_drafts").delete().eq("game_id", gameId), "clear draft");
  await must(admin.from("player_game_time").delete().eq("game_id", gameId), "clear rollup");
  if (events.length) {
    const rows = events.map((e) => ({
      game_id: gameId,
      type: e.type,
      player_id: e.player_id ?? null,
      metadata: e.metadata ?? {},
      created_by: ownerId,
      created_at: e.created_at,
    }));
    for (let i = 0; i < rows.length; i += 200) {
      await must(admin.from("game_events").insert(rows.slice(i, i + 200)), "insert events");
    }
  }
  await must(admin.from("games").update({ status }).eq("id", gameId), "game status");
}

// ─── Game simulators ─────────────────────────────────────────
// Each returns an ordered event list starting at `startMs` (epoch).
// `upTo` stops the game part-way: { quarter, elapsedMs } — events
// after that point are dropped and the quarter is left running (or
// ended, with `ended: true`).

function stamp(startMs) {
  let t = startMs;
  return (gapMs = 1000) => {
    t += gapMs;
    return new Date(t).toISOString();
  };
}

/**
 * AFL zones3 game. players: ids in squad order (available only).
 * onField: 12 → 4/4/4.
 */
export function simulateAfl({ players, startMs, seed, quarterMs = 12 * MIN, subEveryMs = 4 * MIN, goalsFor, goalsAgainst, upTo }) {
  const r = rng(seed);
  const pick = (arr) => arr[Math.floor(r() * arr.length)];
  const per = Math.floor(Math.min(12, players.length) / 3);
  let lineup = {
    back: players.slice(0, per),
    hback: [],
    mid: players.slice(per, per * 2),
    hfwd: [],
    fwd: players.slice(per * 2, per * 3),
    bench: players.slice(per * 3),
  };
  const fieldMs = Object.fromEntries(players.map((p) => [p, 0]));
  const evs = [];
  const at = (q, el) => startMs + (q - 1) * (quarterMs + 4 * MIN) + el;
  const push = (q, el, e) => evs.push({ ...e, _t: at(q, el) });
  push(1, -60_000, { type: "lineup_set", metadata: { lineup: structuredClone(lineup) } });
  const zoneOf = (pid) => ["back", "mid", "fwd"].find((z) => lineup[z].includes(pid));
  for (let q = 1; q <= 4; q++) {
    if (q > 1) {
      // Break reshuffle: rotate lines (back→mid→fwd→back).
      lineup = { ...lineup, back: lineup.fwd, mid: lineup.back, fwd: lineup.mid };
      push(q, -30_000, { type: "lineup_set", metadata: { lineup: structuredClone(lineup), quarter: q } });
    }
    push(q, 0, { type: "quarter_start", metadata: { quarter: q } });
    let lastMs = 0;
    const moments = [];
    for (let s = subEveryMs; s < quarterMs; s += subEveryMs) moments.push({ kind: "sub", el: s });
    const gf = goalsFor[q - 1];
    const ga = goalsAgainst[q - 1];
    for (let i = 0; i < gf[0]; i++) moments.push({ kind: "goal", el: Math.floor(r() * (quarterMs - 20_000)) + 10_000 });
    for (let i = 0; i < gf[1]; i++) moments.push({ kind: "behind", el: Math.floor(r() * (quarterMs - 20_000)) + 10_000 });
    for (let i = 0; i < ga[0]; i++) moments.push({ kind: "opponent_goal", el: Math.floor(r() * (quarterMs - 20_000)) + 10_000 });
    for (let i = 0; i < ga[1]; i++) moments.push({ kind: "opponent_behind", el: Math.floor(r() * (quarterMs - 20_000)) + 10_000 });
    moments.sort((a, b) => a.el - b.el);
    for (const m of moments) {
      if (upTo && (q > upTo.quarter || (q === upTo.quarter && m.el > upTo.elapsedMs))) break;
      for (const z of ["back", "mid", "fwd"]) for (const p of lineup[z]) fieldMs[p] += m.el - lastMs;
      lastMs = m.el;
      if (m.kind === "sub") {
        const onField = [...lineup.back, ...lineup.mid, ...lineup.fwd];
        const offs = onField
          .slice()
          .sort((a, b) => fieldMs[b] - fieldMs[a] || r() - 0.5)
          .slice(0, lineup.bench.length);
        const ons = lineup.bench.slice();
        offs.forEach((off, i) => {
          const on = ons[i];
          const zone = zoneOf(off);
          lineup[zone] = lineup[zone].map((p) => (p === off ? on : p));
          lineup.bench = [...lineup.bench.filter((p) => p !== on), off];
          push(q, m.el + i * 1500, {
            type: "swap",
            player_id: on,
            metadata: { off_player_id: off, on_player_id: on, zone, quarter: q, elapsed_ms: m.el + i * 1500 },
          });
        });
      } else if (m.kind === "goal" || m.kind === "behind") {
        const pool = r() < 0.75 ? lineup.fwd : lineup.mid;
        push(q, m.el, { type: m.kind, player_id: pick(pool), metadata: { quarter: q, elapsed_ms: m.el } });
      } else {
        push(q, m.el, { type: m.kind, metadata: { quarter: q, elapsed_ms: m.el } });
      }
    }
    if (upTo && q === upTo.quarter && !upTo.ended) break;
    for (const z of ["back", "mid", "fwd"]) for (const p of lineup[z]) fieldMs[p] += quarterMs - lastMs;
    push(q, quarterMs, { type: "quarter_end", metadata: { quarter: q, elapsed_ms: quarterMs } });
    if (upTo && q === upTo.quarter) break;
    if (q === 4) push(q, quarterMs + 60_000, { type: "game_finalised", metadata: { quarter: 4, elapsed_ms: quarterMs } });
  }
  return finish(evs);
}

const NB_POS = ["gs", "ga", "wa", "c", "wd", "gd", "gk"];

/** Netball: subs only at breaks (period_break_swap). */
export function simulateNetball({ players, startMs, seed, quarterMs = 10 * MIN, goalsFor, goalsAgainst, upTo }) {
  const r = rng(seed);
  const evs = [];
  const at = (q, el) => startMs + (q - 1) * (quarterMs + 4 * MIN) + el;
  const push = (q, el, e) => evs.push({ ...e, _t: at(q, el) });
  const lineupFor = (q) => {
    // Rotate the squad through the 7 bibs, a different 3 sitting each quarter.
    const n = players.length;
    const shift = ((q - 1) * 3) % n;
    const order = players.slice(shift).concat(players.slice(0, shift));
    const positions = Object.fromEntries(NB_POS.map((k, i) => [k, [order[i]]]));
    return { positions, bench: order.slice(NB_POS.length) };
  };
  let lineup = lineupFor(1);
  push(1, -60_000, { type: "lineup_set", metadata: { lineup } });
  for (let q = 1; q <= 4; q++) {
    if (q > 1) {
      lineup = lineupFor(q);
      push(q, -30_000, { type: "period_break_swap", metadata: { quarter: q, lineup } });
    }
    push(q, 0, { type: "quarter_start", metadata: { quarter: q } });
    const moments = [];
    for (let i = 0; i < goalsFor[q - 1]; i++) moments.push({ kind: "goal", el: Math.floor(r() * (quarterMs - 20_000)) + 10_000 });
    for (let i = 0; i < goalsAgainst[q - 1]; i++) moments.push({ kind: "opponent_goal", el: Math.floor(r() * (quarterMs - 20_000)) + 10_000 });
    moments.sort((a, b) => a.el - b.el);
    for (const m of moments) {
      if (upTo && (q > upTo.quarter || (q === upTo.quarter && m.el > upTo.elapsedMs))) break;
      if (m.kind === "goal") {
        const shooter = r() < 0.6 ? lineup.positions.gs[0] : lineup.positions.ga[0];
        push(q, m.el, { type: "goal", player_id: shooter, metadata: { quarter: q, elapsed_ms: m.el } });
      } else {
        push(q, m.el, { type: "opponent_goal", metadata: { quarter: q, elapsed_ms: m.el } });
      }
    }
    if (upTo && q === upTo.quarter && !upTo.ended) break;
    push(q, quarterMs, { type: "quarter_end", metadata: { quarter: q, elapsed_ms: quarterMs } });
    if (upTo && q === upTo.quarter) break;
    if (q === 4) push(q, quarterMs + 60_000, { type: "game_finalised", metadata: { quarter: 4, elapsed_ms: quarterMs } });
  }
  return finish(evs);
}

/**
 * Junior league (U8–U12 laws): 4F/4B, rolling subs, FR + DH vests,
 * kickoff and goal-kick rotations.
 */
export function simulateLeague({ players, startMs, seed, quarterMs = 8 * MIN, periods = 4, tries, oppTries, upTo, midSwaps = [1, 3] }) {
  const r = rng(seed);
  const evs = [];
  const at = (q, el) => startMs + (q - 1) * (quarterMs + 3 * MIN) + el;
  const push = (q, el, e) => evs.push({ ...e, _t: at(q, el) });
  const S = "rugby_league";
  const onCount = 8;
  let lineup = {
    forwards: players.slice(0, 4),
    backs: players.slice(4, onCount),
    bench: players.slice(onCount),
  };
  push(1, -90_000, { type: "lineup_set", metadata: { lineup: structuredClone(lineup) } });
  // Vest plan: a different FR and DH each period, never the same kid twice.
  const backsOrder = players.slice(4).concat(players.slice(0, 4));
  const frPlan = [];
  const dhPlan = [];
  for (let p = 0; p < periods; p++) {
    frPlan.push(backsOrder[p % backsOrder.length]);
    dhPlan.push(players[p % 4]);
  }
  for (let p = 0; p < periods; p++) {
    push(1, -80_000 + p * 100, { type: "vest_assigned", player_id: frPlan[p], metadata: { vest: "fr", period: p + 1, replacement: false, sport: S } });
    push(1, -79_000 + p * 100, { type: "vest_assigned", player_id: dhPlan[p], metadata: { vest: "dh", period: p + 1, replacement: false, sport: S } });
  }
  const onField = () => [...lineup.forwards, ...lineup.backs];
  const swap = (off, on) => {
    for (const k of ["forwards", "backs"]) lineup[k] = lineup[k].map((p) => (p === off ? on : p));
    lineup.bench = [...lineup.bench.filter((p) => p !== on), off];
  };
  const kicked = new Set();
  const kickoffDone = new Set();
  for (let q = 1; q <= periods; q++) {
    if (q > 1) {
      // Break: bring the whole bench on for the three who've played longest.
      const vestsNow = new Set([frPlan[q - 1], dhPlan[q - 1]]);
      const offs = onField().filter((p) => !vestsNow.has(p)).slice(0, lineup.bench.length);
      const ons = lineup.bench.filter((p) => !vestsNow.has(p) || true).slice(0, offs.length);
      offs.forEach((off, i) => swap(off, ons[i]));
      // Make sure this period's vest wearers are on.
      for (const v of vestsNow) {
        if (!onField().includes(v)) {
          const off = onField().find((p) => !vestsNow.has(p) && !ons.includes(p));
          swap(off, v);
        }
      }
      push(q, -30_000, { type: "lineup_set", metadata: { lineup: structuredClone(lineup), quarter: q } });
    }
    push(q, 0, { type: "quarter_start", metadata: { quarter: q, sport: S } });
    if (upTo && q === upTo.quarter && upTo.elapsedMs < 0) return finish(evs);
    // Kickoff: next player on field who hasn't kicked off.
    let ko = onField().find((p) => !kickoffDone.has(p));
    if (!ko) {
      kickoffDone.clear();
      ko = onField()[0];
    }
    kickoffDone.add(ko);
    push(q, 5_000, { type: "kickoff_taken", player_id: ko, metadata: { period: q, sport: S } });
    const moments = [];
    if (midSwaps.includes(q)) moments.push({ kind: "swap", el: 4 * MIN });
    for (let i = 0; i < tries[q - 1][0]; i++) moments.push({ kind: "try", made: i < tries[q - 1][1], el: Math.floor(r() * (quarterMs - 60_000)) + 20_000 });
    for (let i = 0; i < oppTries[q - 1][0]; i++) moments.push({ kind: "opp", made: i < oppTries[q - 1][1], el: Math.floor(r() * (quarterMs - 60_000)) + 20_000 });
    moments.sort((a, b) => a.el - b.el);
    for (const m of moments) {
      if (upTo && (q > upTo.quarter || (q === upTo.quarter && m.el > upTo.elapsedMs))) break;
      if (m.kind === "swap") {
        const vestsNow = new Set([frPlan[q - 1], dhPlan[q - 1]]);
        const off = onField().filter((p) => !vestsNow.has(p))[2];
        const on = lineup.bench[0];
        swap(off, on);
        push(q, m.el, { type: "swap", player_id: on, metadata: { off_player_id: off, on_player_id: on, quarter: q, elapsed_ms: m.el, sport: S } });
      } else if (m.kind === "try") {
        const scorer = onField()[Math.floor(r() * onField().length)];
        push(q, m.el, { type: "try", player_id: scorer, metadata: { quarter: q, elapsed_ms: m.el, sport: S } });
        let kicker = onField().find((p) => !kicked.has(p));
        if (!kicker) {
          kicked.clear();
          kicker = onField()[0];
        }
        kicked.add(kicker);
        push(q, m.el + 40_000, {
          type: "conversion_attempt",
          player_id: kicker,
          metadata: { quarter: q, elapsed_ms: m.el + 40_000, made: m.made, force: false, sport: S },
        });
      } else {
        push(q, m.el, { type: "opponent_try", metadata: { quarter: q, elapsed_ms: m.el, sport: S } });
        if (m.made) push(q, m.el + 40_000, { type: "opponent_conversion", metadata: { quarter: q, elapsed_ms: m.el + 40_000, sport: S } });
      }
    }
    if (upTo && q === upTo.quarter && !upTo.ended) break;
    push(q, quarterMs, { type: "quarter_end", metadata: { quarter: q, elapsed_ms: quarterMs, sport: S } });
    if (upTo && q === upTo.quarter) break;
    if (q === periods) push(q, quarterMs + 60_000, { type: "game_finalised", metadata: { quarter: periods, elapsed_ms: quarterMs } });
  }
  return finish(evs);
}

function finish(evs) {
  return evs
    .map((e, i) => ({ ...e, _i: i }))
    .sort((a, b) => a._t - b._t || a._i - b._i)
    .map(({ _t, _i, ...e }) => ({ ...e, created_at: new Date(_t).toISOString() }));
}

/** Shift so the event log's quarter `q` started `agoMs` before now. */
export function anchorToNow(events, q, agoMs) {
  const qs = events.find((e) => e.type === "quarter_start" && e.metadata.quarter === q);
  const delta = Date.now() - agoMs - Date.parse(qs.created_at);
  return events.map((e) => ({ ...e, created_at: new Date(Date.parse(e.created_at) + delta).toISOString() }));
}
