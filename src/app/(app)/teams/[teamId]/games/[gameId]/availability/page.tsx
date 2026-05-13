import { Suspense } from "react";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient, getUser } from "@/lib/supabase/server";
import { AvailabilityList } from "@/components/games/AvailabilityList";
import { Spinner } from "@/components/ui/Spinner";
import { Eyebrow, SFButton, SFCard, SFIcon } from "@/components/sf";
import type { Game, Sport } from "@/lib/types";

interface AvailabilityPageProps {
  params: { teamId: string; gameId: string };
}

// First step of the pre-game two-step flow:
//   1. /games/[id]/availability  ← THIS PAGE: mark who's playing
//   2. /games/[id]/live           ← lineup picker → live game
//
// Previously the availability list lived inline on the game detail
// page below the action buttons. Steve 2026-05-13 split it into its
// own step so the coach explicitly confirms the roster before
// stepping into the lineup-picker, mirroring the way Saturday-
// morning team-talks actually unfold (who's here → who plays where).
export default async function AvailabilityPage({
  params,
}: AvailabilityPageProps) {
  const supabase = createClient();
  const {
    data: { user },
  } = await getUser();

  const [{ data: game }, { data: membership }, { data: team }] =
    await Promise.all([
      supabase
        .from("games")
        .select("*")
        .eq("id", params.gameId)
        .eq("team_id", params.teamId)
        .single(),
      user
        ? supabase
            .from("team_memberships")
            .select("role")
            .eq("team_id", params.teamId)
            .eq("user_id", user.id)
            .single()
        : Promise.resolve({ data: null }),
      supabase
        .from("teams")
        .select("sport")
        .eq("id", params.teamId)
        .single(),
    ]);

  if (!game) notFound();

  const g = game as Game;

  // Availability is only meaningful for upcoming games — once kickoff
  // happens the lineup is locked and unavailability conversions happen
  // through the in-game injury / fill-in flow instead. If a coach
  // navigates here mid-game, bounce them to live so they don't get
  // confused by a roster screen that can't do anything.
  if (g.status !== "upcoming") {
    redirect(`/teams/${params.teamId}/games/${params.gameId}/live`);
  }

  const role = membership?.role;
  const canManageMatch = role === "admin" || role === "game_manager";
  const canMarkAvailability = !!role;
  const sport: Sport = (team as { sport?: Sport } | null)?.sport ?? "afl";

  return (
    <div className="space-y-6 pb-32">
      <Link
        href={`/teams/${params.teamId}/games/${params.gameId}`}
        className="inline-flex items-center gap-1 text-sm font-medium text-ink-dim transition-colors duration-fast ease-out-quart hover:text-ink"
      >
        <SFIcon.chevronLeft />
        Back to game
      </Link>

      <SFCard>
        <Eyebrow>Step 1 of 2</Eyebrow>
        <h1 className="mt-1.5 text-2xl font-bold tracking-tightest text-ink">
          Mark availability
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-ink-dim">
          Tap each player to mark them in, out, or maybe. You can
          change this any time before kickoff.
        </p>
      </SFCard>

      <Suspense
        fallback={
          <div className="flex justify-center py-12">
            <Spinner size="lg" />
          </div>
        }
      >
        <AvailabilityList
          auth={{ kind: "team", teamId: params.teamId }}
          teamId={params.teamId}
          gameId={params.gameId}
          canMarkAvailability={canMarkAvailability}
          canManageMatch={canManageMatch}
          showJerseyNumber={sport !== "netball"}
        />
      </Suspense>

      {/* Sticky CTA to the next step. Mirrors the LineupPicker's own
          sticky kickoff bar so the two-step flow feels like a single
          forward-momentum journey. Hidden for parents (no role) — they
          can only view, not advance. */}
      {canManageMatch && (
        <div className="fixed inset-x-0 bottom-0 z-30 border-t border-hairline bg-surface px-4 pt-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] shadow-[0_-4px_16px_rgba(26,30,26,0.04)] sm:px-7 sm:pt-4">
          <div className="mx-auto max-w-4xl">
            <SFButton
              href={`/teams/${params.teamId}/games/${params.gameId}/live`}
              variant="primary"
              size="lg"
              full
              iconAfter={<SFIcon.chevronRight color="currentColor" />}
            >
              Continue to lineup
            </SFButton>
          </div>
        </div>
      )}
    </div>
  );
}
