// Netball sideline combos: random walks over everything a coach does
// during a quarter and at the breaks, written as NetballLiveGame and
// NetballQuarterBreak write them. Mid-quarter changes live in the
// quarter's sub log (vacate, fill, move to an empty position) until the
// break writes them on period_break_swap (or full time on
// game_finalised). An independent model of the court, bench, injuries,
// loans and each kid's time per third is checked against
// lineupAfterSubs, replayNetballGame and playerThirdMs after every
// action. See harness.ts.

import { describe, it } from "vitest";
import {
  lineupAfterSubs,
  playerThirdMs,
  replayNetballGame,
  splitQuarterSegments,
  type GenericLineup,
  type QuarterSub,
  type ThirdLookup,
} from "@/lib/sports/netball/fairness";
import { primaryThirdFor } from "@/lib/sports/netball";
import { check, dupes, eventLog, runWalks, type Rng } from "./harness";

const PERIOD_S = 600;
const PERIOD_MS = PERIOD_S * 1000;
const POSITIONS = ["gs", "ga", "wa", "c", "wd", "gd", "gk"] as const;
type Third = "attack" | "centre" | "defence";
const lookup = primaryThirdFor as ThirdLookup;
const thirdOf = (pos: string): Third => {
  const t = primaryThirdFor(pos);
  return t === "attack-third" ? "attack" : t === "centre-third" ? "centre" : "defence";
};

interface Model {
  court: Record<string, string | null>;
  bench: Set<string>;
  injured: Set<string>;
  lent: Set<string>;
  present: string[];
  /**
   * Arrived during this quarter: on the live bench strip (held apart
   * from the quarter's lineup) until the break builds the next one.
   */
  arrived: Set<string>;
  /** Closed time per kid per third. */
  ms: Record<string, Record<Third, number>>;
  /** Open stints: kid → where and since when (quarter-local ms). */
  open: Record<string, { at: number; third: Third }>;
}

interface Ctx {
  r: Rng;
  log: ReturnType<typeof eventLog>;
  trace: string[];
  m: Model;
  reserve: string[];
  quarter: number;
  elapsed: number;
  startLineup: GenericLineup;
  subs: QuarterSub[];
  quarterOpen: boolean;
  /** Between the hooter and the next start: the break shows its own draft. */
  ended: boolean;
  finalised: boolean;
}

const zero = (): Record<Third, number> => ({ attack: 0, centre: 0, defence: 0 });
const onCourt = (m: Model) => POSITIONS.map((p) => m.court[p]).filter((p): p is string => p != null);
const posOf = (m: Model, pid: string) => POSITIONS.find((p) => m.court[p] === pid) ?? null;
const sidelined = (m: Model, pid: string) => m.injured.has(pid) || m.lent.has(pid);
const asLineup = (m: Model): GenericLineup => ({
  positions: Object.fromEntries(POSITIONS.map((p) => [p, m.court[p] ? [m.court[p]!] : []])),
  bench: Array.from(m.bench),
});

function stop(m: Model, pid: string, at: number) {
  const o = m.open[pid];
  if (!o) return;
  (m.ms[pid] ??= zero())[o.third] += Math.max(0, at - o.at);
  delete m.open[pid];
}
function start(m: Model, pid: string, pos: string, at: number) {
  m.open[pid] = { at, third: thirdOf(pos) };
}

function checkAll(ctx: Ctx, what: string) {
  const { m } = ctx;
  // The court the live screen draws: the quarter's start + its subs.
  const live = lineupAfterSubs(ctx.startLineup, ctx.subs);
  const court = Object.values(live.positions).flat();
  const everyone = [...court, ...live.bench];
  check(dupes(everyone).length === 0, `${what}: in two places: ${dupes(everyone).join(",")}`);
  for (const pos of POSITIONS) {
    const want = m.court[pos];
    const got = live.positions[pos] ?? [];
    check(
      want ? got.length === 1 && got[0] === want : got.length === 0,
      `${what}: ${pos} shows ${got.join("+") || "empty"}, should be ${want ?? "empty"}`,
    );
  }
  if (!ctx.ended) for (const pid of court) check(!sidelined(m, pid), `${what}: ${pid} is ${m.injured.has(pid) ? "injured" : "lent"} but on court`);
  for (const pid of m.present) {
    if (!sidelined(m, pid) && !m.arrived.has(pid)) check(everyone.includes(pid), `${what}: ${pid} vanished`);
  }
  // Time per third, as the app shows it.
  const inProgress = ctx.quarterOpen && !ctx.finalised
    ? { segments: splitQuarterSegments(ctx.startLineup, ctx.elapsed, ctx.subs) }
    : undefined;
  const shown = playerThirdMs(ctx.log.events, null, PERIOD_S, lookup, inProgress);
  for (const pid of m.present) {
    const want = { ...(m.ms[pid] ?? zero()) };
    const o = m.open[pid];
    if (o) want[o.third] += Math.max(0, ctx.elapsed - o.at);
    const got = shown.get(pid) ?? { attack: 0, centre: 0, defence: 0 };
    for (const t of ["attack", "centre", "defence"] as const) {
      check(Math.abs(got[t] - want[t]) <= 1, `${what}: ${pid} ${t} ${got[t]}ms, should be ${want[t]}ms`);
    }
  }
}

function vacate(ctx: Ctx, pid: string) {
  const { m } = ctx;
  const pos = posOf(m, pid)!;
  ctx.subs.push({ positionId: pos, outPlayerId: pid, inPlayerId: null, atMs: ctx.elapsed });
  m.court[pos] = null;
  m.bench.add(pid);
  stop(m, pid, ctx.elapsed);
  return pos;
}
function fill(ctx: Ctx, pos: string, pid: string) {
  const { m } = ctx;
  ctx.subs.push({ positionId: pos, outPlayerId: null, inPlayerId: pid, atMs: ctx.elapsed });
  m.court[pos] = pid;
  m.bench.delete(pid);
  start(m, pid, pos, ctx.elapsed);
}

function playStep(ctx: Ctx) {
  const { r, m } = ctx;
  ctx.elapsed = Math.min(PERIOD_MS, ctx.elapsed + 5_000 + r.int(60_000));
  const at = { quarter: ctx.quarter, elapsed_ms: ctx.elapsed, sport: "netball" };
  const add = ctx.log.add;
  const courtFit = onCourt(m).filter((p) => !sidelined(m, p));
  const benchFit = Array.from(m.bench).filter((p) => !sidelined(m, p));
  const empty = POSITIONS.filter((p) => m.court[p] == null);
  const choice = r.int(10);

  if ((choice === 0 || choice === 1) && courtFit.length) {
    // Injure or lend a court kid: vacated now; the replacement picker
    // may be used, or cancelled (the position stays empty).
    const pid = r.pick(courtFit);
    const lend = choice === 1;
    ctx.trace.push(`${lend ? "lend" : "injure"} ${pid}`);
    if (lend) add("player_loan", { loaned: true, ...at }, pid);
    else add("injury", { injured: true, ...at }, pid);
    (lend ? m.lent : m.injured).add(pid);
    const pos = vacate(ctx, pid);
    if (benchFit.length && r.chance(0.7)) {
      if (r.chance(0.5)) ctx.elapsed = Math.min(PERIOD_MS, ctx.elapsed + r.int(5_000));
      const repl = r.pick(benchFit);
      ctx.trace.push(`  ${repl} on at ${pos}`);
      fill(ctx, pos, repl);
    }
  } else if (choice === 2) {
    // Injure or lend a bench kid: a flag only.
    const pick = Array.from(m.bench).filter((p) => !sidelined(m, p));
    if (!pick.length) return;
    const pid = r.pick(pick);
    const lend = r.chance(0.5);
    ctx.trace.push(`${lend ? "lend" : "injure"} bench ${pid}`);
    if (lend) add("player_loan", { loaned: true, ...at }, pid);
    else add("injury", { injured: true, ...at }, pid);
    (lend ? m.lent : m.injured).add(pid);
  } else if (choice === 3 && empty.length && benchFit.length) {
    // Tap an empty position and fill it.
    const pos = r.pick(empty);
    const pid = r.pick(benchFit);
    ctx.trace.push(`fill ${pos} with ${pid}`);
    fill(ctx, pos, pid);
  } else if (choice === 4 && empty.length && courtFit.length) {
    // Move a court kid to an empty position: a vacate + fill pair.
    const pid = r.pick(courtFit);
    const to = r.pick(empty);
    ctx.trace.push(`move ${pid} to ${to}`);
    vacate(ctx, pid);
    fill(ctx, to, pid);
  } else if (choice === 5 && (m.injured.size || m.lent.size)) {
    // Recover or recall: back on the bench (they were vacated).
    const pid = r.pick([...Array.from(m.injured), ...Array.from(m.lent)]);
    const wasLent = m.lent.has(pid);
    ctx.trace.push(`${wasLent ? "recall" : "recover"} ${pid}`);
    if (wasLent) add("player_loan", { loaned: false, ...at }, pid);
    else add("injury", { injured: false, ...at }, pid);
    (wasLent ? m.lent : m.injured).delete(pid);
  } else if (choice === 6 && ctx.reserve.length) {
    const pid = ctx.reserve.shift()!;
    ctx.trace.push(`arrive ${pid}`);
    add("player_arrived", { ...at }, pid);
    m.present.push(pid);
    m.arrived.add(pid);
  } else if (choice === 7 && courtFit.length) {
    ctx.trace.push("goal");
    add("goal", { ...at }, r.pick(courtFit));
  }
  // Otherwise the clock just ran.
}

function breakStep(ctx: Ctx) {
  const { r, m } = ctx;
  // NetballQuarterBreak stamps these from the start of the next quarter.
  const at = { quarter: ctx.quarter + 1, elapsed_ms: 0, sport: "netball" };
  const add = ctx.log.add;
  const fit = [...onCourt(m), ...Array.from(m.bench)].filter((p) => !sidelined(m, p));
  const choice = r.int(4);
  if (choice === 0 && (m.injured.size || m.lent.size)) {
    const pid = r.pick([...Array.from(m.injured), ...Array.from(m.lent)]);
    const wasLent = m.lent.has(pid);
    ctx.trace.push(`brk ${wasLent ? "recall" : "recover"} ${pid}`);
    if (wasLent) add("player_loan", { loaned: false, ...at }, pid);
    else add("injury", { injured: false, ...at }, pid);
    (wasLent ? m.lent : m.injured).delete(pid);
  } else if (choice === 1 && fit.length) {
    const pid = r.pick(fit);
    const lend = r.chance(0.5);
    ctx.trace.push(`brk ${lend ? "lend" : "injure"} ${pid}`);
    if (lend) add("player_loan", { loaned: true, ...at }, pid);
    else add("injury", { injured: true, ...at }, pid);
    (lend ? m.lent : m.injured).add(pid);
  } else if (choice === 2 && ctx.reserve.length) {
    const pid = ctx.reserve.shift()!;
    ctx.trace.push(`brk arrive ${pid}`);
    add("player_arrived", { ...at }, pid);
    m.present.push(pid);
    m.arrived.add(pid);
  }
}

/**
 * The coach's next-quarter lineup: nobody sidelined on court (the Start
 * check), every position filled while there are fit kids, and some
 * shuffling with the bench. Then period_break_swap carries the ended
 * quarter's subs, and the quarter starts.
 */
function startNext(ctx: Ctx) {
  const { r, m } = ctx;
  // Arrivals join the bench the break offers.
  m.arrived.forEach((pid) => m.bench.add(pid));
  m.arrived.clear();
  for (const pos of POSITIONS) {
    const pid = m.court[pos];
    if (pid && sidelined(m, pid)) {
      m.court[pos] = null;
      m.bench.add(pid);
    }
  }
  for (let i = r.int(4); i > 0; i--) {
    const benchFit = Array.from(m.bench).filter((p) => !sidelined(m, p));
    const pos = r.pick(POSITIONS);
    if (!benchFit.length) break;
    const on = r.pick(benchFit);
    const off = m.court[pos];
    m.court[pos] = on;
    m.bench.delete(on);
    if (off) m.bench.add(off);
  }
  for (const pos of POSITIONS) {
    const benchFit = Array.from(m.bench).filter((p) => !sidelined(m, p));
    if (m.court[pos] == null && benchFit.length) {
      const pid = r.pick(benchFit);
      m.court[pos] = pid;
      m.bench.delete(pid);
    }
  }
  const lineup = asLineup(m);
  ctx.quarter += 1;
  ctx.trace.push(`start Q${ctx.quarter}`);
  if (ctx.quarter === 1) ctx.log.add("lineup_set", { lineup, sport: "netball" });
  else ctx.log.add("period_break_swap", { quarter: ctx.quarter, lineup, midQuarterSubs: ctx.subs, sport: "netball" });
  ctx.log.add("quarter_start", { quarter: ctx.quarter, sport: "netball" });
  ctx.startLineup = lineup;
  ctx.subs = [];
  ctx.elapsed = 0;
  ctx.quarterOpen = true;
  ctx.ended = false;
  for (const pos of POSITIONS) if (m.court[pos]) start(m, m.court[pos]!, pos, 0);
}

function endQuarter(ctx: Ctx) {
  const { m } = ctx;
  ctx.trace.push(`end Q${ctx.quarter}`);
  // The hooter (or "end early", which also credits the full quarter).
  ctx.elapsed = PERIOD_MS;
  ctx.ended = true;
  ctx.log.add("quarter_end", { quarter: ctx.quarter, elapsed_ms: PERIOD_MS, sport: "netball" });
  for (const pid of Object.keys(m.open)) stop(m, pid, PERIOD_MS);
}

function walk(r: Rng, trace: string[]) {
  const squad = Array.from({ length: 12 }, (_, i) => `p${i + 1}`);
  const present = squad.slice(0, 10);
  const m: Model = {
    court: Object.fromEntries(POSITIONS.map((p, i) => [p, present[i]])),
    bench: new Set(present.slice(POSITIONS.length)),
    injured: new Set(),
    lent: new Set(),
    present,
    arrived: new Set(),
    ms: {},
    open: {},
  };
  const ctx: Ctx = {
    r, log: eventLog(), trace, m, reserve: squad.slice(10), quarter: 0, elapsed: 0,
    startLineup: asLineup(m), subs: [], quarterOpen: false, ended: false, finalised: false,
  };
  startNext(ctx);
  for (let q = 1; q <= 4; q++) {
    for (let i = 4 + r.int(12); i > 0; i--) {
      playStep(ctx);
      checkAll(ctx, `Q${q} ${trace[trace.length - 1]}`);
    }
    endQuarter(ctx);
    checkAll(ctx, `end Q${q}`);
    if (q === 4) break;
    for (let i = r.int(4); i > 0; i--) {
      breakStep(ctx);
      checkAll(ctx, `break ${trace[trace.length - 1]}`);
    }
    startNext(ctx);
    const s = replayNetballGame(ctx.log.events);
    check(
      JSON.stringify(s.lineup) === JSON.stringify(ctx.startLineup),
      `start Q${ctx.quarter}: the replay's lineup isn't the one the coach started`,
    );
    checkAll(ctx, `start Q${ctx.quarter}`);
  }
  // Full time: finalise carries Q4's subs.
  ctx.log.add("game_finalised", { quarter: 4, elapsed_ms: PERIOD_MS, sport: "netball", midQuarterSubs: ctx.subs });
  ctx.finalised = true;
  ctx.quarterOpen = false;
  checkAll(ctx, "full time");
}

describe("netball sideline combos", () => {
  it("random games keep the court, the bench and every kid's time right", () => {
    runWalks(500, walk);
  }, 120_000);
});
