// Netball engine adapter for How we play (UX plan Phase 5.1–5.5).
//
// One suggester, five rotation styles: each style is a set of tier
// weights in suggestNetballLineup, plus two deterministic moves —
// Position cycle steps everyone one bib along, and Partners keep a kid
// in their third while they swap bibs with their partner. No playbook
// input = today's behaviour (By thirds, binary season rarity).

import type { ResolvedPlaybook } from "@/lib/playbook/team";
import type { PlaybookSnapshot, PlayerPositionPrefRow } from "@/lib/playbook/types";
import type { RuleInstance } from "@/lib/playbook/rules";
import { roleModelFor, rolesFromPrefs } from "@/lib/playbook/roles";
import { periodsOwed, seasonBalanceWeight, withKickoffSnapshot } from "@/lib/playbook/seasonBalance";
import type { UnitTime } from "@/lib/playbook/seasonTime";
import { primaryThirdFor } from "@/lib/sports/netball";
import type { GenericLineup } from "@/lib/sports/netball/fairness";
import { checkRules, whyMove, type RuleCheckItem } from "@/lib/playbook/ruleCheck";

export interface NetballRole {
  /** A bib ("gs") for position roles, or a third for line roles. */
  home: string | null;
  also: string[];
  never: string[];
  keepOn: boolean;
}

export interface NetballPlaybookInput {
  /** by-thirds · position-by-position · position-cycle · partners · set-positions */
  strategy: string;
  /** Points per period owed this season (10k / 20k / 40k); 0 = off. */
  seasonWeight: number;
  /** What season balance evens out: thirds or bibs. */
  unit: "third" | "bib";
  /** ms per player per unit this season (since a reset), from seasonTimeByUnit. */
  season?: UnitTime;
  periodMs: number;
  roleUnit: "position" | "line";
  roles: Record<string, NetballRole>;
  rules?: RuleInstance[];
  minGameTimePct?: number;
  /** Last quarter's lineup, for Position cycle. */
  previousLineup?: GenericLineup | null;
  /** Carnival day: thirds each player played in the day's earlier games. */
  thirdsToday?: Record<string, string[]>;
}

/** Tier weights per style (see suggestNetballLineup's tier notes). */
export function netballWeights(strategy: string | undefined) {
  switch (strategy) {
    case "position-by-position":
      // Every bib, not every third: an unplayed bib is the big pull.
      return { unplayedThird: 0, unplayedBib: 100_000, samePosition: -50_000, sameThirdAsLast: -10_000, teammate: -150_000, home: 0, also: 0 };
    case "partners":
      // Keep the third, swap the bib with your partner.
      return { unplayedThird: 0, unplayedBib: 0, samePosition: -50_000, sameThirdAsLast: 60_000, teammate: 0, home: 200_000, also: 0 };
    case "set-positions":
      // Home bib, then backups; nothing pulls a kid elsewhere.
      return { unplayedThird: 0, unplayedBib: 0, samePosition: 0, sameThirdAsLast: 0, teammate: 0, home: 300_000, also: 150_000 };
    default:
      // By thirds — today's engine.
      return { unplayedThird: 100_000, unplayedBib: 0, samePosition: -50_000, sameThirdAsLast: -10_000, teammate: -150_000, home: 0, also: 0 };
  }
}

/** Partners: GS↔GA, GD↔GK, and the centre court rotates WA → C → WD. */
export function partnerOf(bib: string, bibs: string[]): string {
  const pairs: Record<string, string> = { gs: "ga", ga: "gs", gd: "gk", gk: "gd" };
  if (pairs[bib] && bibs.includes(pairs[bib])) return pairs[bib];
  const centre = ["wa", "c", "wd"].filter((b) => bibs.includes(b));
  const i = centre.indexOf(bib);
  if (i >= 0 && centre.length > 1) return centre[(i + 1) % centre.length];
  return bib;
}

export function netballPlaybookInput(
  resolved: ResolvedPlaybook,
  prefs: Pick<PlayerPositionPrefRow, "player_id" | "position_key" | "line" | "kind" | "rank">[],
  rules: RuleInstance[],
  season: UnitTime | undefined,
  periodMs: number,
): NetballPlaybookInput {
  const model = roleModelFor(resolved);
  const roleUnit = model?.unit ?? "line";
  const roles: Record<string, NetballRole> = {};
  for (const [pid, r] of Object.entries(rolesFromPrefs(prefs, roleUnit))) {
    roles[pid] = { home: r.home, also: r.also, never: r.never, keepOn: r.keepOn };
  }
  return {
    strategy: resolved.strategy.id,
    seasonWeight: seasonBalanceWeight("netball", resolved.seasonBalance === "off" ? null : resolved.seasonBalance),
    unit: resolved.strategy.balanceUnit === "third" ? "third" : "bib",
    season,
    periodMs,
    roleUnit,
    roles,
    rules,
    minGameTimePct: resolved.policy.minGameTimePct,
  };
}

/** May this player wear this bib under their role? */
export function netballAllowed(input: NetballPlaybookInput | undefined, pid: string, bib: string): boolean {
  const never = input?.roles[pid]?.never;
  if (!never || never.length === 0) return true;
  return !never.includes(bib) && !never.includes(primaryThirdFor(bib) ?? "");
}

/** Season-balance points for putting `pid` in `bib` (W × periods owed). */
export function netballSeasonTerm(input: NetballPlaybookInput | undefined, pid: string, bib: string, bibs: string[]): number {
  if (!input || input.seasonWeight <= 0 || !input.season) return 0;
  const key = input.unit === "third" ? primaryThirdFor(bib) : bib;
  if (!key) return 0;
  const units =
    input.unit === "third"
      ? ["attack-third", "centre-third", "defence-third"]
      : bibs.filter((b) => netballAllowed(input, pid, b));
  const owed = periodsOwed({ byUnit: input.season[pid], units, periodMs: input.periodMs });
  return input.seasonWeight * (owed[key] ?? 0);
}

/** Role points: home / also, by bib or by third. */
export function netballRoleTerm(input: NetballPlaybookInput | undefined, pid: string, bib: string): number {
  const role = input?.roles[pid];
  if (!role) return 0;
  const w = netballWeights(input!.strategy);
  const key = input!.roleUnit === "position" ? bib : primaryThirdFor(bib);
  if (!key) return 0;
  // Partners: home bib means home third.
  if (input!.strategy === "partners" && role.home && input!.roleUnit === "position") {
    return primaryThirdFor(role.home) === primaryThirdFor(bib) ? w.home : 0;
  }
  if (role.home === key) return w.home;
  if (role.also.includes(key)) return w.also;
  return 0;
}

/**
 * Position cycle (5.2): everyone moves along GS → GA → … → GK → bench
 * → GS. The step is the bench size (at least one), so the whole bench
 * comes on and nobody sits out twice in a row. Kids who've left are
 * dropped; new arrivals join the end of the bench. A kid who'd land on
 * a bib they never play swaps with the next kid along who can take it.
 */
export function cycleLineup(
  previous: GenericLineup,
  bibs: string[],
  present: string[],
  input?: NetballPlaybookInput,
): GenericLineup {
  const here = new Set(present);
  const seq: (string | null)[] = [
    ...bibs.map((b) => {
      const pid = previous.positions[b]?.[0] ?? null;
      return pid && here.has(pid) ? pid : null;
    }),
    ...previous.bench.filter((p) => here.has(p)),
  ];
  const seen = new Set(seq.filter(Boolean) as string[]);
  for (const pid of present) if (!seen.has(pid)) seq.push(pid);
  // Step along by the bench size: the bench wraps round to GS.
  const step = Math.max(1, seq.length - bibs.length);
  const rotated = seq.length > 0 ? [...seq.slice(seq.length - step), ...seq.slice(0, seq.length - step)] : [];
  // Fill empty bib slots from the bench end of the sequence first.
  const onCourt = rotated.slice(0, bibs.length);
  const bench = rotated.slice(bibs.length).filter((p): p is string => !!p);
  for (let i = 0; i < onCourt.length; i++) {
    if (!onCourt[i] && bench.length > 0) onCourt[i] = bench.shift()!;
  }
  // Never-plays: swap forward with someone who can take the bib.
  for (let i = 0; i < onCourt.length; i++) {
    const pid = onCourt[i];
    if (!pid || netballAllowed(input, pid, bibs[i])) continue;
    for (let j = i + 1; j < onCourt.length; j++) {
      const other = onCourt[j];
      if (other && netballAllowed(input, other, bibs[i]) && netballAllowed(input, pid, bibs[j])) {
        onCourt[i] = other;
        onCourt[j] = pid;
        break;
      }
    }
  }
  const lineup: GenericLineup = { positions: {}, bench };
  bibs.forEach((b, i) => {
    lineup.positions[b] = onCourt[i] ? [onCourt[i]!] : [];
  });
  return lineup;
}

/** A game in progress plays the style and balance it kicked off with. */
export function withNetballSnapshot(
  input: NetballPlaybookInput,
  snapshot: PlaybookSnapshot | null | undefined,
): NetballPlaybookInput {
  return withKickoffSnapshot("netball", input, snapshot);
}

const THIRD_LABEL: Record<string, string> = {
  "attack-third": "Attack",
  "centre-third": "Centre",
  "defence-third": "Defence",
};

/**
 * The rule check and Why lines for a netball lineup about to start a
 * quarter (UX plan 4.3 for netball), on the shared checkRules / whyMove.
 */
export function netballRuleCheck(c: {
  lineup: GenericLineup;
  previousLineup: GenericLineup | null;
  names: Record<string, string>;
  /** This game's ms per player per third so far. */
  thirdMs: Map<string, { attack: number; centre: number; defence: number }>;
  period: number;
  periodCount: number;
  periodMs: number;
  input: NetballPlaybookInput | undefined;
}): { items: RuleCheckItem[]; why: { playerName: string; to: string; reason: string }[] } {
  const thirds = ["attack-third", "centre-third", "defence-third"];
  const onField: Record<string, string> = {};
  const bibOf: Record<string, string> = {};
  for (const [bib, ids] of Object.entries(c.lineup.positions)) {
    for (const pid of ids) {
      onField[pid] = primaryThirdFor(bib) ?? "centre-third";
      bibOf[pid] = bib;
    }
  }
  const prevBib: Record<string, string> = {};
  for (const [bib, ids] of Object.entries(c.previousLineup?.positions ?? {})) for (const pid of ids) prevBib[pid] = bib;
  const played: Record<string, Record<string, number>> = {};
  for (const pid of [...Object.keys(onField), ...c.lineup.bench]) {
    const t = c.thirdMs.get(pid);
    played[pid] = t ? { "attack-third": t.attack, "centre-third": t.centre, "defence-third": t.defence } : {};
  }
  const name = (pid: string) => c.names[pid] ?? "A player";
  const seasonOn = (c.input?.seasonWeight ?? 0) > 0 && !!c.input?.season;
  const byBib = c.input?.unit === "bib";
  const bibs = Object.keys(c.lineup.positions);
  const items = checkRules({
    onField,
    bench: c.lineup.bench,
    lines: thirds,
    lineLabel: (k) => THIRD_LABEL[k] ?? k,
    name,
    playedThisGame: played,
    benchedLastPeriod: c.previousLineup?.bench ?? [],
    period: c.period,
    periodCount: c.periodCount,
    periodMs: c.periodMs,
    periodWord: "quarter",
    lineWord: "third",
    minGameTimePct: c.input?.minGameTimePct ?? 50,
    rules: c.input?.rules ?? [],
    playedEarlierToday: c.input?.thirdsToday,
    season: seasonOn
      ? {
          time: c.input!.season!,
          units: byBib ? bibs : thirds,
          unitLabel: (k) => (byBib ? k.toUpperCase() : (THIRD_LABEL[k] ?? k).toLowerCase()),
        }
      : undefined,
  });

  const why: { playerName: string; to: string; reason: string }[] = [];
  if (c.previousLineup) {
    for (const pid of [...Object.keys(onField), ...c.lineup.bench]) {
      const to = bibOf[pid] ?? null;
      const from = prevBib[pid] ?? null;
      if (to === from) continue;
      const strategy = c.input?.strategy;
      let reason: string;
      if (to && strategy === "position-cycle") reason = "Everyone moves along the cycle";
      else if (to && strategy === "partners" && from && primaryThirdFor(from) === primaryThirdFor(to)) reason = "Swaps with their partner";
      else if (to && c.input?.roles[pid]?.home === to) reason = `Home: ${to.toUpperCase()}`;
      else {
        reason = whyMove({
          playerId: pid,
          to: to ? onField[pid] : null,
          from: from ? primaryThirdFor(from) : null,
          lineLabel: (k) => THIRD_LABEL[k] ?? k,
          periodWord: "quarter",
          playedThisGame: played[pid] ?? {},
          benchedLastPeriod: (c.previousLineup.bench ?? []).includes(pid),
          strategy: strategy ?? "by-thirds",
        });
      }
      why.push({ playerName: name(pid), to: to ? to.toUpperCase() : "Bench", reason });
    }
  }
  return { items, why };
}
