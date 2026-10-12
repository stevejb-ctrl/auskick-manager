// Rule check (UX plan §7.6 RuleCheckBar, chunk 4.3): how a proposed
// lineup for the next period stands against the team's rules, the
// game-time floor and season balance — in plain lines a coach can act
// on ("Ava would sit out twice in a row", "Mia hasn't played defence
// this season"). Sport-agnostic: callers map their lineup onto lines
// (AFL lines, netball thirds, league forwards/backs).

import type { RuleInstance } from "@/lib/playbook/rules";
import { biggestSeasonGaps } from "@/lib/playbook/seasonBalance";
import type { UnitTime } from "@/lib/playbook/seasonTime";

export type CheckStatus = "ok" | "warn" | "fail";

export interface RuleCheckItem {
  id: string;
  status: CheckStatus;
  text: string;
}

export interface RuleCheckInput {
  /** Next period's lineup: on-field player → line key; plus the bench. */
  onField: Record<string, string>;
  bench: string[];
  /** Line keys and how to say them ("back" → "Back"). */
  lines: string[];
  lineLabel: (key: string) => string;
  name: (playerId: string) => string;
  /** ms each player has played this game, per line (before this period). */
  playedThisGame: Record<string, Record<string, number>>;
  /** Players who sat out the whole of the last period. */
  benchedLastPeriod: string[];
  /** The period about to start (1-based) and how many there are. */
  period: number;
  periodCount: number;
  periodMs: number;
  periodWord: string;
  /** "line" (AFL, league) or "third" (netball). */
  lineWord: string;
  minGameTimePct: number;
  rules: RuleInstance[];
  /** Home line per player, for "stays at home". */
  homeLine?: Record<string, string | null>;
  /** Season balance: season time per player per unit, and its units. */
  season?: { time: UnitTime; units: string[]; unitLabel: (key: string) => string };
}

const joinNames = (names: string[]) =>
  names.length <= 2 ? names.join(" and ") : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;

export function checkRules(input: RuleCheckInput): RuleCheckItem[] {
  const items: RuleCheckItem[] = [];
  const squad = [...Object.keys(input.onField), ...input.bench];
  const remainingAfter = input.periodCount - input.period;
  const played = (pid: string) =>
    Object.values(input.playedThisGame[pid] ?? {}).reduce((a, b) => a + b, 0);
  const playedLines = (pid: string) => {
    const set = new Set(
      Object.entries(input.playedThisGame[pid] ?? {})
        .filter(([, ms]) => ms > 0)
        .map(([k]) => k),
    );
    if (input.onField[pid]) set.add(input.onField[pid]);
    return set;
  };
  const sev = (rule: RuleInstance): CheckStatus => (rule.strength === "must" ? "fail" : "warn");

  // Game-time floor: can everyone still reach it?
  const gameMs = input.periodCount * input.periodMs;
  const short = squad.filter((pid) => {
    const best = played(pid) + (input.onField[pid] ? input.periodMs : 0) + remainingAfter * input.periodMs;
    return gameMs > 0 && best / gameMs < input.minGameTimePct / 100;
  });
  items.push(
    short.length === 0
      ? { id: "min-game-time", status: "ok", text: `Everyone can play at least ${input.minGameTimePct}%` }
      : {
          id: "min-game-time",
          status: "fail",
          text: `${joinNames(short.map(input.name))} can't reach ${input.minGameTimePct}% now`,
        },
  );

  for (const rule of input.rules) {
    const ids = rule.params.playerIds ?? [];
    switch (rule.kind) {
      case "every-line-per-game":
      case "distinct-lines": {
        const need = rule.kind === "every-line-per-game" ? input.lines.length : (rule.params.count ?? 2);
        // Behind if they can't make up the missing lines in the periods left.
        const behind = squad.filter((pid) => need - playedLines(pid).size > remainingAfter);
        const missing = squad.filter((pid) => playedLines(pid).size < need);
        if (behind.length > 0) {
          items.push({
            id: rule.id,
            status: sev(rule),
            text: `${joinNames(behind.map(input.name))} won't get to ${rule.kind === "every-line-per-game" ? `every ${input.lineWord}` : `${need} ${input.lineWord}s`} this game`,
          });
        } else if (missing.length > 0 && remainingAfter === 0) {
          items.push({ id: rule.id, status: sev(rule), text: `${joinNames(missing.map(input.name))} missed a ${input.lineWord} this game` });
        } else {
          items.push({
            id: rule.id,
            status: "ok",
            text: rule.kind === "every-line-per-game" ? `Everyone gets every ${input.lineWord}` : `Everyone gets ${need} ${input.lineWord}s`,
          });
        }
        break;
      }
      case "keep-apart": {
        const byLine = new Map<string, string[]>();
        for (const pid of ids) {
          const line = input.onField[pid];
          if (line) byLine.set(line, [...(byLine.get(line) ?? []), pid]);
        }
        const clash = Array.from(byLine.entries()).find(([, p]) => p.length > 1);
        items.push(
          clash
            ? {
                id: rule.id,
                status: sev(rule),
                text: `${joinNames(clash[1].map(input.name))} are both in ${input.lineLabel(clash[0])}`,
              }
            : { id: rule.id, status: "ok", text: `${joinNames(ids.map(input.name))} kept apart` },
        );
        break;
      }
      case "keep-together": {
        const lines = new Set(ids.map((pid) => input.onField[pid]).filter(Boolean));
        items.push(
          lines.size > 1
            ? { id: rule.id, status: sev(rule), text: `${joinNames(ids.map(input.name))} are split up` }
            : { id: rule.id, status: "ok", text: `${joinNames(ids.map(input.name))} together` },
        );
        break;
      }
      case "max-bench-in-row": {
        const again = input.bench.filter((pid) => input.benchedLastPeriod.includes(pid));
        items.push(
          again.length > 0
            ? {
                id: rule.id,
                status: sev(rule),
                text: `${joinNames(again.map(input.name))} would sit out twice in a row`,
              }
            : { id: rule.id, status: "ok", text: "Nobody sits out twice in a row" },
        );
        break;
      }
      case "stays-home": {
        const away = ids.filter((pid) => {
          const home = input.homeLine?.[pid];
          return home && input.onField[pid] && input.onField[pid] !== home;
        });
        items.push(
          away.length > 0
            ? { id: rule.id, status: sev(rule), text: `${joinNames(away.map(input.name))} away from home` }
            : { id: rule.id, status: "ok", text: `${joinNames(ids.map(input.name))} at home` },
        );
        break;
      }
      default:
        break;
    }
  }

  // Season nudges: the biggest gaps among today's players. Soft, never block.
  if (input.season) {
    const gaps = biggestSeasonGaps(input.season.time, squad, input.season.units, input.periodMs, { limit: 2 });
    for (const g of gaps) {
      items.push({
        id: `season-${g.playerId}-${g.unit}`,
        status: "warn",
        text: g.never
          ? `${input.name(g.playerId)} hasn't played ${input.season.unitLabel(g.unit)} this season`
          : `${input.name(g.playerId)} is ${Math.round(g.owed)} ${input.periodWord}${Math.round(g.owed) === 1 ? "" : "s"} short at ${input.season.unitLabel(g.unit)}`,
      });
    }
  }
  return items;
}

/** The single line a collapsed check bar shows. */
export function summariseCheck(items: RuleCheckItem[]): { status: CheckStatus; text: string } {
  const fail = items.filter((i) => i.status === "fail");
  const warn = items.filter((i) => i.status === "warn");
  if (fail.length > 0) return { status: "fail", text: fail[0].text };
  if (warn.length > 0) return { status: "warn", text: warn[0].text };
  return { status: "ok", text: "All rules kept" };
}

export interface WhyInput {
  playerId: string;
  /** Line they're going to (null = bench). */
  to: string | null;
  from: string | null;
  lineLabel: (key: string) => string;
  periodWord: string;
  playedThisGame: Record<string, number>;
  benchedLastPeriod: boolean;
  homeLine?: string | null;
  strategy: string;
  /** Periods owed per line this season (from periodsOwed). */
  seasonOwed?: Record<string, number>;
}

/** The top reason behind a suggested move (UX plan §7.6 WhyChip). */
export function whyMove(w: WhyInput): string {
  if (w.to === null) return "Fair rest on the bench";
  if (w.strategy === "rotate" && w.from && w.from !== w.to) return "Everyone moves up a line";
  if ((w.strategy === "keep" || w.strategy === "manual") && w.from === w.to) return "Same spot as last " + w.periodWord;
  if (w.homeLine && w.homeLine === w.to) return `Home: ${w.lineLabel(w.to)}`;
  const owed = w.seasonOwed?.[w.to] ?? 0;
  if (!(w.playedThisGame[w.to] > 0) && owed >= 1) return `Owed ${w.lineLabel(w.to)} time this season`;
  if (!(w.playedThisGame[w.to] > 0)) return `Hasn't played ${w.lineLabel(w.to)} this game`;
  if (owed >= 1) return `Owed ${w.lineLabel(w.to)} time this season`;
  if (w.benchedLastPeriod) return `Sat out last ${w.periodWord}`;
  return "Fair time on field";
}
