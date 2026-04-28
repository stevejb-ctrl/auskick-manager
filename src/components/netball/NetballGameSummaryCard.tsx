"use client";

// ─── Netball Game Summary Card ───────────────────────────────
// Mirrors the AFL GameSummaryCard at src/components/live/
// GameSummaryCard.tsx — same shape, sport-tailored content.
// Renders below the score bug at full time and offers a "Copy
// for group chat" button so a coach can fire the result + per-
// player time-on-court into the team's WhatsApp / Messenger
// thread without rewriting it.
//
// Differences from AFL:
//   • Score is goals-only (no behinds, no points calculation).
//   • Time is bucketed by netball's three thirds (attack /
//     centre / defence) instead of the five AFL zones.
//   • No "subs" line — netball substitutions are period-break-
//     only and the count is implicit in the four quarters.

import { useState } from "react";
import type { Player } from "@/lib/types";
import { type PlayerThirdMs, formatMinSec } from "@/lib/sports/netball/fairness";

interface Props {
  teamName: string;
  opponentName: string;
  /** Track the home-team score by goals only. */
  teamScore: { goals: number };
  opponentScore: { goals: number };
  /** Per-player goals attributed via score events with player_id set. */
  playerGoals: Record<string, number>;
  /** Per-player time spent in each third over the whole game. */
  playerStats: Map<string, PlayerThirdMs>;
  /** Active squad — drives name lookup AND the "N players" line. */
  squad: Player[];
}

const THIRD_LABEL: Record<keyof PlayerThirdMs, string> = {
  attack: "ATK",
  centre: "CEN",
  defence: "DEF",
};

interface PlayerTimeRow {
  id: string;
  name: string;
  totalMs: number;
  /** {label, pct} pairs sorted desc by pct, only thirds with ≥5% time. */
  thirds: { label: string; pct: number }[];
}

function buildPlayerTimes(
  playerStats: Map<string, PlayerThirdMs>,
  squad: Player[],
): PlayerTimeRow[] {
  const byId = new Map(squad.map((p) => [p.id, p]));
  const rows: PlayerTimeRow[] = [];
  playerStats.forEach((stats, id) => {
    const totalMs = stats.attack + stats.centre + stats.defence;
    if (totalMs < 1000) return; // skip never-on-court / negligible-time
    const player = byId.get(id);
    const name = player ? player.full_name.split(/\s+/)[0] : "Unknown";
    const thirds = (Object.keys(THIRD_LABEL) as (keyof PlayerThirdMs)[])
      .map((k) => ({
        label: THIRD_LABEL[k],
        pct: Math.round((stats[k] / totalMs) * 100),
      }))
      .filter((t) => t.pct >= 5)
      .sort((a, b) => b.pct - a.pct);
    rows.push({ id, name, totalMs, thirds });
  });
  return rows.sort((a, b) => b.totalMs - a.totalMs);
}

function buildSummary(
  teamName: string,
  opponentName: string,
  teamScore: { goals: number },
  opponentScore: { goals: number },
  playerGoals: Record<string, number>,
  playerStats: Map<string, PlayerThirdMs>,
  squad: Player[],
): string {
  const lines: string[] = [];

  lines.push(`🏐 Full time — ${teamName} v ${opponentName}`);

  // Result line. Netball is goals-only — no points calculation, no
  // behinds. "def" / "drew with" mirrors AFL's copy so the message
  // reads consistently across sports for coaches who run both.
  if (teamScore.goals > opponentScore.goals) {
    lines.push(
      `${teamName} ${teamScore.goals} def ${opponentName} ${opponentScore.goals}`,
    );
  } else if (opponentScore.goals > teamScore.goals) {
    lines.push(
      `${opponentName} ${opponentScore.goals} def ${teamName} ${teamScore.goals}`,
    );
  } else {
    lines.push(
      `${teamName} ${teamScore.goals} drew with ${opponentName} ${opponentScore.goals}`,
    );
  }

  // Top scorers — only player-attributed goals. Anonymous goals
  // (added via the team-score path) drop out, matching AFL behaviour.
  const byId = new Map(squad.map((p) => [p.id, p]));
  const scorers = Object.entries(playerGoals)
    .filter(([, n]) => n > 0)
    .sort((a, b) => b[1] - a[1])
    .map(([id, n]) => {
      const p = byId.get(id);
      const name = p ? p.full_name.split(/\s+/)[0] : "Unknown";
      return n > 1 ? `${name} ${n}` : name;
    });
  if (scorers.length > 0) {
    lines.push(`\n🥅 Goals: ${scorers.join(", ")}`);
  }

  // Per-player time + third breakdown. Anyone with <1s on court is
  // dropped (they never came on; e.g. squad member who stayed on the
  // bench every quarter has 0 ms accrued).
  const rows = buildPlayerTimes(playerStats, squad);
  // Count of players who actually took the court — drives the
  // "👟 N players" line. Earlier this counted `squad.length` which
  // includes squad members who were marked available but never
  // played a single second (they show up in availableIds via fill-
  // ins or a stale player_arrived event from an earlier session,
  // and the bench strip carries them through). Counting only
  // played-this-game keeps the headline number consistent with the
  // "Game time" rows below it.
  const playedCount = rows.length;
  lines.push(
    `\n👟 ${playedCount} player${playedCount !== 1 ? "s" : ""}`,
  );
  if (rows.length > 0) {
    lines.push(`\n⏱ Game time`);
    for (const r of rows) {
      const thirdStr = r.thirds.map((t) => `${t.label} ${t.pct}%`).join(" · ");
      lines.push(
        `${r.name} — ${formatMinSec(r.totalMs)}${thirdStr ? `  (${thirdStr})` : ""}`,
      );
    }
  }

  return lines.join("\n");
}

export function NetballGameSummaryCard({
  teamName,
  opponentName,
  teamScore,
  opponentScore,
  playerGoals,
  playerStats,
  squad,
}: Props) {
  const [copied, setCopied] = useState(false);

  const summary = buildSummary(
    teamName,
    opponentName,
    teamScore,
    opponentScore,
    playerGoals,
    playerStats,
    squad,
  );

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(summary);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      // Fallback for environments without the Clipboard API — select
      // the rendered text so the coach can long-press and copy.
      const el = document.getElementById("netball-game-summary-text");
      if (el) {
        const range = document.createRange();
        range.selectNodeContents(el);
        window.getSelection()?.removeAllRanges();
        window.getSelection()?.addRange(range);
      }
    }
  }

  return (
    <div className="animate-slide-up rounded-md border border-hairline bg-surface p-4 shadow-card">
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
        id="netball-game-summary-text"
        className="select-all whitespace-pre-wrap rounded-md bg-surface-alt px-3 py-2.5 font-sans text-sm leading-relaxed text-ink-dim"
      >
        {summary}
      </pre>
      <p className="mt-2 text-xs text-ink-mute">
        Tap the text to select it, or use the button above.
      </p>
    </div>
  );
}
