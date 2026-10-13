// AFL sideline combos: random walks over everything a coach does during
// a game and at the breaks, written as the live screen and QuarterBreak
// write them, replayed after every event. See harness.ts.

import { describe, it } from "vitest";
import { ALL_ZONES, replayGame, suggestStartingLineup, suggestSwaps, zoneCapsFor } from "@/lib/fairness";
import type { Lineup, Zone } from "@/lib/types";
import { check, dupes, eventLog, runWalks, type Rng } from "./harness";

const ZONES: Zone[] = ["back", "mid", "fwd"];
const CAPS = zoneCapsFor(12, "zones3");
const QUARTER_MS = 12 * 60_000;

type Log = ReturnType<typeof eventLog>;

interface Ctx {
  r: Rng;
  log: Log;
  trace: string[];
  present: string[]; // at the game (squad marked in + arrivals)
  reserve: string[]; // squad not here yet (late arrivals come from here)
  quarter: number;
  elapsed: number; // within the current quarter
  elapsedByQuarter: Record<number, number>;
  scores: string[]; // ids of score events still standing (ours + theirs)
  /** "ordered" = events land as enqueued; "racy" = a multi-event action's events may land in either order (parallel queue lanes). */
  mode: "ordered" | "racy";
}

const onField = (l: Lineup) => ZONES.flatMap((z) => l[z]);
const zoneOf = (l: Lineup, pid: string) => ZONES.find((z) => l[z].includes(pid)) ?? null;

function state(ctx: Ctx) {
  return replayGame(ctx.log.events);
}

/** The invariants: what the coach sees must always make sense. */
function checkAll(ctx: Ctx, what: string) {
  const s = state(ctx);
  const l = s.lineup;
  if (!l) return;
  const field = onField(l);
  const everyone = [...ALL_ZONES.flatMap((z) => l[z]), ...l.bench];
  check(dupes(everyone).length === 0, `${what}: in two places: ${dupes(everyone).join(",")}`);
  for (const pid of ctx.present) check(everyone.includes(pid), `${what}: ${pid} vanished from the lineup`);
  const sidelined = [...s.injuredIds, ...s.loanedIds];
  for (const pid of sidelined) check(!field.includes(pid), `${what}: ${pid} is injured/lent but on the field`);
  for (const z of ZONES) check(l[z].length <= CAPS[z], `${what}: ${z} has ${l[z].length} > ${CAPS[z]}`);
  // Time: nobody gets more of a quarter than the quarter ran.
  for (const [pid, periods] of Object.entries(s.playedZoneMsByPeriod)) {
    for (const [q, zm] of Object.entries(periods)) {
      const total = Object.values(zm).reduce((a, b) => a + b, 0);
      // The quarter in play has run `elapsed` so far.
      const ran = ctx.elapsedByQuarter[Number(q)] ?? (Number(q) === ctx.quarter ? ctx.elapsed : 0);
      check(total <= ran + 1, `${what}: ${pid} credited ${total}ms in Q${q}, which ran ${ran}ms`);
    }
  }
  // Suggestions never bring on an injured or lent kid, or take off a held one.
  if (!s.quarterEnded && s.currentQuarter >= 1) {
    const sugg = suggestSwaps(l, {}, 0, sidelined, ZONES, []);
    for (const sw of sugg) {
      check(!sidelined.includes(sw.on_player_id), `${what}: suggested ${sw.on_player_id} on, but they're injured/lent`);
      check(field.includes(sw.off_player_id), `${what}: suggested ${sw.off_player_id} off, but they're not on the field`);
    }
  }
}

function add(ctx: Ctx, type: Parameters<Log["add"]>[0], meta: Record<string, unknown>, pid: string | null = null) {
  ctx.log.add(type, meta, pid);
}

/** Two events from different queue lanes: in "racy" mode either may land first. */
function pair(ctx: Ctx, a: () => void, b: () => void) {
  if (ctx.mode === "racy" && ctx.r.chance(0.5)) {
    b();
    a();
  } else {
    a();
    b();
  }
}

// ── During a quarter ─────────────────────────────────────────────
function playStep(ctx: Ctx) {
  const { r } = ctx;
  const s = state(ctx);
  const l = s.lineup!;
  const field = onField(l);
  const sidelined = new Set([...s.injuredIds, ...s.loanedIds]);
  const benchFit = l.bench.filter((p) => !sidelined.has(p));
  const fieldFit = field.filter((p) => !sidelined.has(p));
  ctx.elapsed = Math.min(QUARTER_MS, ctx.elapsed + 10_000 + r.int(60_000));
  const at = { quarter: ctx.quarter, elapsed_ms: ctx.elapsed };
  const choice = r.int(12);

  if (choice <= 2 && fieldFit.length && benchFit.length) {
    const off = r.pick(fieldFit);
    const on = r.pick(benchFit);
    const zone = zoneOf(l, off)!;
    ctx.trace.push(`swap ${off}→${on}`);
    add(ctx, "swap", { off_player_id: off, on_player_id: on, zone, ...at }, on);
  } else if (choice === 3 && fieldFit.length >= 2) {
    const a = r.pick(fieldFit);
    // A partner in another zone (none when everyone fit is in a's zone).
    const partners = fieldFit.filter((p) => zoneOf(l, p) !== zoneOf(l, a));
    if (!partners.length) return;
    const b = r.pick(partners);
    ctx.trace.push(`zoneSwap ${a}↔${b}`);
    add(ctx, "field_zone_swap", { player_a_id: a, zone_a: zoneOf(l, a), player_b_id: b, zone_b: zoneOf(l, b), ...at }, a);
  } else if (choice === 4 && fieldFit.length) {
    // Injury with a replacement (InjuryReplacementModal): injury + swap.
    const hurt = r.pick(fieldFit);
    const zone = zoneOf(l, hurt)!;
    if (benchFit.length) {
      const repl = r.pick(benchFit);
      ctx.trace.push(`injure ${hurt} (repl ${repl})`);
      pair(
        ctx,
        () => add(ctx, "injury", { injured: true, ...at }, hurt),
        () => add(ctx, "swap", { off_player_id: hurt, on_player_id: repl, zone, ...at }, repl),
      );
    } else {
      ctx.trace.push(`injure ${hurt}`);
      add(ctx, "injury", { injured: true, ...at }, hurt);
    }
  } else if (choice === 5 && [...field, ...l.bench].some((p) => !sidelined.has(p))) {
    const pid = r.pick([...field, ...l.bench].filter((p) => !sidelined.has(p)));
    ctx.trace.push(`lend ${pid}`);
    add(ctx, "player_loan", { loaned: true, ...at }, pid);
  } else if (choice === 6 && s.loanedIds.length) {
    const pid = r.pick(s.loanedIds);
    ctx.trace.push(`recall ${pid}`);
    add(ctx, "player_loan", { loaned: false, ...at }, pid);
  } else if (choice === 7 && s.injuredIds.length) {
    const pid = r.pick(s.injuredIds);
    ctx.trace.push(`recover ${pid}`);
    add(ctx, "injury", { injured: false, ...at }, pid);
  } else if (choice === 8 && ctx.reserve.length) {
    const pid = ctx.reserve.shift()!;
    ctx.present.push(pid);
    ctx.trace.push(`arrive ${pid}`);
    add(ctx, "player_arrived", { ...at }, pid);
  } else if (choice === 9) {
    const ours = r.chance(0.6);
    const pid = ours && field.length ? r.pick(field) : null;
    const type = ours ? (r.chance(0.5) ? "goal" : "behind") : "opponent_goal";
    ctx.trace.push(`${type}${pid ? ` ${pid}` : ""}`);
    add(ctx, type, { ...at }, pid);
    ctx.scores.push(ctx.log.events[ctx.log.events.length - 1].id);
  } else if (choice === 10 && ctx.scores.length) {
    const target = ctx.scores.pop()!;
    ctx.trace.push("undo");
    add(ctx, "score_undo", { target_event_id: target, quarter: ctx.quarter });
  }
}

// ── At a break (QuarterBreak) ────────────────────────────────────
function breakStep(ctx: Ctx) {
  const { r } = ctx;
  const s = state(ctx);
  const l = s.lineup!;
  const next = ctx.quarter + 1;
  const at = { quarter: next, elapsed_ms: 0 };
  const sidelined = new Set([...s.injuredIds, ...s.loanedIds]);
  const fit = [...onField(l), ...l.bench].filter((p) => !sidelined.has(p));
  const choice = r.int(6);
  if (choice === 0 && fit.length) {
    const pid = r.pick(fit);
    ctx.trace.push(`brk lend ${pid}`);
    add(ctx, "player_loan", { loaned: true, ...at }, pid);
  } else if (choice === 1 && s.loanedIds.length) {
    const pid = r.pick(s.loanedIds);
    ctx.trace.push(`brk recall ${pid}`);
    add(ctx, "player_loan", { loaned: false, ...at }, pid);
  } else if (choice === 2 && fit.length) {
    const pid = r.pick(fit);
    ctx.trace.push(`brk injure ${pid}`);
    add(ctx, "injury", { injured: true, ...at }, pid);
  } else if (choice === 3 && s.injuredIds.length) {
    const pid = r.pick(s.injuredIds);
    ctx.trace.push(`brk recover ${pid}`);
    add(ctx, "injury", { injured: false, ...at }, pid);
  } else if (choice === 4 && ctx.reserve.length) {
    const pid = ctx.reserve.shift()!;
    ctx.present.push(pid);
    ctx.trace.push(`brk arrive ${pid}`);
    add(ctx, "player_arrived", { ...at }, pid);
  }
}

/** Start the next quarter on the suggested lineup (sidelined kids on the bench). */
function startNext(ctx: Ctx) {
  const s = state(ctx);
  const l = s.lineup!;
  const sidelined = new Set([...s.injuredIds, ...s.loanedIds]);
  const inLineup = new Set([...onField(l), ...l.bench]);
  const here = ctx.present.filter((p) => inLineup.has(p) || !sidelined.has(p));
  const healthy = here.filter((p) => !sidelined.has(p)).map((id) => ({ id, full_name: id, jersey_number: null }) as never);
  const sugg = suggestStartingLineup(healthy, {}, ctx.r.int(1000), CAPS);
  const lineup: Lineup = { ...sugg, bench: [...sugg.bench, ...here.filter((p) => sidelined.has(p))] };
  ctx.quarter += 1;
  ctx.elapsed = 0;
  ctx.trace.push(`start Q${ctx.quarter}`);
  add(ctx, "lineup_set", { lineup });
  add(ctx, "quarter_start", { quarter: ctx.quarter });
}

function walk(mode: Ctx["mode"]) {
  return (r: Rng, trace: string[]) => {
    const squad = Array.from({ length: 17 }, (_, i) => `p${i + 1}`);
    const ctx: Ctx = {
      r,
      log: eventLog(),
      trace,
      present: squad.slice(0, 15),
      reserve: squad.slice(15),
      quarter: 0,
      elapsed: 0,
      elapsedByQuarter: {},
      scores: [],
      mode,
    };
    // Kickoff: 12 on (4/4/4), 3 on the bench.
    const p = ctx.present;
    ctx.log.add("lineup_set", {
      lineup: { back: p.slice(0, 4), hback: [], mid: p.slice(4, 8), hfwd: [], fwd: p.slice(8, 12), bench: p.slice(12) },
    });
    ctx.quarter = 1;
    ctx.log.add("quarter_start", { quarter: 1 });
    for (let q = 1; q <= 4; q++) {
      const steps = 4 + r.int(10);
      for (let i = 0; i < steps; i++) {
        playStep(ctx);
        checkAll(ctx, `Q${q} ${trace[trace.length - 1] ?? ""}`);
      }
      ctx.elapsedByQuarter[q] = ctx.elapsed;
      trace.push(`end Q${q}`);
      ctx.log.add("quarter_end", { quarter: q, elapsed_ms: ctx.elapsed });
      checkAll(ctx, `end Q${q}`);
      if (q === 4) break;
      const brk = r.int(4);
      for (let i = 0; i < brk; i++) {
        breakStep(ctx);
        checkAll(ctx, `break ${trace[trace.length - 1]}`);
      }
      startNext(ctx);
      checkAll(ctx, `start Q${q + 1}`);
    }
  };
}

describe("AFL sideline combos", () => {
  it("events landing in the order the coach acted: the lineup always makes sense", () => {
    runWalks(300, walk("ordered"));
  }, 120_000);
  it("queue lanes racing (an injury and its replacement swap in either order)", () => {
    runWalks(300, walk("racy"));
  }, 120_000);
});
