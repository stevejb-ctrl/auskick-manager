// Rugby league sideline combos: random walks over everything a coach does
// during a period and at the breaks, written as LeagueLiveGame writes
// them. An independent model of the field, bench, injuries and loans
// (and each kid's time) is checked against replayLeagueGame and
// playerMsOnField after every event. See harness.ts.

import { describe, it } from "vitest";
import { playerMsOnField, replayLeagueGame } from "@/lib/sports/rugby_league/fairness";
import { benchSidelinedInLeagueLineup } from "@/lib/live/lineupOps";
import { check, dupes, eventLog, runWalks, type Rng } from "./harness";

const PERIOD_MS = 20 * 60_000;
const ON_FIELD = 11;

/** What the coach should see, kept independently of the replay. */
interface Model {
  forwards: Set<string>;
  backs: Set<string>;
  bench: Set<string>;
  injured: Set<string>;
  lent: Set<string>;
  present: string[];
  /** ms per kid, closed stints. */
  ms: Record<string, number>;
  /** open stint starts (within the period) for kids accruing now. */
  open: Record<string, number>;
  active: boolean;
}

const onField = (m: Model) => [...Array.from(m.forwards), ...Array.from(m.backs)];
const accrues = (m: Model, pid: string) => m.active && (m.forwards.has(pid) || m.backs.has(pid)) && !m.injured.has(pid) && !m.lent.has(pid);

function stop(m: Model, pid: string, at: number) {
  if (m.open[pid] === undefined) return;
  m.ms[pid] = (m.ms[pid] ?? 0) + Math.max(0, at - m.open[pid]);
  delete m.open[pid];
}
function startIfAccruing(m: Model, pid: string, at: number) {
  if (accrues(m, pid) && m.open[pid] === undefined) m.open[pid] = at;
}
/** After any change, stints follow who should be accruing. */
function settle(m: Model, at: number) {
  for (const pid of Object.keys(m.open)) if (!accrues(m, pid)) stop(m, pid, at);
  for (const pid of onField(m)) startIfAccruing(m, pid, at);
}

interface Ctx {
  r: Rng;
  log: ReturnType<typeof eventLog>;
  trace: string[];
  m: Model;
  reserve: string[];
  quarter: number;
  elapsed: number;
}

function checkAll(ctx: Ctx, what: string) {
  const { m } = ctx;
  const s = replayLeagueGame(ctx.log.events);
  const l = s.lineup!;
  const everyone = [...l.forwards, ...l.backs, ...l.bench];
  check(dupes(everyone).length === 0, `${what}: in two places: ${dupes(everyone).join(",")}`);
  for (const pid of m.present) check(everyone.includes(pid), `${what}: ${pid} vanished from the lineup`);
  // Field and bench as the model says (zones may differ: league moves kids between them).
  const field = new Set([...l.forwards, ...l.backs]);
  for (const pid of m.present) {
    const want = m.forwards.has(pid) || m.backs.has(pid);
    check(field.has(pid) === want, `${what}: ${pid} ${want ? "should be on the field" : "should be off the field"}`);
  }
  for (const pid of Array.from(m.lent)) check(!field.has(pid), `${what}: ${pid} is lent but on the field`);
  // Time: what the app shows for each kid.
  const live = playerMsOnField(ctx.log.events, ctx.quarter, ctx.elapsed);
  for (const pid of m.present) {
    const want = (m.ms[pid] ?? 0) + (m.open[pid] !== undefined ? Math.max(0, ctx.elapsed - m.open[pid]) : 0);
    const got = live[pid] ?? 0;
    check(Math.abs(got - want) <= 1, `${what}: ${pid} shows ${got}ms played, should be ${want}ms`);
  }
}

function playStep(ctx: Ctx) {
  const { r, m } = ctx;
  ctx.elapsed = Math.min(PERIOD_MS, ctx.elapsed + 10_000 + r.int(90_000));
  const at = { quarter: ctx.quarter, elapsed_ms: ctx.elapsed, sport: "rugby_league" };
  const t = ctx.elapsed;
  const sidelined = (p: string) => m.injured.has(p) || m.lent.has(p);
  const field = onField(m);
  const fieldFit = field.filter((p) => !sidelined(p));
  const benchFit = [...Array.from(m.bench)].filter((p) => !sidelined(p));
  const add = ctx.log.add;
  const choice = r.int(11);

  if (choice <= 2 && fieldFit.length && benchFit.length) {
    // Rolling sub: on takes the off kid's zone.
    const off = r.pick(fieldFit);
    const on = r.pick(benchFit);
    ctx.trace.push(`sub ${off}→${on}`);
    add("swap", { off_player_id: off, on_player_id: on, ...at }, on);
    const zone = m.forwards.has(off) ? m.forwards : m.backs;
    zone.delete(off);
    zone.add(on);
    m.bench.delete(on);
    m.bench.add(off);
  } else if (choice === 3 && fieldFit.length) {
    // Injury, with a replacement when there's one (injury + swap).
    const hurt = r.pick(fieldFit);
    const repl = benchFit.length && r.chance(0.7) ? r.pick(benchFit) : null;
    ctx.trace.push(`injure ${hurt}${repl ? ` (repl ${repl})` : ""}`);
    add("injury", { injured: true, ...at }, hurt);
    m.injured.add(hurt);
    if (repl) {
      add("swap", { off_player_id: hurt, on_player_id: repl, ...at }, repl);
      const zone = m.forwards.has(hurt) ? m.forwards : m.backs;
      zone.delete(hurt);
      zone.add(repl);
      m.bench.delete(repl);
      m.bench.add(hurt);
    }
  } else if (choice === 4 && m.injured.size) {
    const pid = r.pick([...Array.from(m.injured)]);
    ctx.trace.push(`recover ${pid}`);
    add("injury", { injured: false, ...at }, pid);
    m.injured.delete(pid);
  } else if (choice === 5 && [...field, ...Array.from(m.bench)].some((p) => !sidelined(p))) {
    // Lend: benched, no replacement prompt.
    const pid = r.pick([...field, ...Array.from(m.bench)].filter((p) => !sidelined(p)));
    ctx.trace.push(`lend ${pid}`);
    add("player_loan", { loaned: true, ...at }, pid);
    m.lent.add(pid);
    m.forwards.delete(pid);
    m.backs.delete(pid);
    m.bench.add(pid);
  } else if (choice === 6 && m.lent.size) {
    const pid = r.pick([...Array.from(m.lent)]);
    ctx.trace.push(`recall ${pid}`);
    add("player_loan", { loaned: false, ...at }, pid);
    m.lent.delete(pid);
  } else if (choice === 7 && ctx.reserve.length) {
    const pid = ctx.reserve.shift()!;
    ctx.trace.push(`arrive ${pid}`);
    add("player_arrived", { ...at }, pid);
    m.present.push(pid);
    m.bench.add(pid);
  } else if (choice === 8 && fieldFit.length) {
    // Move a kid between forwards and backs.
    const pid = r.pick(fieldFit);
    const toBack = m.forwards.has(pid);
    ctx.trace.push(`move ${pid} to ${toBack ? "backs" : "forwards"}`);
    add("league_position_change", { to_zone: toBack ? "back" : "forward", ...at }, pid);
    (toBack ? m.forwards : m.backs).delete(pid);
    (toBack ? m.backs : m.forwards).add(pid);
  } else if (choice === 9 && field.length < ON_FIELD && benchFit.length) {
    // Fill an empty spot (short after a lend or roster change): a
    // mid-period lineup_set, as LeagueLiveGame writes it.
    const pid = r.pick(benchFit);
    ctx.trace.push(`fill ${pid}`);
    m.bench.delete(pid);
    m.backs.add(pid);
    add("lineup_set", { lineup: { forwards: [...Array.from(m.forwards)], backs: [...Array.from(m.backs)], bench: [...Array.from(m.bench)] }, ...at });
  } else if (choice === 10) {
    ctx.trace.push("try");
    add("try", { ...at }, field.length ? r.pick(field) : null);
  }
  settle(m, t);
}

function breakStep(ctx: Ctx) {
  const { r, m } = ctx;
  // LeagueLiveGame stamps break events with the period just ended.
  const at = { quarter: ctx.quarter, elapsed_ms: ctx.elapsed, sport: "rugby_league" };
  const add = ctx.log.add;
  const sidelined = (p: string) => m.injured.has(p) || m.lent.has(p);
  const fit = [...onField(m), ...Array.from(m.bench)].filter((p) => !sidelined(p));
  const choice = r.int(5);
  if (choice === 0 && m.lent.size) {
    const pid = r.pick([...Array.from(m.lent)]);
    ctx.trace.push(`brk recall ${pid}`);
    add("player_loan", { loaned: false, ...at }, pid);
    m.lent.delete(pid);
  } else if (choice === 1 && m.injured.size) {
    const pid = r.pick([...Array.from(m.injured)]);
    ctx.trace.push(`brk recover ${pid}`);
    add("injury", { injured: false, ...at }, pid);
    m.injured.delete(pid);
  } else if (choice === 2 && fit.length) {
    const pid = r.pick(fit);
    ctx.trace.push(`brk injure ${pid}`);
    add("injury", { injured: true, ...at }, pid);
    m.injured.add(pid);
  } else if (choice === 3 && ctx.reserve.length) {
    const pid = ctx.reserve.shift()!;
    ctx.trace.push(`brk arrive ${pid}`);
    add("player_arrived", { quarter: ctx.quarter + 1, elapsed_ms: 0, sport: "rugby_league" }, pid);
    m.present.push(pid);
    m.bench.add(pid);
  } else if (choice === 4 && fit.length) {
    const pid = r.pick(fit);
    ctx.trace.push(`brk lend ${pid}`);
    add("player_loan", { loaned: true, ...at }, pid);
    m.lent.add(pid);
    m.forwards.delete(pid);
    m.backs.delete(pid);
    m.bench.add(pid);
  }
}

/** Start the next period as LeagueLiveGame does: bench the sidelined, then start. */
function startNext(ctx: Ctx) {
  const { m } = ctx;
  const s = replayLeagueGame(ctx.log.events);
  const sidelined = new Set([...Array.from(m.injured), ...Array.from(m.lent)]);
  const benched = benchSidelinedInLeagueLineup(s.lineup!, sidelined);
  if (benched !== s.lineup) {
    ctx.log.add("lineup_set", { lineup: { forwards: benched.forwards, backs: benched.backs, bench: benched.bench }, sport: "rugby_league" });
  }
  for (const pid of Array.from(sidelined)) {
    m.forwards.delete(pid);
    m.backs.delete(pid);
    if (m.present.includes(pid)) m.bench.add(pid);
  }
  ctx.quarter += 1;
  ctx.elapsed = 0;
  ctx.trace.push(`start P${ctx.quarter}`);
  ctx.log.add("quarter_start", { quarter: ctx.quarter, sport: "rugby_league" });
  m.active = true;
  settle(m, 0);
}

function walk(r: Rng, trace: string[]) {
  const squad = Array.from({ length: 16 }, (_, i) => `p${i + 1}`);
  const present = squad.slice(0, 14);
  const m: Model = {
    forwards: new Set(present.slice(0, 5)),
    backs: new Set(present.slice(5, ON_FIELD)),
    bench: new Set(present.slice(ON_FIELD)),
    injured: new Set(),
    lent: new Set(),
    present,
    ms: {},
    open: {},
    active: false,
  };
  const ctx: Ctx = { r, log: eventLog(), trace, m, reserve: squad.slice(14), quarter: 0, elapsed: 0 };
  ctx.log.add("lineup_set", { lineup: { forwards: [...Array.from(m.forwards)], backs: [...Array.from(m.backs)], bench: [...Array.from(m.bench)] }, sport: "rugby_league" });
  startNext(ctx);
  for (let period = 1; period <= 2; period++) {
    const steps = 6 + r.int(14);
    for (let i = 0; i < steps; i++) {
      playStep(ctx);
      checkAll(ctx, `P${period} ${trace[trace.length - 1]}`);
    }
    trace.push(`end P${period}`);
    ctx.log.add("quarter_end", { quarter: period, elapsed_ms: ctx.elapsed, sport: "rugby_league" });
    for (const pid of Object.keys(m.open)) stop(m, pid, ctx.elapsed);
    m.active = false;
    checkAll(ctx, `end P${period}`);
    if (period === 2) break;
    const brk = r.int(4);
    for (let i = 0; i < brk; i++) {
      breakStep(ctx);
      checkAll(ctx, `break ${trace[trace.length - 1]}`);
    }
    startNext(ctx);
    checkAll(ctx, `start P${period + 1}`);
  }
}

describe("league sideline combos", () => {
  it("the field, bench and every kid's time stay right through any mix of actions", () => {
    runWalks(400, walk);
  }, 120_000);
});
