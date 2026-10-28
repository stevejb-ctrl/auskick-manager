"use client";

// ─── LiveFixScoresButton ─────────────────────────────────────
// Fix scores mid-quarter, every sport: take a score off, change who
// scored, add a missed one. Undo only takes back the latest score, so a
// wrong one from earlier stayed until the break, or until after the game
// (usability pass, 26 Oct 2026). It opens the game page's own
// FixScoresDialog, with the log read fresh each time (loadScoreFix): the
// live screens keep scores in their own stores, not as a log. Sits in
// LiveAdminUtilityRow, for the team's coaches, and for the game-day link
// while the game is on (Stagehand round 7, 28 Oct 2026: a runner had to
// undo a right score to reach a wrong one).

import { useState, useTransition } from "react";
import { SFButton } from "@/components/sf";
import { FixScoresDialog, type FixScoresProps } from "@/components/games/FixScoresDialog";
import { loadScoreFix, loadScoreFixFromLink } from "@/app/(app)/teams/[teamId]/games/[gameId]/actions";
import { InlineAlert } from "@/components/ui/InlineAlert";
import type { LiveAuth } from "@/lib/types";

export function LiveFixScoresButton({ auth, gameId }: { auth: LiveAuth; gameId: string }) {
  const [fix, setFix] = useState<FixScoresProps | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function load() {
    setError(null);
    startTransition(async () => {
      const res = await (auth.kind === "token" ? loadScoreFixFromLink(auth.token, gameId) : loadScoreFix(auth.teamId, gameId)).catch(
        () => ({ success: false as const, error: "Couldn't load the scores — try again." }),
      );
      if (!res.success) setError(res.error);
      else setFix(res.data ?? null);
    });
  }

  return (
    <>
      <SFButton size="md" variant="ghost" onClick={load} loading={isPending && !fix} data-testid="live-fix-scores">
        Fix scores
      </SFButton>
      {error && <InlineAlert className="mt-2">{error}</InlineAlert>}
      {fix && <FixScoresDialog {...fix} onFixed={load} onClose={() => setFix(null)} />}
    </>
  );
}
