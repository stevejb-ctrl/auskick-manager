"use client";

// ─── LeagueGameSummaryCard ───────────────────────────────────
// Post-finalise share card. Mirrors AFL's `GameSummaryCard`
// shape — same selectable pre, same brand "Copy for group chat"
// button, same arrival-pulse halo on first mount.
//
// The share text is RL-shaped:
//   * Header: 🏉 Full time — Us v Them
//   * Result line: "Us 38 def Them 6"
//   * Tries: "🏉 Tries: Bryson (2), Mossy, India D…"
//   * Conversions: "🥾 Conversions: Bryson 2/2, Mossy 0/1…"
//   * Game time: per-player time-on-field
//
// Read-only — once mounted, the game is in `completed` status and
// the live shell stops accepting writes. Same UX as AFL.

import { useState } from "react";
import { SirenPulseHalo } from "@/components/brand/SirenPulseHalo";
import { playerMsOnField } from "@/lib/sports/rugby_league/fairness";
import type { GameEvent, Player } from "@/lib/types";
import type { LeagueGameState } from "@/lib/sports/rugby_league/fairness";

interface LeagueGameSummaryCardProps {
  state: LeagueGameState;
  events: GameEvent[];
  squad: Player[];
  trackScoring: boolean;
  teamName: string;
  opponentName: string;
  /** ms elapsed at full-time — used to close any open time-on-field stints. */
  finalisedElapsedMs: number;
  /** Optional arrival-pulse halo on first mount (live page = yes, detail page = no). */
  showArrivalPulse?: boolean;
}

function fmtMs(ms: number): string {
  const totalSec = Math.max(0, Math.round(ms / 1000));
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function buildSummary(
  teamName: string,
  opponentName: string,
  trackScoring: boolean,
  state: LeagueGameState,
  events: GameEvent[],
  squad: Player[],
  finalisedElapsedMs: number,
): string {
  const lines: string[] = [];
  const playersById = new Map(squad.map((p) => [p.id, p]));
  const firstName = (full: string) => full.split(" ")[0];

  lines.push(`🏉 Full time — ${teamName} v ${opponentName}`);

  if (trackScoring) {
    const us = state.teamScore.points;
    const them = state.opponentScore.points;
    const usFmt
      = `${us} (${state.teamScore.tries}T · ${state.teamScore.conversions}C)`;
    const themFmt
      = `${them} (${state.opponentScore.tries}T · ${state.opponentScore.conversions}C)`;
    if (us > them) {
      lines.push(`${teamName} ${usFmt} def ${opponentName} ${themFmt}`);
    } else if (them > us) {
      lines.push(`${opponentName} ${themFmt} def ${teamName} ${usFmt}`);
    } else {
      lines.push(
        `${teamName} ${usFmt} drew with ${opponentName} ${themFmt}`,
      );
    }

    const triesByPlayer = state.playerTries ?? {};
    const tryScorers = Object.entries(triesByPlayer)
      .filter(([, n]) => n > 0)
      .sort((a, b) => b[1] - a[1])
      .map(([id, n]) => {
        const p = playersById.get(id);
        const name = p ? firstName(p.full_name) : "Unknown";
        const jersey
          = p?.jersey_number != null ? ` (#${p.jersey_number})` : "";
        return `${name}${jersey}${n > 1 ? ` ×${n}` : ""}`;
      });
    if (tryScorers.length > 0) {
      lines.push(`\n🏉 Tries: ${tryScorers.join(", ")}`);
    }

    const conv = state.playerConversions ?? {};
    const kickers = Object.entries(conv)
      .filter(([, c]) => c.attempts > 0)
      .sort((a, b) => b[1].made - a[1].made || b[1].attempts - a[1].attempts)
      .map(([id, c]) => {
        const p = playersById.get(id);
        const name = p ? firstName(p.full_name) : "Unknown";
        const jersey
          = p?.jersey_number != null ? ` (#${p.jersey_number})` : "";
        return `${name}${jersey} ${c.made}/${c.attempts}`;
      });
    if (kickers.length > 0) {
      lines.push(`🥾 Conversions: ${kickers.join(", ")}`);
    }
  }

  // Game-time block — totals per player. Walks the event log via the
  // same helper the live tile uses so the numbers match what the
  // coach saw on the field. `currentQuarter` argument doesn't matter
  // for a finalised game; pass 0 and the helper won't extend any
  // open stints (all are already closed by quarter_end events).
  const totalMs = playerMsOnField(
    events,
    state.currentQuarter,
    finalisedElapsedMs,
  );
  const playerRows = Object.entries(totalMs)
    .filter(([, ms]) => ms >= 1000)
    .sort((a, b) => b[1] - a[1])
    .map(([id, ms]) => {
      const p = playersById.get(id);
      const name = p ? firstName(p.full_name) : "Unknown";
      const jersey
        = p?.jersey_number != null ? `#${p.jersey_number} ` : "";
      return `${jersey}${name} — ${fmtMs(ms)}`;
    });

  if (playerRows.length > 0) {
    lines.push(`\n⏱ Game time`);
    for (const row of playerRows) lines.push(row);
  }

  return lines.join("\n");
}

export function LeagueGameSummaryCard({
  state,
  events,
  squad,
  trackScoring,
  teamName,
  opponentName,
  finalisedElapsedMs,
  showArrivalPulse = false,
}: LeagueGameSummaryCardProps) {
  const [copied, setCopied] = useState(false);

  const summary = buildSummary(
    teamName,
    opponentName,
    trackScoring,
    state,
    events,
    squad,
    finalisedElapsedMs,
  );

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(summary);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      // Clipboard API not available — select text as fallback.
      const el = document.getElementById("league-game-summary-text");
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
      className={`rounded-md border border-hairline bg-surface p-4 shadow-card ${
        showArrivalPulse ? "animate-slide-up" : ""
      }`}
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
        id="league-game-summary-text"
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
