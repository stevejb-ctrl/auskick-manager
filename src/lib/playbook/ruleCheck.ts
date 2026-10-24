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
  /** The rule itself, as the break screen prints it under the text. */
  rule?: string;
  /** The kids the item names (the break screen's Fix moves them first). */
  playerIds?: string[];
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
  /**
   * How much of the coming period a kid who starts it on the bench can
   * still play: the whole period where subs roll on at any time, from
   * the first window where they come in windows. 0 or absent: none (subs
   * at the breaks), so a bench kid is held to the periods after.
   */
  benchReachMs?: number;
  periodWord: string;
  /** "line" (AFL, league) or "third" (netball). */
  lineWord: string;
  minGameTimePct: number;
  rules: RuleInstance[];
  /** Home line per player, for "stays at home". */
  homeLine?: Record<string, string | null>;
  /** Season balance: season time per player per unit, and its units. */
  season?: { time: UnitTime; units: string[]; unitLabel: (key: string) => string };
  /** Carnival day: lines each player played in the day's earlier games. */
  playedEarlierToday?: Record<string, string[]>;
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

  // Game-time floor: can everyone still reach it? A kid on the bench at
  // the start can still come on this period where subs roll.
  const gameMs = input.periodCount * input.periodMs;
  const benchReach = Math.min(input.periodMs, Math.max(0, input.benchReachMs ?? 0));
  const short = squad.filter((pid) => {
    const best = played(pid) + (input.onField[pid] ? input.periodMs : benchReach) + remainingAfter * input.periodMs;
    return gameMs > 0 && best / gameMs < input.minGameTimePct / 100;
  });
  items.push(
    short.length === 0
      ? { id: "min-game-time", status: "ok", text: `Everyone can play at least ${input.minGameTimePct}%` }
      : {
          id: "min-game-time",
          status: "fail",
          text: `${joinNames(short.map(input.name))} can't reach ${input.minGameTimePct}% now`,
          rule: `Everyone plays at least ${input.minGameTimePct}% of the game`,
          playerIds: short,
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
            rule: ruleLine(rule, input),
            playerIds: behind,
          });
        } else if (missing.length > 0 && remainingAfter === 0) {
          items.push({
            id: rule.id,
            status: sev(rule),
            text: `${joinNames(missing.map(input.name))} missed a ${input.lineWord} this game`,
            rule: ruleLine(rule, input),
            playerIds: missing,
          });
        } else {
          items.push({
            id: rule.id,
            status: "ok",
            text: rule.kind === "every-line-per-game" ? `Everyone gets every ${input.lineWord}` : `Everyone gets ${need} ${input.lineWord}s`,
          });
        }
        break;
      }
      case "every-line-per-day": {
        // Later games today can still make it up, so this only warns,
        // and only once this game can't.
        const missing = squad.filter((pid) => {
          const today = new Set([...Array.from(playedLines(pid)), ...(input.playedEarlierToday?.[pid] ?? [])]);
          return today.size < input.lines.length;
        });
        items.push(
          missing.length === 0
            ? { id: rule.id, status: "ok", text: `Everyone has played every ${input.lineWord} today` }
            : {
                id: rule.id,
                status: remainingAfter === 0 ? "warn" : "ok",
                text: `${joinNames(missing.map(input.name))} still to play every ${input.lineWord} today`,
                rule: ruleLine(rule, input),
                playerIds: missing,
              },
        );
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
                rule: ruleLine(rule, input),
                playerIds: clash[1],
              }
            : { id: rule.id, status: "ok", text: `${joinNames(ids.map(input.name))} kept apart` },
        );
        break;
      }
      case "keep-together": {
        const lines = new Set(ids.map((pid) => input.onField[pid]).filter(Boolean));
        items.push(
          lines.size > 1
            ? {
                id: rule.id,
                status: sev(rule),
                text: `${joinNames(ids.map(input.name))} are split up`,
                rule: ruleLine(rule, input),
                playerIds: ids,
              }
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
                rule: ruleLine(rule, input),
                playerIds: again,
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
            ? {
                id: rule.id,
                status: sev(rule),
                text: `${joinNames(away.map(input.name))} away from home`,
                rule: ruleLine(rule, input),
                playerIds: away,
              }
            : { id: rule.id, status: "ok", text: `${joinNames(ids.map(input.name))} at home` },
        );
        break;
      }
      default:
        break;
    }
  }

  // Season nudges: the biggest gaps among today's players. Soft, never block.
  // With none, still say where season balance stands, so the check shows
  // it's being kept (usability run: "only checks a 50% minimum").
  if (input.season) {
    // A gap this lineup is closing (the kid is in that unit now) isn't a
    // warning: amber on the Suggested lineup that put Hugo at back for
    // "Hugo hasn't played back" read as a fault (UX round 2, 24 Oct 2026).
    // It says so, and the nudges go to the gaps still open.
    const all = biggestSeasonGaps(input.season.time, squad, input.season.units, input.periodMs, { limit: Infinity });
    const closing = (g: (typeof all)[number]) => input.onField[g.playerId] === g.unit;
    const gaps = all.filter((g) => !closing(g)).slice(0, 2);
    for (const g of all.slice(0, 2).filter(closing)) {
      items.push({
        id: `season-${g.playerId}-${g.unit}`,
        status: "ok",
        text: `${input.name(g.playerId)} plays ${input.season.unitLabel(g.unit)} this ${input.periodWord}`,
      });
    }
    if (all.length === 0) {
      const anyTime = squad.some((pid) => Object.values(input.season!.time[pid] ?? {}).some((ms) => ms > 0));
      items.push({
        id: "season-balance",
        status: "ok",
        text: anyTime ? "Season balance: nobody is short this season" : "Season balance starts after your first game",
      });
    }
    for (const g of gaps) {
      items.push({
        id: `season-${g.playerId}-${g.unit}`,
        status: "warn",
        playerIds: [g.playerId],
        text: g.never
          ? `${input.name(g.playerId)} hasn't played ${input.season.unitLabel(g.unit)} this season`
          : `${input.name(g.playerId)} is ${Math.round(g.owed)} ${input.periodWord}${Math.round(g.owed) === 1 ? "" : "s"} short at ${input.season.unitLabel(g.unit)}`,
      });
    }
  }
  return items;
}

/** A rule as the break screen prints it under what broke it. */
function ruleLine(rule: RuleInstance, input: RuleCheckInput): string {
  const names = joinNames((rule.params.playerIds ?? []).map(input.name));
  switch (rule.kind) {
    case "every-line-per-game":
      return `Everyone plays every ${input.lineWord} each game`;
    case "every-line-per-day":
      return `Everyone plays every ${input.lineWord} across the day`;
    case "distinct-lines":
      return `Everyone plays ${rule.params.count ?? 2} different ${input.lineWord}s`;
    case "keep-apart":
      return `Keep ${names} apart`;
    case "keep-together":
      return `Keep ${names} together`;
    case "max-bench-in-row":
      return `Nobody sits out two ${input.periodWord}s in a row`;
    case "stays-home":
      return `${names} stay${(rule.params.playerIds?.length ?? 0) === 1 ? "s" : ""} at home`;
    default:
      return "";
  }
}

/** The single line a collapsed check bar shows. */
export function summariseCheck(items: RuleCheckItem[]): { status: CheckStatus; text: string } {
  const fail = items.filter((i) => i.status === "fail");
  const warn = items.filter((i) => i.status === "warn");
  if (fail.length > 0) return { status: "fail", text: fail[0].text };
  if (warn.length > 0) return { status: "warn", text: warn[0].text };
  // One check is just that check: "All rules kept" would overclaim.
  if (items.length === 1) return { status: "ok", text: items[0].text };
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
