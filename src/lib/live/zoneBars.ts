// ─── Zone-time bars on the live tiles ────────────────────────
// A thin bar along the foot of each kid's tile: their time in each area
// of the ground this game (AFL's forward / centre / back, netball's
// thirds, soccer's lines and goal, league's forwards / vest / backs,
// basketball's guards and forwards). Live v3 took it off the tile; coaches
// missed seeing at a glance who hadn't had a go up forward (Steve,
// 13 Nov 2026), so it's back, as a per-phone preference: on unless a
// coach turns it off, from the live game's menu or Account.
//
// Kept per device in localStorage, like the theme and motion settings:
// the head coach may want the bars while the parent on the game-day link
// wants the plainer field.

import { useEffect, useState } from "react";

export const ZONE_BARS_STORAGE_KEY = "siren-zone-bars-v1";
export const ZONE_BARS_EVENT = "siren:zone-bars-change";

/** On unless this phone said "off". */
export function readZoneBars(): boolean {
  if (typeof window === "undefined") return true;
  try {
    return window.localStorage.getItem(ZONE_BARS_STORAGE_KEY) !== "off";
  } catch {
    // Private-mode Safari and some WebViews throw: the default stands.
    return true;
  }
}

export function writeZoneBars(on: boolean): void {
  if (typeof window === "undefined") return;
  try {
    if (on) window.localStorage.removeItem(ZONE_BARS_STORAGE_KEY);
    else window.localStorage.setItem(ZONE_BARS_STORAGE_KEY, "off");
  } catch {
    // see above
  }
  window.dispatchEvent(new CustomEvent(ZONE_BARS_EVENT));
}

/**
 * Whether this phone shows the bars, kept in step with the menu and
 * Account (and another tab). True on the server and the first render, so
 * both render the same; a phone that turned them off drops them on mount.
 */
export function useZoneBars(): boolean {
  const [on, setOn] = useState(true);
  useEffect(() => {
    const reread = () => setOn(readZoneBars());
    reread();
    const onStorage = (e: StorageEvent) => {
      if (e.key === ZONE_BARS_STORAGE_KEY) reread();
    };
    window.addEventListener(ZONE_BARS_EVENT, reread);
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener(ZONE_BARS_EVENT, reread);
      window.removeEventListener("storage", onStorage);
    };
  }, []);
  return on;
}

// ─── The bar's segments ──────────────────────────────────────

/**
 * Which colour a stretch of the bar takes. The three zone hues by place
 * on the ground, as every sport's old tile drew them: attack is AFL's
 * forward, the middle its centre, defence its back. A keeper is "k"; a
 * format with no positions ("field", "court") is "plain".
 */
export type ZoneTone = "f" | "c" | "b" | "k" | "plain";

export interface ZoneBarSegment {
  /** Stable key: the area's own id. */
  key: string;
  ms: number;
  tone: ZoneTone;
}

/**
 * The segments in the order given, without the empty ones, or null when
 * there's nothing to tell: no time yet, or only time in a format with
 * no areas (a bar of one plain colour says nothing the clock doesn't).
 */
export function zoneBar(parts: ReadonlyArray<ZoneBarSegment>): ZoneBarSegment[] | null {
  const segments = parts.filter((p) => p.ms > 0);
  if (segments.length === 0) return null;
  if (segments.every((s) => s.tone === "plain")) return null;
  return segments;
}

/** AFL: forward (with half-forward), centre, back (with half-back). */
export function aflZoneBar(zm: { fwd: number; hfwd: number; mid: number; hback: number; back: number } | undefined) {
  if (!zm) return null;
  return zoneBar([
    { key: "fwd", ms: zm.fwd + zm.hfwd, tone: "f" },
    { key: "mid", ms: zm.mid, tone: "c" },
    { key: "back", ms: zm.back + zm.hback, tone: "b" },
  ]);
}

/** Netball: the attack, centre and defence thirds. */
export function netballZoneBar(t: { attack: number; centre: number; defence: number } | undefined) {
  if (!t) return null;
  return zoneBar([
    { key: "attack", ms: t.attack, tone: "f" },
    { key: "centre", ms: t.centre, tone: "c" },
    { key: "defence", ms: t.defence, tone: "b" },
  ]);
}

/** Rugby league: forwards, in a vest (the centre share), backs. */
export function leagueZoneBar(zm: { forwards: number; centre: number; backs: number } | undefined) {
  if (!zm) return null;
  return zoneBar([
    { key: "forwards", ms: zm.forwards, tone: "f" },
    { key: "centre", ms: zm.centre, tone: "c" },
    { key: "backs", ms: zm.backs, tone: "b" },
  ]);
}

/** The soccer family: attack, midfield, defence, then goal. */
export function soccerZoneBar(units: Partial<Record<"att" | "mid" | "def" | "field" | "gk", number>> | undefined) {
  if (!units) return null;
  return zoneBar([
    { key: "att", ms: units.att ?? 0, tone: "f" },
    { key: "mid", ms: units.mid ?? 0, tone: "c" },
    { key: "field", ms: units.field ?? 0, tone: "plain" },
    { key: "def", ms: units.def ?? 0, tone: "b" },
    { key: "gk", ms: units.gk ?? 0, tone: "k" },
  ]);
}

/** Basketball: guards, then forwards (the court, with no positions, plain). */
export function basketballZoneBar(lines: Partial<Record<"guard" | "forward" | "court", number>> | undefined) {
  if (!lines) return null;
  return zoneBar([
    { key: "guard", ms: lines.guard ?? 0, tone: "f" },
    { key: "forward", ms: lines.forward ?? 0, tone: "c" },
    { key: "court", ms: lines.court ?? 0, tone: "plain" },
  ]);
}

/** Touch and Oztag: wings, middles, links, as their line colours. */
export function touchZoneBar(lines: Partial<Record<"wing" | "middle" | "link" | "field", number>> | undefined) {
  if (!lines) return null;
  return zoneBar([
    { key: "wing", ms: lines.wing ?? 0, tone: "f" },
    { key: "middle", ms: lines.middle ?? 0, tone: "c" },
    { key: "field", ms: lines.field ?? 0, tone: "plain" },
    { key: "link", ms: lines.link ?? 0, tone: "b" },
  ]);
}
