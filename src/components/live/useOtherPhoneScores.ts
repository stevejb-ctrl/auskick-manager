"use client";

// ─── useOtherPhoneScores ─────────────────────────────────────
// Says when a score comes in from another phone on this game (Stagehand
// round 8, #6: two parents each undid the other's goals as mistakes).
// Every live screen passes its score events; the notice is LiveSync's,
// the one that already says "Another phone already ended Q1".

import { useEffect, useRef } from "react";
import { newOtherPhoneScores, otherPhoneNoticesQuiet, otherPhoneScoreText } from "@/lib/live/otherPhone";
import { useLiveNotice } from "@/lib/live/liveSync";
import { useSquadNames } from "@/components/live/SquadNames";

type ScoreEvent = {
  id: string;
  type: string;
  created_at: string;
  idempotency_key?: string | null;
  player_id?: string | null;
};

/** Up twice as long as a sync notice: it's news, and easy to miss mid-play. */
const OTHER_PHONE_NOTICE_MS = 12_000;

export function useOtherPhoneScores(
  events: readonly ScoreEvent[],
  scoreTypes: ReadonlySet<string>,
  names: { teamName: string; opponentName: string },
): void {
  const squad = useSquadNames();
  const seen = useRef<Set<string> | null>(null);
  const since = useRef(new Date().toISOString());
  useEffect(() => {
    // The first render's scores are the game so far: seen, not news.
    if (seen.current === null) {
      seen.current = new Set(events.filter((e) => scoreTypes.has(e.type)).map((e) => e.id));
      return;
    }
    const fresh = newOtherPhoneScores(events, scoreTypes, seen.current, since.current);
    if (fresh.length === 0 || otherPhoneNoticesQuiet()) return;
    const last = fresh[fresh.length - 1];
    const scorer = last.player_id ? squad.byId(last.player_id) : null;
    useLiveNotice.getState().show(otherPhoneScoreText(last.type, names, scorer), OTHER_PHONE_NOTICE_MS);
  }, [events, scoreTypes, names, squad]);
}
