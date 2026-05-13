"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { SFButton, SFIcon } from "@/components/sf";

interface ContinueToLineupButtonProps {
  teamId: string;
  gameId: string;
}

// The "Continue to lineup" CTA on the availability page used to be
// a plain <SFButton href> (a Next.js Link). On Steve's phone the
// transition to /live takes ~2s because /live's server component
// awaits a stack of DB queries (game + team + events + season
// aggregates). During that window Next.js App Router keeps the
// OLD availability UI painted — React's startTransition behaviour
// for soft nav under a shared parent boundary — so the user gets
// no feedback at all that anything is happening.
//
// The team-level loading.tsx fallback doesn't help here: it only
// fires when the team segment itself is entered fresh, not when
// the leaf inside it swaps from one sibling to another.
//
// Fix: client-side router.push wrapped in useTransition so the
// button itself shows the brand pulse + "Loading lineup…" while
// the RSC payload streams in. Same pattern as ResetGameButton
// and the "Ready for Qx" kickoff buttons — button-local pending
// state is the codebase's established feedback signal.
export function ContinueToLineupButton({
  teamId,
  gameId,
}: ContinueToLineupButtonProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function handleClick() {
    startTransition(() => {
      router.push(`/teams/${teamId}/games/${gameId}/live`);
    });
  }

  return (
    <SFButton
      type="button"
      variant="primary"
      size="lg"
      full
      onClick={handleClick}
      loading={isPending}
      // Hide the trailing chevron while loading — the PulseDot in
      // the leading slot is the busy signal, and the text swap
      // confirms it.
      iconAfter={
        isPending ? undefined : <SFIcon.chevronRight color="currentColor" />
      }
    >
      {isPending ? "Loading lineup…" : "Continue to lineup"}
    </SFButton>
  );
}
