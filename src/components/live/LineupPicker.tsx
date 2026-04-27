"use client";

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import { startGame } from "@/app/(app)/teams/[teamId]/games/[gameId]/live/actions";
import { Input } from "@/components/ui/Input";
import { Label } from "@/components/ui/Label";
import {
  Eyebrow,
  Guernsey,
  SFButton,
  SFCard,
  SFIcon,
} from "@/components/sf";
import type { Lineup, Player, PositionModel, Zone } from "@/lib/types";
import {
  suggestStartingLineup,
  zoneCapsFor,
  type PlayerZoneMinutes,
} from "@/lib/fairness";
import { positionsFor, ZONE_SHORT_LABELS } from "@/lib/ageGroups";

// Rotations each player gets to sit on the bench over the whole game.
// Bigger benches → more rotations per player (shorter stints each).
function restsPerPlayer(benchSize: number): number {
  return Math.max(1, Math.ceil(benchSize / 2));
}

// Target sub interval (minutes), rounded to the nearest 0.5 min, clamped [1, 10].
function suggestedSubMinutes(
  benchSize: number,
  totalPlayers: number,
  gameMinutes: number,
): number {
  if (benchSize <= 0 || totalPlayers <= 0) return 3;
  const R = restsPerPlayer(benchSize);
  const raw = (benchSize * gameMinutes) / (totalPlayers * R);
  const rounded = Math.round(raw * 2) / 2;
  return Math.min(10, Math.max(1, rounded));
}

interface LineupPickerProps {
  auth: import("@/lib/types").LiveAuth;
  gameId: string;
  players: Player[];
  season: PlayerZoneMinutes;
  defaultOnFieldSize: number;
  minOnFieldSize: number;
  maxOnFieldSize: number;
  positionModel: PositionModel;
  /** Full-game length in minutes (4 × quarter length). */
  gameMinutes: number;
  /** Optional href for the Back button shown above the picker. */
  backHref?: string;
}

type Slot = Zone | "bench";

/**
 * Lineup picker — coach assigns available players to zones + bench
 * before kick-off. Tap two players to swap them.
 *
 * Visual refresh per design_handoff_siren_footy/prototype/sf/lineup.jsx,
 * adapted to our 5-zone model (FWD / H-FWD / CEN / H-BCK / BCK) instead
 * of the prototype's 3-zone model. Every piece of game logic — the swap
 * reducer, suggestStartingLineup, sub interval calc, startGame action
 * — is unchanged from the previous version.
 *
 * Field-viz toggle (the design's green-oval pitch rendering with player
 * tiles) is intentionally not included in this commit; today's picker
 * is list-based, and the Field viz would be a substantial new SVG
 * component. Tracked for a follow-up.
 */
export function LineupPicker({
  auth,
  gameId,
  players,
  season,
  defaultOnFieldSize,
  minOnFieldSize,
  maxOnFieldSize,
  positionModel,
  gameMinutes,
  backHref,
}: LineupPickerProps) {
  const [onFieldSize, setOnFieldSize] = useState(defaultOnFieldSize);
  const zoneCaps = useMemo(
    () => zoneCapsFor(onFieldSize, positionModel),
    [onFieldSize, positionModel],
  );
  const [lineup, setLineup] = useState<Lineup>(() =>
    suggestStartingLineup(players, season, 0, zoneCaps),
  );

  function handleSizeChange(next: number) {
    setOnFieldSize(next);
    setLineup(
      suggestStartingLineup(
        players,
        season,
        0,
        zoneCapsFor(next, positionModel),
      ),
    );
  }

  const [selected, setSelected] = useState<string | null>(null);
  const [serverError, setServerError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [subMinInput, setSubMinInput] = useState<string | null>(null);

  // Each on-field-size option becomes a pill. Per-zone breakdown is
  // shown as a sub-line within the active pill.
  const sizeOptions = useMemo(() => {
    const out: { value: number; splits: string; tag: "rec" | "short" | "above" }[] = [];
    for (let s = maxOnFieldSize; s >= minOnFieldSize; s--) {
      const caps = zoneCapsFor(s, positionModel);
      const zs = positionsFor(positionModel);
      const splits = zs.map((z) => caps[z]).join("-");
      const tag: "rec" | "short" | "above" =
        s === defaultOnFieldSize
          ? "rec"
          : s < defaultOnFieldSize
          ? "short"
          : "above";
      out.push({ value: s, splits, tag });
    }
    return out.sort((a, b) => a.value - b.value);
  }, [defaultOnFieldSize, minOnFieldSize, maxOnFieldSize, positionModel]);

  const playerById = useMemo(
    () => new Map(players.map((p) => [p.id, p])),
    [players],
  );

  const zones = useMemo(() => positionsFor(positionModel), [positionModel]);
  const displayZones = useMemo(() => [...zones].reverse(), [zones]);
  const slots = useMemo<Slot[]>(() => [...displayZones, "bench"], [displayZones]);
  const slotLabel = (s: Slot) =>
    s === "bench" ? "Bench" : ZONE_SHORT_LABELS[s];

  function slotOf(pid: string): Slot | null {
    for (const s of slots) if (lineup[s].includes(pid)) return s;
    return null;
  }

  function handleTap(pid: string) {
    if (!selected) {
      setSelected(pid);
      return;
    }
    if (selected === pid) {
      setSelected(null);
      return;
    }
    const a = selected;
    const b = pid;
    const sa = slotOf(a);
    const sb = slotOf(b);
    if (!sa || !sb) return;

    setLineup((prev) => {
      const next: Lineup = {
        back: [...prev.back],
        hback: [...prev.hback],
        mid: [...prev.mid],
        hfwd: [...prev.hfwd],
        fwd: [...prev.fwd],
        bench: [...prev.bench],
      };
      if (sa === sb) {
        next[sa] = next[sa].map((p) => (p === a ? b : p === b ? a : p));
      } else {
        next[sa] = next[sa].map((p) => (p === a ? b : p));
        next[sb] = next[sb].map((p) => (p === b ? a : p));
      }
      return next;
    });
    setSelected(null);
  }

  const onFieldCount = zones.reduce((n, z) => n + lineup[z].length, 0);
  const benchCount = lineup.bench.length;
  const totalCount = onFieldCount + benchCount;
  const suggestedMin = suggestedSubMinutes(benchCount, totalCount, gameMinutes);
  const effectiveOnFieldTarget = Math.min(onFieldSize, totalCount);
  const effectiveSubMin =
    subMinInput === null
      ? suggestedMin
      : Math.min(10, Math.max(1, parseFloat(subMinInput) || suggestedMin));

  function handleStart() {
    setServerError(null);
    const subSeconds = Math.round(effectiveSubMin * 60);
    startTransition(async () => {
      const result = await startGame(
        auth,
        gameId,
        lineup,
        subSeconds,
        onFieldSize,
      );
      if (result && !result.success) {
        setServerError(result.error);
        return;
      }
      if (auth.kind === "token") {
        window.location.assign(`/run/${auth.token}`);
      }
    });
  }

  return (
    <div className="space-y-4 pb-24">
      {backHref && (
        <Link
          href={backHref}
          className="inline-flex items-center gap-1 text-sm font-medium text-ink-dim transition-colors duration-fast ease-out-quart hover:text-ink"
        >
          <SFIcon.chevronLeft />
          Back to availability
        </Link>
      )}

      {/* ── Auto-suggest banner ──────────────────────────────────────── */}
      <div className="flex items-start gap-3 rounded-lg border border-warn/30 bg-warn-soft p-4 sm:p-5">
        <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-warn text-white">
          <SFIcon.whistle color="white" size={18} />
        </span>
        <div className="min-w-0">
          <p className="text-sm font-semibold leading-tight text-warn">
            Auto-suggested starting lineup
          </p>
          <p className="mt-1 text-[13px] leading-relaxed text-ink/85">
            Based on player preferences. Tap any two players to swap them
            between zones or the bench.
            {onFieldCount < effectiveOnFieldTarget &&
              ` Only ${onFieldCount} on field — add late arrivals after kick-off.`}
          </p>
        </div>
      </div>

      {/* ── Players on field selector ────────────────────────────────── */}
      <SFCard>
        <Eyebrow>Players on field</Eyebrow>
        <div className="mt-3 flex flex-wrap gap-1.5">
          {sizeOptions.map((opt) => {
            const active = onFieldSize === opt.value;
            const splitColour = active ? "text-warm/60" : "text-ink-mute";
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => handleSizeChange(opt.value)}
                disabled={isPending}
                className={`inline-flex h-[38px] items-center gap-2 rounded-full border px-3.5 text-[13px] font-semibold transition-colors duration-fast ease-out-quart disabled:opacity-50 ${
                  active
                    ? "border-ink bg-ink text-warm"
                    : "border-hairline bg-surface text-ink hover:bg-surface-alt"
                }`}
              >
                {opt.value}
                <span
                  className={`font-mono text-[10px] font-semibold tracking-[0.06em] ${splitColour}`}
                >
                  ({opt.splits})
                </span>
                {opt.tag === "rec" && (
                  <span className="inline-flex h-4 items-center rounded-full bg-alarm px-1.5 font-mono text-[9px] font-bold tracking-[0.06em] text-white">
                    REC
                  </span>
                )}
              </button>
            );
          })}
        </div>
        <p className="mt-3 text-xs text-ink-mute">
          Drop this when the opposition is short and both teams agree to play
          fewer. Changing it re-suggests the starting lineup.
        </p>
      </SFCard>

      {/* ── Zone + bench cards ───────────────────────────────────────── */}
      <div className="grid gap-3 sm:grid-cols-2">
        {slots.map((slot) => (
          <SFCard key={slot} pad={0} className="overflow-hidden">
            <div className="flex items-center gap-3 border-b border-hairline px-4 py-3">
              <span
                aria-hidden="true"
                className={`block h-5 w-1 rounded-sm ${
                  slot === "bench"
                    ? "bg-ink-mute"
                    : zoneAccent(slot)
                }`}
              />
              <div className="min-w-0 flex-1">
                <h3 className="font-mono text-[11px] font-bold uppercase tracking-micro text-ink">
                  {slotLabel(slot)}
                </h3>
              </div>
              <span
                className={`font-mono text-xs font-semibold tabular-nums ${
                  slot !== "bench" && lineup[slot].length === zoneCaps[slot]
                    ? "text-ink"
                    : "text-ink-mute"
                }`}
              >
                {lineup[slot].length}
                {slot !== "bench" && ` / ${zoneCaps[slot]}`}
              </span>
            </div>
            {lineup[slot].length === 0 ? (
              <p className="px-4 py-3 text-xs text-ink-mute">Empty</p>
            ) : (
              <ul className="divide-y divide-hairline">
                {lineup[slot].map((pid) => {
                  const p = playerById.get(pid);
                  if (!p) return null;
                  const isSelected = selected === pid;
                  return (
                    <li key={pid}>
                      <button
                        type="button"
                        onClick={() => handleTap(pid)}
                        className={`flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm transition-colors duration-fast ease-out-quart ${
                          isSelected
                            ? "bg-brand-50 ring-2 ring-inset ring-brand-500"
                            : "hover:bg-surface-alt"
                        }`}
                      >
                        <Guernsey num={p.jersey_number ?? ""} size={32} />
                        <span className="min-w-0 flex-1 truncate font-medium text-ink">
                          {p.full_name}
                        </span>
                        {isSelected ? (
                          <span className="font-mono text-[10px] font-bold uppercase tracking-[0.1em] text-alarm">
                            Swapping…
                          </span>
                        ) : (
                          <span className="text-ink-mute opacity-60">
                            <SFIcon.swap />
                          </span>
                        )}
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </SFCard>
        ))}
      </div>

      {/* ── Sub interval ─────────────────────────────────────────────── */}
      <SFCard>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <div className="min-w-0 flex-1">
            <Label htmlFor="sub-minutes" className="mb-1">
              Sub interval
            </Label>
            <p className="text-xs text-ink-mute">
              Suggested {suggestedMin} min — {benchCount} on bench,{" "}
              {totalCount} total, ≈{restsPerPlayer(benchCount)} rest
              {restsPerPlayer(benchCount) === 1 ? "" : "s"} each over{" "}
              {gameMinutes} min.
            </p>
          </div>
          <div className="w-full sm:w-24">
            <Input
              id="sub-minutes"
              type="number"
              min={1}
              max={10}
              step={0.5}
              value={subMinInput ?? String(suggestedMin)}
              onChange={(e) => setSubMinInput(e.target.value)}
              disabled={isPending}
            />
          </div>
        </div>
      </SFCard>

      {serverError && (
        <p className="text-sm text-danger" role="alert">
          {serverError}
        </p>
      )}

      {/* ── Sticky availability + Start CTA ──────────────────────────── */}
      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-hairline bg-surface px-4 py-3 shadow-[0_-4px_16px_rgba(26,30,26,0.04)] sm:px-7 sm:py-4">
        <div className="mx-auto flex max-w-4xl items-center justify-between gap-3">
          <div className="flex items-center gap-3 text-xs sm:gap-4">
            <span className="inline-flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-ok" />
              <span className="font-mono font-bold tabular-nums text-ink">
                {onFieldCount}
              </span>
              <span className="text-ink-dim">on field</span>
            </span>
            <span className="h-3.5 w-px bg-hairline" aria-hidden="true" />
            <span className="inline-flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-ink-mute" />
              <span className="font-mono font-bold tabular-nums text-ink">
                {benchCount}
              </span>
              <span className="text-ink-dim">bench</span>
            </span>
          </div>
          <SFButton
            onClick={handleStart}
            disabled={onFieldCount === 0 || isPending}
            variant="primary"
            size="md"
            iconAfter={<SFIcon.chevronRight color="currentColor" />}
          >
            {isPending ? "Starting…" : "Start game"}
          </SFButton>
        </div>
      </div>
    </div>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────

/**
 * Tailwind class for the small accent bar at the left of each zone-card
 * header. Uses our existing colourblind-tested zone tokens.
 */
function zoneAccent(zone: Zone): string {
  switch (zone) {
    case "fwd":
      return "bg-zone-f";
    case "hfwd":
      return "bg-zone-f/70";
    case "mid":
      return "bg-zone-c";
    case "hback":
      return "bg-zone-b/70";
    case "back":
      return "bg-zone-b";
  }
}
