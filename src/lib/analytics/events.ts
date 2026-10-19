import { ALL_SPORT_IDS, ALL_SPORTS } from "@/lib/sports/registry";

// ─── The event catalogue ─────────────────────────────────────
// Every custom event Siren sends to PostHog, with its properties.
// track() (client) and trackServer() (server) only accept names from
// here, so a sub is always `sub_made`, never `subMade` in one sport
// and `substitution_made` in another. The table it follows is "Event
// catalogue v1" in .planning/ANALYTICS-SEO-PLAN.md.
//
// Privacy rule: squads are lists of children's names, so no property
// may hold text a person typed or chose. Every property is one of:
//   - a closed list of values (an enum),
//   - a count or a number,
//   - a boolean,
//   - a uuid (a row id: never a name),
//   - a sport's age-group id, or the site's host name.
// cleanProps() drops anything else before it's sent, and
// src/lib/__tests__/analyticsEvents.test.ts pins the rules.

const SPORTS = ALL_SPORT_IDS;

/** How one property may look. Strings are only ever enums or ids. */
type PropSpec =
  | readonly string[]
  | "count"
  | "number"
  | "boolean"
  | "uuid"
  | "age_group"
  | "host";

/** A property that may be left out. */
interface Optional<S extends PropSpec> {
  optional: S;
}
type AnyPropSpec = PropSpec | Optional<PropSpec>;

function optional<S extends PropSpec>(spec: S): Optional<S> {
  return { optional: spec };
}

export const EVENT_CATALOGUE = {
  // ─── Activate (server: written with the row) ──────────────
  signup_completed: {
    method: ["email", "google", "apple"],
    brand_host: optional("host"),
  },
  team_created: {
    team_id: "uuid",
    sport: SPORTS,
    age_group: "age_group",
  },
  squad_built: {
    team_id: "uuid",
    sport: SPORTS,
    player_count: "count",
  },
  game_created: {
    team_id: "uuid",
    sport: SPORTS,
    /** Whole days from now to the bounce; negative for a past game. */
    days_until_game: optional("number"),
    source: ["manual", "playhq"],
  },
  game_started: {
    team_id: "uuid",
    sport: SPORTS,
    /** The coach saved a lineup plan before the day. */
    has_lineup_draft: "boolean",
  },
  game_completed: {
    team_id: "uuid",
    sport: SPORTS,
    /** Playing time: each period's clock at its end, added up. */
    duration_min: optional("count"),
    /** Subs made during play (swaps, and netball's mid-quarter subs). */
    subs_count: "count",
  },

  // ─── Game day (client: how the live screens get used) ────
  sub_made: {
    sport: SPORTS,
    /**
     * suggestion: the sub card, before a sub is due. due_prompt: the
     * sub card while "Sub due" shows. manual: the coach's own pick.
     */
    source: ["suggestion", "manual", "due_prompt"],
    /** Player swaps in this one tap ("Make all 3 swaps" is 3). */
    count: "count",
  },
  sub_due_prompt: {
    sport: SPORTS,
    /** accepted: the sub card applied while due. dismissed: "Got it". */
    action: ["accepted", "dismissed"],
  },
  score_recorded: {
    sport: SPORTS,
    kind: [
      "goal",
      "behind",
      "try",
      "conversion",
      "penalty_goal",
      "field_goal",
      "one_point",
      "two_points",
      "three_points",
    ],
    /** dock: tap a player, then the dock. chip: the score bug's chip. */
    via: ["dock", "chip"],
    side: ["own", "opponent"],
  },
  quarter_break_suggestion: {
    sport: SPORTS,
    /**
     * At the break's Start: applied the suggested lineup as is, edited
     * it first, or ignored it (another rotation mode).
     */
    action: ["applied", "edited", "ignored"],
  },
  lock_action: {
    sport: SPORTS,
    action: ["switch", "injure", "recover", "lend", "unlend", "lock", "unlock"],
  },
  late_arrival_added: {
    sport: SPORTS,
  },
  injury_replacement: {
    sport: SPORTS,
    action: ["replaced", "skipped"],
    reason: ["injured", "fouled_out", "sitting_out"],
    /** Picked the top (suggested) replacement. */
    picked_suggested: "boolean",
  },
  walkthrough: {
    sport: SPORTS,
    action: ["completed", "skipped"],
    /** The step it closed on, from 1. */
    step: "count",
    steps: "count",
  },
  undo_used: {
    sport: SPORTS,
    what: ["score"],
  },
  offline_queue_flushed: {
    queued_count: "count",
    /** How long the oldest write waited to be sent. */
    offline_seconds: "count",
  },

  // ─── Collaborate (server) ─────────────────────────────────
  invite_sent: {
    role: ["admin", "game_manager", "parent"],
  },
  invite_accepted: {
    role: ["admin", "game_manager", "parent"],
    via: ["invite", "team_code"],
  },
} as const satisfies Record<string, Record<string, AnyPropSpec>>;

export type EventName = keyof typeof EVENT_CATALOGUE;

type SpecValue<S> = S extends readonly (infer V)[]
  ? V
  : S extends "count" | "number"
    ? number
    : S extends "boolean"
      ? boolean
      : string;

type Catalogue = typeof EVENT_CATALOGUE;
type RequiredKeys<E extends EventName> = {
  [K in keyof Catalogue[E]]: Catalogue[E][K] extends Optional<PropSpec> ? never : K;
}[keyof Catalogue[E]];
type OptionalKeys<E extends EventName> = Exclude<keyof Catalogue[E], RequiredKeys<E>>;

/** The properties an event takes, typed from the catalogue. */
export type EventProps<E extends EventName> = {
  [K in RequiredKeys<E>]: SpecValue<Catalogue[E][K]>;
} & {
  [K in OptionalKeys<E>]?: Catalogue[E][K] extends Optional<infer S> ? SpecValue<S> | null : never;
};

/** Sport values every game-day event carries. */
export type AnalyticsSport = (typeof SPORTS)[number];

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const HOST = /^[a-z0-9.-]+(:\d{1,5})?$/i;
let ageGroupIds: ReadonlySet<string> | null = null;

function matches(spec: PropSpec, value: unknown): boolean {
  if (Array.isArray(spec)) return typeof value === "string" && spec.includes(value);
  switch (spec) {
    case "count":
      return typeof value === "number" && Number.isInteger(value) && value >= 0;
    case "number":
      return typeof value === "number" && Number.isFinite(value);
    case "boolean":
      return typeof value === "boolean";
    case "uuid":
      return typeof value === "string" && UUID.test(value);
    case "host":
      return typeof value === "string" && HOST.test(value);
    case "age_group":
      ageGroupIds ??= new Set(ALL_SPORTS.flatMap((s) => s.ageGroups.map((a) => a.id)));
      return typeof value === "string" && ageGroupIds.has(value);
  }
  return false;
}

export interface CleanedProps {
  props: Record<string, string | number | boolean>;
  /** Why a property was dropped, for debug mode to shout about. */
  problems: string[];
}

/**
 * An event's properties as they may be sent: only the catalogue's keys,
 * each matching its spec. The types already stop a wrong value at
 * compile time; this is the runtime backstop, so a cast or an `any`
 * can never smuggle a name or a note out.
 */
export function cleanProps(event: EventName, raw: Record<string, unknown>): CleanedProps {
  const specs = EVENT_CATALOGUE[event] as Record<string, AnyPropSpec>;
  const props: Record<string, string | number | boolean> = {};
  const problems: string[] = [];
  for (const [key, value] of Object.entries(raw)) {
    const spec = specs[key];
    if (!spec) {
      problems.push(`${event}: unknown property "${key}"`);
      continue;
    }
    const isOptional = typeof spec === "object" && !Array.isArray(spec);
    if (isOptional && (value === undefined || value === null)) continue;
    const inner = isOptional ? (spec as Optional<PropSpec>).optional : (spec as PropSpec);
    if (matches(inner, value)) props[key] = value as string | number | boolean;
    else problems.push(`${event}: "${key}" doesn't fit the catalogue`);
  }
  for (const [key, spec] of Object.entries(specs)) {
    const isOptional = typeof spec === "object" && !Array.isArray(spec);
    if (!isOptional && !(key in props) && !(key in raw)) problems.push(`${event}: missing "${key}"`);
  }
  return { props, problems };
}
