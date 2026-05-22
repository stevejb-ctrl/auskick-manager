"use client";

import { useMemo, useState, useTransition } from "react";
import { createTeam } from "@/app/(app)/dashboard/actions";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Label } from "@/components/ui/Label";
import { getSportConfig } from "@/lib/sports";
import type { Sport } from "@/lib/types";

interface TeamBasicsFormProps {
  userId: string;
  /** Sport selected by default based on the brand the user arrived from. */
  defaultSport?: Sport;
  /**
   * If true, hide the sport picker and lock to `defaultSport`. Used on
   * brand-specific domains where only one sport makes sense.
   * Set to false (the default) on the shared dashboard so a coach with
   * multiple sports can pick when adding a team.
   */
  lockSport?: boolean;
}

export function TeamBasicsForm({
  userId,
  defaultSport = "afl",
  lockSport = false,
}: TeamBasicsFormProps) {
  const [sport, setSport] = useState<Sport>(defaultSport);
  const cfg = useMemo(() => getSportConfig(sport), [sport]);

  // Default age group per sport. Each default is a "common entry"
  // rather than the first id in the catalog — most clubs start at
  // U10 for AFL and rugby league, and at NetSetGO "go" for netball.
  const defaultAgeFor = (s: Sport) => {
    switch (s) {
      case "afl":
        return "U10";
      case "netball":
        return "go";
      case "rugby_league":
        return "U10";
    }
  };

  const [name, setName] = useState("");
  const [ageGroup, setAgeGroup] = useState<string>(defaultAgeFor(sport));
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const ageCfg = cfg.ageGroups.find((a) => a.id === ageGroup) ?? cfg.ageGroups[0];

  function handleSportChange(next: Sport) {
    setSport(next);
    setAgeGroup(defaultAgeFor(next));
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!name.trim()) {
      setError("Team name is required.");
      return;
    }

    // createTeam calls redirect() internally on success — control never
    // returns from the action in that case.  The result branch here
    // only runs for the failure path.
    startTransition(async () => {
      const result = await createTeam(userId, name.trim(), ageGroup, sport);
      if (!result.success) {
        setError(result.error);
      }
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {!lockSport && (
        <div className="space-y-1">
          <Label>Sport</Label>
          {/*
            One column on phones — three pills stacked is the most
            scannable shape on a thumb. Switch to 3-up at sm+ so an
            iPad / browser shows the field of choices at a glance.
          */}
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            <SportPill
              active={sport === "afl"}
              onClick={() => handleSportChange("afl")}
              disabled={isPending}
              title="Junior AFL"
              subtitle="U8–U17. Manage subs, rotations, scoring and more."
            />
            <SportPill
              active={sport === "netball"}
              onClick={() => handleSportChange("netball")}
              disabled={isPending}
              title="Junior Netball"
              subtitle="Set–Open. Manage subs, rotations (3 zones, 7 positions), scoring and more."
            />
            <SportPill
              active={sport === "rugby_league"}
              onClick={() => handleSportChange("rugby_league")}
              disabled={isPending}
              title="Junior Rugby League"
              subtitle="U6–U12. Manage subs, vest + kick rotations, scoring and more."
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
          placeholder={
            sport === "afl"
              ? "e.g. Kingsway Roos"
              : sport === "netball"
              ? "e.g. Kingsway Flyers"
              : "e.g. Kingsway Tigers"
          }
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
          onChange={(e) => setAgeGroup(e.target.value)}
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
// these in a responsive 1-up (mobile) / 3-up (sm+) grid so all three
// sports — AFL, Netball, Rugby League — are scannable at a glance.
function SportPill({
  active,
  onClick,
  disabled,
  title,
  subtitle,
}: {
  active: boolean;
  onClick: () => void;
  disabled: boolean;
  title: string;
  subtitle: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={active}
      className={[
        "rounded-md border p-3 text-left text-sm transition-colors",
        "focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-600",
        "disabled:opacity-60",
        active
          ? "border-brand-600 bg-brand-50 text-ink"
          : "border-hairline bg-surface text-ink hover:border-brand-600/50",
      ].join(" ")}
    >
      <div className="font-semibold">{title}</div>
      <div className="mt-0.5 text-xs text-ink-dim">{subtitle}</div>
    </button>
  );
}
