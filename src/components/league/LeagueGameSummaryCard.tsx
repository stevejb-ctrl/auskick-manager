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

import { SirenPulseHalo } from "@/components/brand/SirenPulseHalo";
import { sidelinedAtEnd, summaryStatusNote } from "@/lib/live/wentHome";
import { CopyableTextBlock } from "@/components/ui/CopyableTextBlock";
import { leagueScoreLine, playerMsOnField, rugbyPoints, rugbyScoreWords } from "@/lib/sports/rugby_league/fairness";
import type { RugbySport } from "@/lib/sports/registry";
import type { GameEvent, Player } from "@/lib/types";
import { shortName, shortNames } from "@/lib/names";
import type { LeagueGameState } from "@/lib/sports/rugby_league/fairness";
import { DIDNT_GET_ON, didntGetOn, presentPlayerIds } from "@/lib/live/presentPlayers";
import { byJerseyThenName } from "@/lib/share/neutralOrder";

interface LeagueGameSummaryCardProps {
  /** The team's rugby sport: its goal names and points. */
  sport: RugbySport;
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
  sport: RugbySport,
  teamName: string,
  opponentName: string,
  trackScoring: boolean,
  state: LeagueGameState,
  events: GameEvent[],
  squad: Player[],
  finalisedElapsedMs: number,
): string {
  const lines: string[] = [];
  // Kids still off at full time say why: hurt, or gone home.
  const sidelined = sidelinedAtEnd(events);
  const words = rugbyScoreWords(sport);
  const points = rugbyPoints(sport);
  const playersById = new Map(squad.map((p) => [p.id, p]));
  // Two Jacks read "Jack S" and "Jack M" (the number is printed beside them).
  const short = shortNames(squad, "first", { numberShown: true });
  const nameOf = (p: Player) => short.get(p.id) ?? shortName(p.full_name);

  lines.push(`🏉 Full time — ${teamName} v ${opponentName}`);

  if (trackScoring) {
    const us = state.teamScore.points;
    const them = state.opponentScore.points;
    const usFmt = `${us} (${leagueScoreLine(state.teamScore, words)})`;
    const themFmt = `${them} (${leagueScoreLine(state.opponentScore, words)})`;
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
        const name = p ? nameOf(p) : "Unknown";
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
        const name = p ? nameOf(p) : "Unknown";
        const jersey
          = p?.jersey_number != null ? ` (#${p.jersey_number})` : "";
        return `${name}${jersey} ${c.made}/${c.attempts}`;
      });
    if (kickers.length > 0) {
      lines.push(`🥾 Conversions: ${kickers.join(", ")}`);
    }

    // Penalty and field (drop) goals, by kicker, most points first.
    const goalPoints = (g: { penalty: number; field: number }) => g.penalty * points.penaltyGoal + g.field * points.fieldGoal;
    const goalKickers = Object.entries(state.playerGoals ?? {})
      .filter(([, g]) => g.penalty + g.field > 0)
      .sort((a, b) => goalPoints(b[1]) - goalPoints(a[1]))
      .map(([id, g]) => {
        const p = playersById.get(id);
        const name = p ? nameOf(p) : "Unknown";
        const jersey
          = p?.jersey_number != null ? ` (#${p.jersey_number})` : "";
        const bits = [
          g.penalty > 0 ? `${g.penalty} ${words.penaltyGoal.short}` : null,
          g.field > 0 ? `${g.field} ${words.fieldGoal.short}` : null,
        ].filter(Boolean);
        return `${name}${jersey} ${bits.join(", ")}`;
      });
    if (goalKickers.length > 0) {
      lines.push(`🎯 Goals: ${goalKickers.join(", ")}`);
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
    .map(([id, ms]) => {
      const p = playersById.get(id);
      const name = p ? nameOf(p) : "Unknown";
      const jersey
        = p?.jersey_number != null ? `#${p.jersey_number} ` : "";
      return { id, text: `${jersey}${name} — ${fmtMs(ms)}${summaryStatusNote(id, sidelined)}` };
    });

  // Kids who were there but never got on stay in the list (Stagehand
  // round 3: the one How we played flagged was missing).
  const played = Object.entries(totalMs).filter(([, ms]) => ms >= 1000).map(([id]) => id);
  for (const id of didntGetOn(presentPlayerIds(events), played)) {
    const p = playersById.get(id);
    if (!p) continue;
    const jersey = p.jersey_number != null ? `#${p.jersey_number} ` : "";
    playerRows.push({ id, text: `${jersey}${nameOf(p)} — ${DIDNT_GET_ON}` });
  }

  if (playerRows.length > 0) {
    lines.push(`\n⏱ Game time`);
    // By number, never by minutes: this goes to every parent.
    for (const row of playerRows.sort(byJerseyThenName((r) => playersById.get(r.id)))) lines.push(row.text);
  }

  return lines.join("\n");
}

export function LeagueGameSummaryCard({
  sport,
  state,
  events,
  squad,
  trackScoring,
  teamName,
  opponentName,
  finalisedElapsedMs,
  showArrivalPulse = false,
}: LeagueGameSummaryCardProps) {
  const summary = buildSummary(
    sport,
    teamName,
    opponentName,
    trackScoring,
    state,
    events,
    squad,
    finalisedElapsedMs,
  );

  const card = (
    <div
      className={`rounded-md border border-hairline bg-surface p-4 shadow-card ${
        showArrivalPulse ? "animate-slide-up" : ""
      }`}
    >
      <CopyableTextBlock
        title="Game summary"
        text={summary}
        textId="league-game-summary-text"
      />
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
