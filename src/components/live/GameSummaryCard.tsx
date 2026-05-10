"use client";

import { useState } from "react";
import { useLiveGame, type ZoneMs } from "@/lib/stores/liveGameStore";
import { ALL_ZONES } from "@/lib/fairness";
import type { Player } from "@/lib/types";
import { SirenPulseHalo } from "@/components/brand/SirenPulseHalo";

const ZONE_ABBREV: Record<string, string> = {
  back: "BCK",
  hback: "H-BCK",
  mid: "CEN",
  hfwd: "H-FWD",
  fwd: "FWD",
};

function pts(s: { goals: number; behinds: number }) {
  return s.goals * 6 + s.behinds;
}

function fmtScore(s: { goals: number; behinds: number }) {
  return `${s.goals}.${s.behinds} (${pts(s)})`;
}

function fmtMs(ms: number): string {
  const totalSec = Math.round(ms / 1000);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

interface PlayerStat {
  id: string;
  name: string;
  number: number | null;
  totalMs: number;
  zones: { label: string; pct: number }[];
}

// Permissive subset of the Player type — we only need name +
// jersey number to render. Lets the detail page pass a slimmer
// row shape (DB SELECT projection) without dragging the full
// type along.
type PlayerLike = Pick<Player, "id" | "full_name" | "jersey_number">;

function buildPlayerStats(
  basePlayedZoneMs: Record<string, ZoneMs>,
  playersById: Map<string, PlayerLike>,
): PlayerStat[] {
  const stats: PlayerStat[] = [];
  for (const [id, zm] of Object.entries(basePlayedZoneMs)) {
    const totalMs = ALL_ZONES.reduce((sum, z) => sum + zm[z], 0);
    if (totalMs < 1000) continue; // skip players with negligible on-field time
    const p = playersById.get(id);
    const zones = ALL_ZONES.map((z) => ({
      label: ZONE_ABBREV[z] ?? z,
      pct: Math.round((zm[z] / totalMs) * 100),
    }))
      .filter((z) => z.pct >= 5)
      .sort((a, b) => b.pct - a.pct);
    stats.push({
      id,
      name: p ? p.full_name.split(" ")[0] : "Unknown",
      number: p?.jersey_number ?? null,
      totalMs,
      zones,
    });
  }
  return stats.sort((a, b) => b.totalMs - a.totalMs);
}

function buildSummary(
  teamName: string,
  opponentName: string,
  trackScoring: boolean,
  teamScore: { goals: number; behinds: number },
  opponentScore: { goals: number; behinds: number },
  playerScores: Record<string, { goals: number; behinds: number }>,
  playersById: Map<string, PlayerLike>,
  swapCount: number,
  basePlayedZoneMs: Record<string, ZoneMs>,
): string {
  const lines: string[] = [];

  lines.push(`🏉 Full time — ${teamName} v ${opponentName}`);

  if (trackScoring) {
    const tp = pts(teamScore);
    const op = pts(opponentScore);
    if (tp > op) {
      lines.push(
        `${teamName} ${fmtScore(teamScore)} def ${opponentName} ${fmtScore(opponentScore)}`,
      );
    } else if (op > tp) {
      lines.push(
        `${opponentName} ${fmtScore(opponentScore)} def ${teamName} ${fmtScore(teamScore)}`,
      );
    } else {
      lines.push(
        `${teamName} ${fmtScore(teamScore)} drew with ${opponentName} ${fmtScore(opponentScore)}`,
      );
    }

    // Per-player scorer line — AFL boxscore style "Name g.b". Earlier
    // filter was `s.goals > 0` and the format was "Name 2", so a
    // player who kicked 3 goals AND 1 behind read just "Name 3" and
    // a player with rushed-only behinds disappeared from the share
    // text. Both are real Saturday-game scenarios. Now: include
    // anyone with goals OR behinds, render g.b, sort by total
    // points descending so the leading scorer comes first.
    const scorers = Object.entries(playerScores)
      .filter(([, s]) => s.goals > 0 || s.behinds > 0)
      .sort((a, b) => pts(b[1]) - pts(a[1]) || b[1].goals - a[1].goals)
      .map(([id, s]) => {
        const p = playersById.get(id);
        const jerseyTag =
          p?.jersey_number != null ? ` (#${p.jersey_number})` : "";
        const name = p ? `${p.full_name.split(" ")[0]}${jerseyTag}` : "Unknown";
        return `${name} ${s.goals}.${s.behinds}`;
      });

    if (scorers.length > 0) {
      lines.push(`\n⚽ Scorers: ${scorers.join(", ")}`);
    }
  }

  // Derive the headline player count from buildPlayerStats so it matches
  // the per-player rows below — i.e. only players who actually got on the
  // field count. Earlier this was `squadPlayers.length` from the call site,
  // which over-counted when a squad member was marked available but never
  // came on (e.g. lent to opp before kickoff, or set up but not played).
  const playerStats = buildPlayerStats(basePlayedZoneMs, playersById);
  const playedCount = playerStats.length;

  const stats: string[] = [
    `${playedCount} player${playedCount !== 1 ? "s" : ""}`,
  ];
  if (swapCount > 0) stats.push(`${swapCount} subs`);
  lines.push(`\n👟 ${stats.join(" · ")}`);

  if (playerStats.length > 0) {
    lines.push(`\n⏱ Game time`);
    for (const ps of playerStats) {
      const zoneStr = ps.zones.map((z) => `${z.label} ${z.pct}%`).join(" · ");
      const prefix = ps.number != null ? `#${ps.number} ` : "";
      lines.push(
        `${prefix}${ps.name} — ${fmtMs(ps.totalMs)}${zoneStr ? `  (${zoneStr})` : ""}`,
      );
    }
  }

  return lines.join("\n");
}

// ─── Pure view ──────────────────────────────────────────────────
// Takes all the data it renders as props. Used by both:
//   • GameSummaryCard (live page) — wraps with the live store
//   • CompletedGameSummary (game-detail page) — wraps with
//     server-computed replayGame() output
// Splitting it this way means the share-text format stays in one
// place and both surfaces always read identically.

export interface GameSummaryViewProps {
  teamName: string;
  opponentName: string;
  trackScoring: boolean;
  teamScore: { goals: number; behinds: number };
  opponentScore: { goals: number; behinds: number };
  playerScores: Record<string, { goals: number; behinds: number }>;
  playersById: Map<string, PlayerLike>;
  swapCount: number;
  basePlayedZoneMs: Record<string, ZoneMs>;
  /**
   * Whether to wrap with SirenPulseHalo (the "final siren" arrival
   * pulse). The live page mounts this card the moment full time
   * lands so the halo is in scope; the detail page renders for an
   * already-completed game and the halo would be confusing — set
   * false there.
   */
  showArrivalPulse?: boolean;
}

export function GameSummaryView({
  teamName,
  opponentName,
  trackScoring,
  teamScore,
  opponentScore,
  playerScores,
  playersById,
  swapCount,
  basePlayedZoneMs,
  showArrivalPulse = false,
}: GameSummaryViewProps) {
  const [copied, setCopied] = useState(false);

  const summary = buildSummary(
    teamName,
    opponentName,
    trackScoring,
    teamScore,
    opponentScore,
    playerScores,
    playersById,
    swapCount,
    basePlayedZoneMs,
  );

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(summary);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      // Clipboard API not available — select text as fallback
      const el = document.getElementById("game-summary-text");
      if (el) {
        const range = document.createRange();
        range.selectNodeContents(el);
        window.getSelection()?.removeAllRanges();
        window.getSelection()?.addRange(range);
      }
    }
  }

  const card = (
    <div
      className={`rounded-md border border-hairline bg-surface p-4 shadow-card ${showArrivalPulse ? "animate-slide-up" : ""}`}
    >
      <div className="mb-3 flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-ink">Game summary</h3>
        <button
          type="button"
          onClick={handleCopy}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-md bg-brand-600 px-3 py-1.5 text-xs font-semibold text-warm transition-colors duration-fast ease-out-quart hover:bg-brand-700 active:bg-brand-800"
        >
          {copied ? "✓ Copied!" : "Copy for group chat"}
        </button>
      </div>
      <pre
        id="game-summary-text"
        className="select-all whitespace-pre-wrap rounded-md bg-surface-alt px-3 py-2.5 font-sans text-sm leading-relaxed text-ink-dim"
      >
        {summary}
      </pre>
      <p className="mt-2 text-xs text-ink-mute">
        Tap the text to select it, or use the button above.
      </p>
    </div>
  );

  if (!showArrivalPulse) return card;

  return (
    <SirenPulseHalo
      triggerKey="ft"
      size="lg"
      display="block"
      className="rounded-md"
    >
      {card}
    </SirenPulseHalo>
  );
}

// ─── Live-page wrapper ───────────────────────────────────────────
// Existing call site at LiveGame.tsx — pulls scoreboard / player
// scores / zone time from the live store. The arrival pulse only
// fires here (the live page mounts this at the FT moment).

interface GameSummaryCardProps {
  teamName: string;
  opponentName: string;
  trackScoring: boolean;
  playersById: Map<string, Player>;
}

export function GameSummaryCard({
  teamName,
  opponentName,
  trackScoring,
  playersById,
}: GameSummaryCardProps) {
  const teamScore = useLiveGame((s) => s.teamScore);
  const opponentScore = useLiveGame((s) => s.opponentScore);
  const playerScores = useLiveGame((s) => s.playerScores);
  const swapCount = useLiveGame((s) => s.swapCount);
  const basePlayedZoneMs = useLiveGame((s) => s.basePlayedZoneMs);

  return (
    <GameSummaryView
      teamName={teamName}
      opponentName={opponentName}
      trackScoring={trackScoring}
      teamScore={teamScore}
      opponentScore={opponentScore}
      playerScores={playerScores}
      playersById={playersById}
      swapCount={swapCount}
      basePlayedZoneMs={basePlayedZoneMs}
      showArrivalPulse
    />
  );
}
