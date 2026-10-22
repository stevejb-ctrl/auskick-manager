"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createTeam } from "@/app/(app)/dashboard/actions";
import { updateTeamBasics } from "@/app/(app)/teams/[teamId]/setup/actions";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Label } from "@/components/ui/Label";
import { getSportConfig, isTouch, periodLabels } from "@/lib/sports";
import { Toggle } from "@/components/ui/Toggle";
import { mixedRuleSummary } from "@/lib/sports/touch/mixed";
import type { TouchAgeGroupConfig } from "@/lib/sports/touch/types";
import { PERIOD_MINUTES_MAX, teamOnFieldSize } from "@/lib/games/newGameDefaults";
import type { AgeGroupConfig } from "@/lib/sports/types";
import type { Sport } from "@/lib/types";

interface TeamBasicsFormProps {
  userId: string;
  /** Sport selected by default based on the brand the user arrived from. */
  defaultSport: Sport;
  /**
   * If true, hide the sport picker and lock to `defaultSport`. Used on
   * brand-specific domains where only one sport makes sense.
   * Set to false (the default) on the shared dashboard so a coach with
   * multiple sports can pick when adding a team.
   */
  lockSport?: boolean;
  /**
   * Edit an existing team instead of creating one (the wizard's Basics
   * step after the team exists). Sport is shown but can't change.
   */
  existingTeam?: {
    id: string;
    name: string;
    ageGroup: string;
    /** The team's own players on the field and period length; null = the age group's. */
    onFieldSize: number | null;
    periodSeconds: number | null;
  };
}

const NAME_EXAMPLE: Record<Sport, string> = {
  afl: "e.g. Kingsway Roos",
  netball: "e.g. Kingsway Flyers",
  rugby_league: "e.g. Kingsway Tigers",
  rugby_union: "e.g. Kingsway Rams",
  soccer: "e.g. Kingsway United",
  basketball: "e.g. Kingsway Hawks",
  futsal: "e.g. Kingsway Strikers",
  hockey: "e.g. Kingsway Kookaburras",
  touch: "e.g. Kingsway Sharks",
  oztag: "e.g. Kingsway Stingrays",
};

// Default age group per sport: a "common entry" rather than the first
// id in the catalog — most clubs start at U10 for AFL and both rugbys,
// and at NetSetGO "go" for netball. Soccer isn't a pill yet (phase 2
// adds it); U10 is MiniRoos' 9 a side.
const DEFAULT_AGE: Record<Sport, string> = {
  afl: "U10",
  netball: "go",
  rugby_league: "U10",
  rugby_union: "U10",
  soccer: "U10",
  basketball: "U10",
  futsal: "U10",
  hockey: "U10",
  touch: "U10",
  oztag: "U10",
};

export function TeamBasicsForm({
  userId,
  defaultSport,
  lockSport = false,
  existingTeam,
}: TeamBasicsFormProps) {
  const [sport, setSport] = useState<Sport>(defaultSport);
  const cfg = useMemo(() => getSportConfig(sport), [sport]);

  const defaultAgeFor = (s: Sport) => DEFAULT_AGE[s];

  const [name, setName] = useState(existingTeam?.name ?? "");
  const [ageGroup, setAgeGroup] = useState<string>(
    existingTeam?.ageGroup ?? defaultAgeFor(sport),
  );
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  const ageCfg = cfg.ageGroups.find((a) => a.id === ageGroup) ?? cfg.ageGroups[0];

  // Players on the field and period length start at the age group's
  // defaults (the national pathway, for union) and follow the age group
  // until the coach sets their own; a size the coach set is kept inside
  // a new age's range. Competitions differ by state.
  const [players, setPlayers] = useState<number>(() =>
    teamOnFieldSize(ageCfg, existingTeam?.onFieldSize ?? null),
  );
  const [playersSet, setPlayersSet] = useState(existingTeam?.onFieldSize != null);
  const [periodMinutes, setPeriodMinutes] = useState<string>(() =>
    String((existingTeam?.periodSeconds ?? ageCfg.periodSeconds) / 60),
  );
  const [periodSet, setPeriodSet] = useState(existingTeam?.periodSeconds != null);
  // Touch and Oztag: a mixed team keeps the sport's boys' cap (set in
  // Settings afterwards). Asked only when the team is created.
  const [mixed, setMixed] = useState(false);
  const mixedPreset = isTouch(sport) ? (ageCfg as TouchAgeGroupConfig).mixedPreset : null;
  const { label: periodWord, plural: periodPlural } = periodLabels(sport, ageCfg);
  const sizes: number[] = [];
  for (let n = ageCfg.minOnFieldSize; n <= ageCfg.maxOnFieldSize; n++) sizes.push(n);

  function followAge(next: AgeGroupConfig, keepSet: boolean) {
    setPlayers((current) => (keepSet && playersSet ? teamOnFieldSize(next, current) : next.defaultOnFieldSize));
    if (!keepSet || !playersSet) setPlayersSet(false);
    if (!keepSet || !periodSet) {
      setPeriodMinutes(String(next.periodSeconds / 60));
      setPeriodSet(false);
    }
  }

  function handleSportChange(next: Sport) {
    setSport(next);
    const nextAge = defaultAgeFor(next);
    setAgeGroup(nextAge);
    const nextCfg = getSportConfig(next).ageGroups.find((a) => a.id === nextAge) ?? getSportConfig(next).ageGroups[0];
    followAge(nextCfg, false);
  }

  function handleAgeChange(next: string) {
    setAgeGroup(next);
    followAge(cfg.ageGroups.find((a) => a.id === next) ?? cfg.ageGroups[0], true);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!name.trim()) {
      setError("Team name is required.");
      return;
    }
    const minutes = Number(periodMinutes);
    if (!Number.isInteger(minutes) || minutes < 1 || minutes > PERIOD_MINUTES_MAX) {
      setError(`${periodWord.charAt(0).toUpperCase()}${periodWord.slice(1)} length must be a whole number of minutes between 1 and ${PERIOD_MINUTES_MAX}.`);
      return;
    }
    // The server stores none for the age group's own values.
    const shape = { onFieldSize: players, periodSeconds: minutes * 60, ...(mixedPreset && mixed ? { mixed: true } : {}) };

    // updateTeamBasics redirects on success. createTeam hands back the
    // setup URL instead, and we REPLACE this page with it: Back from the
    // setup must not land on a blank create form (round 5: Continue there
    // made a second team).
    startTransition(async () => {
      if (existingTeam) {
        const result = await updateTeamBasics(existingTeam.id, name.trim(), ageGroup, shape);
        if (!result.success) setError(result.error);
        return;
      }
      const result = await createTeam(userId, name.trim(), ageGroup, sport, shape);
      if (!result.success) {
        setError(result.error);
        return;
      }
      if (result.data) router.replace(result.data.setupUrl);
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {existingTeam && (
        <div className="space-y-1">
          <Label>Sport</Label>
          <p className="text-sm text-ink">{cfg.name}</p>
        </div>
      )}
      {!lockSport && !existingTeam && (
        <div className="space-y-1">
          <Label>Sport</Label>
          {/*
            One column on phones — the pills stacked is the most
            scannable shape on a thumb. Two by two at sm+ so an iPad /
            browser shows the four choices at a glance.
          */}
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <SportPill
              active={sport === "afl"}
              onClick={() => handleSportChange("afl")}
              disabled={isPending}
              title="Junior AFL"
              subtitle="U8–U17. Manage subs, zones or positions, scoring and more."
            />
            <SportPill
              active={sport === "netball"}
              onClick={() => handleSportChange("netball")}
              disabled={isPending}
              title="Junior Netball"
              subtitle="Set–Open. Manage subs, rotations through the thirds and 7 positions, scoring and more."
            />
            <SportPill
              active={sport === "rugby_league"}
              onClick={() => handleSportChange("rugby_league")}
              disabled={isPending}
              title="Junior Rugby League"
              subtitle="U6–U17. Manage subs, vest + kick rotations, scoring and more."
            />
            <SportPill
              active={sport === "rugby_union"}
              onClick={() => handleSportChange("rugby_union")}
              disabled={isPending}
              title="Junior Rugby Union"
              subtitle="U6–U18. Manage subs, forwards and backs or named positions, scoring and more."
            />
            {/* Open to every coach while it's in beta (Steve, 17 Oct 2026). */}
            <SportPill
              active={sport === "soccer"}
              onClick={() => handleSportChange("soccer")}
              disabled={isPending}
              title="Junior Football (soccer)"
              subtitle="MiniRoos to U17. Manage subs, a fair turn in goal, lines, scoring and more."
              badge="Beta"
            />
            {/* Open to every coach while it's in beta, as soccer was. */}
            <SportPill
              active={sport === "basketball"}
              onClick={() => handleSportChange("basketball")}
              disabled={isPending}
              title="Junior Basketball"
              subtitle="U8–U18. Manage subs at the table, guard and forward rotations, fouls, scoring and more."
              badge="Beta"
            />
            {/* Futsal: open to every coach while it's in beta, as soccer was. */}
            <SportPill
              active={sport === "futsal"}
              onClick={() => handleSportChange("futsal")}
              disabled={isPending}
              title="Junior Futsal"
              subtitle="U6–U17. Manage flying subs, a fair turn in goal, back, wings and front, scoring and more."
              badge="Beta"
            />
            {/* Hockey: open to every coach while it's in beta, as soccer was. */}
            <SportPill
              active={sport === "hockey"}
              onClick={() => handleSportChange("hockey")}
              disabled={isPending}
              title="Junior Hockey"
              subtitle="U7–U17. Manage subs, keeper turns at the breaks, halves or quarters, scoring and more."
              badge="Beta"
            />
            {/* Touch and Oztag: open to every coach while they're in beta, as basketball was. */}
            <SportPill
              active={sport === "touch"}
              onClick={() => handleSportChange("touch")}
              disabled={isPending}
              title="Junior Touch football"
              subtitle="U6–U17. Manage rolling subs, middle, link and wing rotations, the mixed rule, scoring and more."
              badge="Beta"
            />
            <SportPill
              active={sport === "oztag"}
              onClick={() => handleSportChange("oztag")}
              disabled={isPending}
              title="Junior Oztag"
              subtitle="U6–U17. Manage rolling subs from the sub box, the mixed rule and girls' tries, scoring and more."
              badge="Beta"
            />
          </div>
        </div>
      )}

      <div className="space-y-1">
        <Label htmlFor="team-name">Team name</Label>
        <Input
          id="team-name"
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={NAME_EXAMPLE[sport]}
          error={error ?? undefined}
          disabled={isPending}
          autoFocus
        />
      </div>

      <div className="space-y-1">
        <Label htmlFor="team-age">Age group</Label>
        <select
          id="team-age"
          value={ageGroup}
          onChange={(e) => handleAgeChange(e.target.value)}
          disabled={isPending}
          className="h-10 w-full rounded-md border border-hairline bg-surface px-2 text-sm text-ink shadow-card focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-600 focus:border-brand-600 disabled:bg-surface-alt disabled:text-ink-mute"
        >
          {cfg.ageGroups.map((ag) => (
            <option key={ag.id} value={ag.id}>
              {ag.label}
            </option>
          ))}
        </select>
        <p className="text-xs text-ink-mute">{ageCfg?.notes}</p>
      </div>

      <div className="space-y-2">
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label htmlFor="team-on-field">Players on the field</Label>
            <select
              id="team-on-field"
              value={players}
              onChange={(e) => {
                setPlayers(Number(e.target.value));
                setPlayersSet(true);
              }}
              disabled={isPending}
              className="h-10 w-full rounded-md border border-hairline bg-surface px-2 text-sm text-ink shadow-card focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-600 focus:border-brand-600 disabled:bg-surface-alt disabled:text-ink-mute"
            >
              {sizes.map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1">
            <Label htmlFor="team-period">
              {periodWord.charAt(0).toUpperCase()}
              {periodWord.slice(1)} length (minutes)
            </Label>
            <Input
              id="team-period"
              type="number"
              min={1}
              max={PERIOD_MINUTES_MAX}
              step={1}
              value={periodMinutes}
              onChange={(e) => {
                setPeriodMinutes(e.target.value);
                setPeriodSet(true);
              }}
              disabled={isPending}
            />
          </div>
        </div>
        <p className="text-xs text-ink-mute">
          These start at {ageCfg.label}&apos;s defaults ({ageCfg.defaultOnFieldSize} a side,{" "}
          {ageCfg.periodSeconds / 60}-minute {periodPlural}).
          Competitions differ by state: set what yours plays. A game can still change on the day.
        </p>
      </div>

      {mixedPreset && !existingTeam && (
        <div className="flex items-start justify-between gap-3 rounded-md border border-hairline bg-surface p-3 shadow-card">
          <div className="space-y-0.5">
            <p className="text-sm font-medium text-ink">Mixed team</p>
            <p className="text-xs text-ink-mute">
              Boys and girls play together. Siren keeps {cfg.shortName}&apos;s mixed rule ({mixedRuleSummary(mixedPreset).replace(/\.$/, "")}),
              and you mark each kid Girl or Boy for it. You can set your competition&apos;s own rule in Settings.
            </p>
          </div>
          <Toggle checked={mixed} onChange={setMixed} disabled={isPending} label="Mixed team" />
        </div>
      )}

      <Button
        type="submit"
        loading={isPending}
        disabled={!name.trim()}
        size="lg"
        className="w-full"
      >
        Continue
      </Button>
    </form>
  );
}

// ─── Sport pill ──────────────────────────────────────────────
// Radio-ish button with title + one-line capsule. The parent wraps
// these in a responsive 1-up (mobile) / 2-up (sm+) grid so all four
// sports — AFL, Netball, Rugby League, Rugby Union — are scannable at
// a glance.
function SportPill({
  active,
  onClick,
  disabled,
  title,
  subtitle,
  badge,
}: {
  active: boolean;
  onClick: () => void;
  disabled: boolean;
  title: string;
  subtitle: string;
  /** A small tag beside the title, e.g. "Beta". */
  badge?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={active}
      aria-label={title}
      className={[
        "rounded-md border p-3 text-left text-sm transition-colors",
        "focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-600",
        "disabled:opacity-60",
        active
          ? "border-brand-600 bg-brand-50 text-ink"
          : "border-hairline bg-surface text-ink hover:border-brand-600/50",
      ].join(" ")}
    >
      <div className="flex items-center gap-2 font-semibold">
        {title}
        {badge && (
          <span className="rounded-xs bg-warn-soft px-1.5 py-0.5 font-mono text-[10px] font-bold uppercase tracking-micro text-warn">
            {badge}
          </span>
        )}
      </div>
      <div className="mt-0.5 text-xs text-ink-dim">{subtitle}</div>
    </button>
  );
}
