"use client";

import { useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { ActionSheet, type ActionSheetAction } from "@/components/ui/ActionSheet";
import { Modal } from "@/components/ui/Modal";
import { InlineAlert } from "@/components/ui/InlineAlert";
import { SFButton } from "@/components/sf";
import { SlotFillSheet } from "@/components/ui/SlotFillSheet";
import { FeedbackModal } from "@/components/feedback/FeedbackModal";
import { GameDayLinkDialog } from "@/components/games/GameDayLinkDialog";
import { ResetGameDialog } from "@/components/games/ResetGameButton";
import { LiveGameSettingsModal } from "@/components/live/LiveGameSettingsButton";
import { setTrackScoring } from "@/app/(app)/teams/[teamId]/games/actions";
import type { Game, LiveAuth, Player } from "@/lib/types";
import { useZoneBars, writeZoneBars } from "@/lib/live/zoneBars";

// ─── LiveGameMenu (⋯) ────────────────────────────────────────
// Live v3's game menu, opened from ⋯ in the top bar. Everything the
// utility row under the field and the top bar's icons used to hold,
// found in one place (LiveAdminUtilityRow goes, for AFL first):
//
//   End Q2 / End 1st half        in play: the same confirm as the clock's
//   + Add late arrival           who's not in the lineup yet
//   Game settings                the sub interval, players on the field
//   Scores and fixes             (or Turn scoring on, team admin only)
//   Plan Q{n+1}                  in the quarter's last sub window
//   Hide / Show time bars        the bar under each kid, this phone only
//   How the live screen works    the walkthrough, for every sport
//   Send feedback                signed-in coaches
//   Game-day link                team admin, on their own screen only
//   Restart game                 team admin, two steps
//   Edit lineup                  before kickoff: back to the picker
//
// Team admin means a signed-in admin of the team: never a game manager,
// and never the game-day link (which can't restart a game or hand out
// its own link, and has nobody's settings to change).
//
// The sheet closes before an item runs (ActionSheet), so the dialog an
// item opens never stacks on it. Those dialogs live here, so the menu
// stays mounted while the screen is up.

type Dialog = "late" | "settings" | "feedback" | "link" | "restart" | null;

export interface LiveGameMenuProps {
  open: boolean;
  onClose: () => void;
  auth: LiveAuth;
  gameId: string;
  game: Game;
  /** The team's admin (the coach's page passes the membership's role). */
  isAdmin: boolean;
  /** Under "vs X": "Round 6 · Team admin". */
  subline: string;
  /** The game is over: no late arrival, settings or restart. */
  finished?: boolean;
  /** Squad kids not in the game yet. */
  lateCandidates?: Player[];
  onLateArrival?: (playerId: string) => void;
  latePending?: boolean;
  /** Game settings, and the line under it ("Sub every 3 min · 12 on the field"). */
  settings?: {
    summary: string;
    subIntervalSeconds: number;
    currentOnFieldSize?: number;
    minOnFieldSize?: number;
    maxOnFieldSize?: number;
    playersById?: Map<string, Player>;
  };
  trackScoring: boolean;
  /** Opens Scores and fixes. Omit while there's nothing to fix (before kickoff). */
  onScores?: () => void;
  /**
   * "End Q2" / "End 1st half" (lib/sports/words endPeriodWords), while a
   * period is in play: opens the sport's end confirm. Parents looked
   * here for it and only found it behind the clock (Stagehand round 9).
   */
  endPeriod?: { label: string; description: string; onSelect: () => void };
  /** "Plan Q3", when the quarter's in its last sub window. */
  planNext?: { label: string; onOpen: () => void };
  onWalkthrough: () => void;
  /** Before kickoff: back to the lineup picker with the saved lineup. */
  onEditLineup?: () => void;
  /**
   * A sport's own settings sheet in place of the shared one (rugby's:
   * the sub interval in seconds, §6, forward and back time).
   */
  settingsDialog?: (onClose: () => void) => ReactNode;
}

export function LiveGameMenu({
  open,
  onClose,
  auth,
  gameId,
  game,
  isAdmin: isAdminProp,
  subline,
  finished = false,
  lateCandidates = [],
  onLateArrival,
  latePending = false,
  settings,
  trackScoring,
  onScores,
  planNext,
  endPeriod,
  onWalkthrough,
  onEditLineup,
  settingsDialog,
}: LiveGameMenuProps) {
  const router = useRouter();
  const zoneBars = useZoneBars();
  const [dialog, setDialog] = useState<Dialog>(null);
  const [scoringError, setScoringError] = useState<string | null>(null);
  const [turningOn, startTurningOn] = useTransition();
  // A signed-in team admin on their own screen: not a game manager, and
  // not the game-day link (whose page passes isAdmin to run the game).
  const teamAdmin = isAdminProp && auth.kind === "team";
  const teamId = auth.kind === "team" ? auth.teamId : null;

  function turnScoringOn() {
    if (!teamId) return;
    setScoringError(null);
    startTurningOn(async () => {
      const result = await setTrackScoring(teamId, true).catch(() => ({
        success: false as const,
        error: "Couldn't turn it on — try again.",
      }));
      if (!result.success) setScoringError(result.error || "Couldn't turn it on — try again.");
      else router.refresh();
    });
  }

  const actions: ActionSheetAction[] = [];
  // First: the game's next step. Still behind the confirm, so a stray
  // tap ends nothing.
  if (!finished && endPeriod) {
    actions.push({ id: "end-period", label: endPeriod.label, description: endPeriod.description, testId: "menu-end-period", onSelect: endPeriod.onSelect });
  }
  if (!finished && lateCandidates.length > 0 && onLateArrival) {
    const names = lateCandidates.map((p) => p.full_name.trim().split(/\s+/)[0]);
    actions.push({
      id: "late",
      label: "+ Add late arrival",
      description: `${names.slice(0, 3).join(", ")}${names.length > 3 ? ` and ${names.length - 3} more` : ""} not in the lineup yet`,
      disabled: latePending,
      onSelect: () => setDialog("late"),
    });
  }
  if (!finished && settings) {
    actions.push({ id: "settings", label: "Game settings", description: settings.summary, onSelect: () => setDialog("settings") });
  }
  if (trackScoring && onScores) {
    actions.push({
      id: "scores",
      label: "Scores and fixes",
      description: "Q-by-Q, take a score off, add a missed one",
      testId: "live-fix-scores",
      onSelect: onScores,
    });
  } else if (!trackScoring && teamAdmin) {
    actions.push({
      id: "scoring-on",
      label: turningOn ? "Turning scoring on…" : "Turn scoring on",
      description: "Team setting: every game keeps score from now",
      disabled: turningOn,
      onSelect: turnScoringOn,
    });
  }
  if (planNext) {
    actions.push({ id: "plan", label: planNext.label, description: "Pin the next lineup before the break", onSelect: planNext.onOpen });
  }
  // This phone's choice, kept with it (lib/live/zoneBars); the same
  // switch is on Account.
  actions.push({
    id: "zone-bars",
    label: zoneBars ? "Hide time bars" : "Show time bars",
    description: zoneBars
      ? "The bar under each kid: their time in each area. This phone only."
      : "Each kid's time in each area, under their name. This phone only.",
    testId: "menu-zone-bars",
    onSelect: () => writeZoneBars(!zoneBars),
  });
  actions.push({ id: "walk", label: "How the live screen works", description: "A one-minute tour", onSelect: onWalkthrough });
  // Feedback is a signed-in coach's (submitFeedback needs an account).
  if (auth.kind === "team") {
    actions.push({ id: "feedback", label: "Send feedback", description: "Tell the Siren team what got in the way", onSelect: () => setDialog("feedback") });
  }
  if (teamAdmin && !finished && game.share_token) {
    actions.push({ id: "link", label: "Game-day link", description: "Let another parent run the clock", onSelect: () => setDialog("link") });
  }
  if (onEditLineup) {
    actions.push({ id: "edit-lineup", label: "Edit lineup", description: "Back to the lineup, before the first siren", onSelect: onEditLineup });
  }
  if (teamAdmin && !finished) {
    actions.push({
      id: "restart",
      label: "Restart game",
      description: "Wipes this game. Team admin only.",
      tone: "danger",
      onSelect: () => setDialog("restart"),
    });
  }

  return (
    <>
      {open && (
        <ActionSheet
          eyebrow="Game menu"
          label="Game menu"
          title={`vs ${game.opponent}`}
          subtitle={
            <>
              {subline}
              {!teamAdmin && (
                <span className="mt-1 block text-xs text-ink-mute">
                  Restart game, game-day links and turning scoring on are for team admins.
                </span>
              )}
            </>
          }
          actions={actions}
          onClose={onClose}
        />
      )}

      {dialog === "late" && onLateArrival && (
        <SlotFillSheet
          slotLabel="late arrival"
          titleVerb="Add"
          subtitle="Pick a squad member who's just turned up. They'll be added to the bench and the suggester will work them into the next rotation."
          emptyMessage="No squad members left to add — everyone is already in the game."
          candidates={lateCandidates.map((p) => ({ id: p.id, name: p.full_name, jerseyNumber: p.jersey_number }))}
          onPick={(playerId) => {
            onLateArrival(playerId);
            setDialog(null);
          }}
          onCancel={() => setDialog(null)}
          dismissOnBackdrop
        />
      )}

      {dialog === "settings" && settings && settingsDialog && settingsDialog(() => setDialog(null))}
      {dialog === "settings" && settings && !settingsDialog && (
        <LiveGameSettingsModal
          auth={auth}
          gameId={gameId}
          subIntervalSeconds={settings.subIntervalSeconds}
          currentOnFieldSize={settings.currentOnFieldSize}
          minOnFieldSize={settings.minOnFieldSize}
          maxOnFieldSize={settings.maxOnFieldSize}
          playersById={settings.playersById}
          onClose={() => setDialog(null)}
        />
      )}

      <FeedbackModal kind="feedback" open={dialog === "feedback"} onClose={() => setDialog(null)} />

      {dialog === "link" && teamId && (
        <GameDayLinkDialog token={game.share_token} replace={{ teamId, gameId }} onClose={() => setDialog(null)} />
      )}

      {dialog === "restart" && <ResetGameDialog auth={auth} gameId={gameId} onClose={() => setDialog(null)} />}

      {scoringError && (
        <Modal onClose={() => setScoringError(null)} label="Scoring is still off">
          <h2 className="text-lg font-bold text-ink">Scoring is still off</h2>
          <InlineAlert className="mt-3">{scoringError}</InlineAlert>
          <SFButton className="mt-4" variant="ghost" size="md" full onClick={() => setScoringError(null)}>
            OK
          </SFButton>
        </Modal>
      )}
    </>
  );
}

/** "Sub every 3 min · 12 on the field": the line under Game settings (lib/live/subIntervalText). */
export { settingsSummary } from "@/lib/live/subIntervalText";
