"use client";

import { useState } from "react";
import { useLiveGame, type ZoneMs } from "@/lib/stores/liveGameStore";
import { ALL_ZONES } from "@/lib/fairness";
import type { Player } from "@/lib/types";

interface GameSummaryCardProps {
  teamName: string;
  opponentName: string;
  trackScoring: boolean;
  playersById: Map<string, Player>;
  playerCount: number;
}

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
  number: number;
  totalMs: number;
  zones: { label: string; pct: number }[];
}

function buildPlayerStats(
  basePlayedZoneMs: Record<string, ZoneMs>,
  playersById: Map<string, Player>
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
      number: p?.jersey_number ?? 0,
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
  playersById: Map<string, Player>,
  playerCount: number,
  swapCount: number,
  basePlayedZoneMs: Record<string, ZoneMs>
): string {
  const lines: string[] = [];

  lines.push(`🏉 Full time — ${teamName} v ${opponentName}`);

  if (trackScoring) {
    const tp = pts(teamScore);
    const op = pts(opponentScore);
    if (tp > op) {
      lines.push(
        `${teamName} ${fmtScore(teamScore)} def ${opponentName} ${fmtScore(opponentScore)}`
      );
    } else if (op > tp) {
      lines.push(
        `${opponentName} ${fmtScore(opponentScore)} def ${teamName} ${fmtScore(teamScore)}`
      );
    } else {
      lines.push(
        `${teamName} ${fmtScore(teamScore)} drew with ${opponentName} ${fmtScore(opponentScore)}`
      );
    }

    const kickers = Object.entries(playerScores)
      .filter(([, s]) => s.goals > 0)
      .sort((a, b) => b[1].goals - a[1].goals || b[1].behinds - a[1].behinds)
      .map(([id, s]) => {
        const p = playersById.get(id);
        const name = p
          ? `${p.full_name.split(" ")[0]} (#${p.jersey_number})`
          : "Unknown";
        return s.goals > 1 ? `${name} ${s.goals}` : name;
      });

    if (kickers.length > 0) {
      lines.push(`\n⚽ Goals: ${kickers.join(", ")}`);
    }
  }

  const stats: string[] = [`${playerCount} player${playerCount !== 1 ? "s" : ""}`];
  if (swapCount > 0) stats.push(`${swapCount} subs`);
  lines.push(`\n👟 ${stats.join(" · ")}`);

  const playerStats = buildPlayerStats(basePlayedZoneMs, playersById);
  if (playerStats.length > 0) {
    lines.push(`\n⏱ Game time`);
    for (const ps of playerStats) {
      const zoneStr = ps.zones.map((z) => `${z.label} ${z.pct}%`).join(" · ");
      lines.push(`#${ps.number} ${ps.name} — ${fmtMs(ps.totalMs)}${zoneStr ? `  (${zoneStr})` : ""}`);
    }
  }

  return lines.join("\n");
}

export function GameSummaryCard({
  teamName,
  opponentName,
  trackScoring,
  playersById,
  playerCount,
}: GameSummaryCardProps) {
  const teamScore = useLiveGame((s) => s.teamScore);
  const opponentScore = useLiveGame((s) => s.opponentScore);
  const playerScores = useLiveGame((s) => s.playerScores);
  const swapCount = useLiveGame((s) => s.swapCount);
  const basePlayedZoneMs = useLiveGame((s) => s.basePlayedZoneMs);

  const [copied, setCopied] = useState(false);

  const summary = buildSummary(
    teamName,
    opponentName,
    trackScoring,
    teamScore,
    opponentScore,
    playerScores,
    playersById,
    playerCount,
    swapCount,
    basePlayedZoneMs
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

  return (
    <div className="animate-slide-up rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-gray-900">Game summary</h3>
        <button
          type="button"
          onClick={handleCopy}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-md bg-brand-600 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-brand-700 active:bg-brand-800"
        >
          {copied ? "✓ Copied!" : "Copy for group chat"}
        </button>
      </div>
      <pre
        id="game-summary-text"
        className="select-all whitespace-pre-wrap rounded-md bg-gray-50 px-3 py-2.5 font-sans text-sm leading-relaxed text-gray-700"
      >
        {summary}
      </pre>
      <p className="mt-2 text-xs text-gray-400">
        Tap the text to select it, or use the button above.
      </p>
    </div>
  );
}
