// How we played (UX plan 4.4): a finished game against the rules it was
// played under — "Rules kept" or which were missed — and whether season
// balance improved, for the game summary. Sport-agnostic: callers pass
// each player's time per period per line (AFL lines, netball thirds,
// league forwards / backs).

import type { RuleInstance } from "@/lib/playbook/rules";
import type { RuleCheckItem } from "@/lib/playbook/ruleCheck";
import { periodsOwed } from "@/lib/playbook/seasonBalance";
import type { UnitTime } from "@/lib/playbook/seasonTime";

export interface GameReportInput {
  /** ms per player → period (1-based) → line. */
  byPeriod: Record<string, Record<number, Record<string, number>>>;
  /** Everyone who was at the game, including kids who never got on. */
  present?: string[];
  lines: string[];
  lineLabel: (key: string) => string;
  lineWord: string;
  periodLabel: (n: number) => string;
  periodCount: number;
  periodMs: number;
  /** How long each period actually ran (its quarter_end), when known. */
  periodPlayedMs?: Record<number, number>;
  minGameTimePct: number;
  rules: RuleInstance[];
  name: (playerId: string) => string;
  homeLine?: Record<string, string | null>;
  /** Season balance: time per unit before and after this game. */
  season?: { before: UnitTime; after: UnitTime; units: string[] };
}

export interface GameReport {
  items: RuleCheckItem[];
  /** "Season balance: improved for 8 kids", or null when it's off. */
  seasonLine: string | null;
}

const joinNames = (names: string[]) =>
  names.length <= 2 ? names.join(" and ") : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;

export function gameReport(input: GameReportInput): GameReport {
  const items: RuleCheckItem[] = [];
  const players = Array.from(new Set([...(input.present ?? []), ...Object.keys(input.byPeriod)]));
  // A game cut short is judged on the periods it reached.
  let periodsPlayed = 0;
  for (const periods of Object.values(input.byPeriod)) {
    for (const [p, byLine] of Object.entries(periods)) {
      if (Object.values(byLine).some((ms) => ms > 0)) periodsPlayed = Math.max(periodsPlayed, Number(p));
    }
  }
  periodsPlayed = Math.min(input.periodCount, periodsPlayed);
  const total = (pid: string) =>
    Object.values(input.byPeriod[pid] ?? {}).reduce(
      (s, byLine) => s + Object.values(byLine).reduce((a, b) => a + b, 0),
      0,
    );
  const linesPlayed = (pid: string) => {
    const set = new Set<string>();
    for (const byLine of Object.values(input.byPeriod[pid] ?? {})) {
      for (const [line, ms] of Object.entries(byLine)) if (ms > 0) set.add(line);
    }
    return set;
  };
  const onIn = (pid: string, period: number) =>
    Object.values(input.byPeriod[pid]?.[period] ?? {}).some((ms) => ms > 0);
  const sev = (r: RuleInstance) => (r.strength === "must" ? "fail" : "warn");

  // The time actually played: a quarter ended early is judged on its
  // own length (Stagehand round 2 flagged a kid who played exactly half).
  let gameMs = 0;
  for (let p = 1; p <= periodsPlayed; p++) {
    const ran = input.periodPlayedMs?.[p];
    gameMs += ran && ran > 0 ? ran : input.periodMs;
  }
  const short = players.filter((pid) => gameMs > 0 && total(pid) / gameMs < input.minGameTimePct / 100);
  items.push(
    short.length === 0
      ? { id: "min-game-time", status: "ok", text: `Everyone played at least ${input.minGameTimePct}%` }
      : {
          id: "min-game-time",
          status: "fail",
          text: `${joinNames(short.map(input.name))} played under ${input.minGameTimePct}%`,
        },
  );

  for (const rule of input.rules) {
    const ids = rule.params.playerIds ?? [];
    switch (rule.kind) {
      case "every-line-per-game":
      case "distinct-lines": {
        const need = rule.kind === "every-line-per-game" ? input.lines.length : (rule.params.count ?? 2);
        const missed = players.filter((pid) => linesPlayed(pid).size < need);
        items.push(
          missed.length
            ? { id: rule.id, status: sev(rule), text: `${joinNames(missed.map(input.name))} didn't get ${rule.kind === "every-line-per-game" ? `every ${input.lineWord}` : `${need} ${input.lineWord}s`}` }
            : { id: rule.id, status: "ok", text: rule.kind === "every-line-per-game" ? `Everyone played every ${input.lineWord}` : `Everyone played ${need} ${input.lineWord}s` },
        );
        break;
      }
      case "max-bench-in-row": {
        const run = Math.max(2, rule.params.count ?? 2);
        const sat = players.filter((pid) => {
          const periods = Array.from({ length: periodsPlayed }, (_, i) => i + 1);
          // Kids who never got on sat out every period.
          const first = periods.find((p) => onIn(pid, p)) ?? 0;
          let streak = 0;
          for (const p of periods.filter((x) => x > first)) {
            streak = onIn(pid, p) ? 0 : streak + 1;
            if (streak >= run) return true;
          }
          return false;
        });
        items.push(
          sat.length
            ? { id: rule.id, status: sev(rule), text: `${joinNames(sat.map(input.name))} sat out ${run} in a row` }
            : { id: rule.id, status: "ok", text: `Nobody sat out ${run} in a row` },
        );
        break;
      }
      case "keep-apart": {
        let clash: string | null = null;
        for (let p = 1; p <= periodsPlayed && !clash; p++) {
          for (const line of input.lines) {
            const here = ids.filter((pid) => (input.byPeriod[pid]?.[p]?.[line] ?? 0) > 0);
            if (here.length > 1) {
              clash = `${joinNames(here.map(input.name))} shared ${input.lineLabel(line)} in ${input.periodLabel(p)}`;
              break;
            }
          }
        }
        items.push(clash ? { id: rule.id, status: sev(rule), text: clash } : { id: rule.id, status: "ok", text: `${joinNames(ids.map(input.name))} kept apart` });
        break;
      }
      case "stays-home": {
        const away = ids.filter((pid) => {
          const home = input.homeLine?.[pid];
          if (!home) return false;
          return Array.from(linesPlayed(pid)).some((l) => l !== home);
        });
        items.push(
          away.length
            ? { id: rule.id, status: sev(rule), text: `${joinNames(away.map(input.name))} played away from home` }
            : { id: rule.id, status: "ok", text: `${joinNames(ids.map(input.name))} stayed home` },
        );
        break;
      }
      default:
        break;
    }
  }

  let seasonLine: string | null = null;
  if (input.season) {
    const gap = (time: UnitTime, pid: string) =>
      Object.values(periodsOwed({ byUnit: time[pid], units: input.season!.units, periodMs: input.periodMs })).reduce(
        (s, o) => s + Math.abs(o),
        0,
      );
    // Only kids with a season before this game can have improved; on a
    // team's first game there's nothing to say.
    const withHistory = players.filter((pid) =>
      Object.values(input.season!.before[pid] ?? {}).some((ms) => ms > 0),
    );
    if (withHistory.length > 0) {
      const improved = withHistory.filter(
        (pid) => gap(input.season!.after, pid) < gap(input.season!.before, pid) - 1e-9,
      );
      seasonLine = `Season balance: improved for ${improved.length} ${improved.length === 1 ? "kid" : "kids"}`;
    }
  }
  return { items, seasonLine };
}
