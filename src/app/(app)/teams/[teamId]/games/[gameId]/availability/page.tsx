import { Suspense } from "react";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient, getUser } from "@/lib/supabase/server";
import { AvailabilityList } from "@/components/games/AvailabilityList";
import { ContinueToLineupButton } from "@/components/games/ContinueToLineupButton";
import { AskAvailabilityButton } from "@/components/games/AskAvailabilityButton";
import { Spinner } from "@/components/ui/Spinner";
import { SFCard, SFIcon } from "@/components/sf";
import type { Game, Sport } from "@/lib/types";
import { BackLink } from "@/components/ui/BackLink";
import { getSportConfig, teamSport } from "@/lib/sports";
import { teamSportById } from "@/lib/sports/teamSportById";

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
        .select("sport, name")
        .eq("id", params.teamId)
        .single(),
    ]);

  if (!game) {
    // RLS denies reads to non-members, so a logged-in user landing
    // on someone else's deep-link gets `game = null` — same outcome
    // as a truly missing row. For authenticated users bounce to
    // dashboard so they can pick a team they actually belong to;
    // unauthenticated callers still get the 404 (don't leak whether
    // the row exists). Steve 2026-05-19: post-login UX, super-admin
    // landed on a Not Found page after re-auth.
    if (user) redirect("/dashboard");
    notFound();
  }

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
  const sport: Sport = team ? teamSport((team as { sport?: Sport }).sport) : ((await teamSportById(params.teamId)) ?? notFound());

  return (
    <div className="space-y-6 pb-32">
      <BackLink href={`/teams/${params.teamId}/games/${params.gameId}`} label="Back to game" />

      <SFCard>
        <h1 className="text-2xl font-bold tracking-tightest text-ink">
          Mark availability
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-ink-dim">
          {canManageMatch
            ? "Mark each player In or Out, or ask parents to. You can change this any time before the game starts, or add late arrivals once it's under way."
            : "Tap In or Out for your child. You can change it any time before the game starts."}
        </p>
        {canManageMatch && g.availability_token && (
          <div className="mt-3">
            <AskAvailabilityButton
              teamName={(team as { name?: string } | null)?.name ?? "Us"}
              opponent={g.opponent}
              scheduledAt={g.scheduled_at}
              token={g.availability_token}
              className="w-full sm:w-auto"
            />
          </div>
        )}
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
          canMarkAllIn={canManageMatch}
          showReplies={canManageMatch}
          showJerseyNumber={getSportConfig(sport).jerseyNumbers}
        />
      </Suspense>

      {/* Sticky CTA to the next step. Mirrors the LineupPicker's own
          sticky kickoff bar so the two-step flow feels like a single
          forward-momentum journey. Hidden for parents (no role) — they
          can only view, not advance.

          ContinueToLineupButton is a client component that wraps the
          navigation in useTransition so the button shows the brand
          pulse + "Loading lineup…" during the ~2s it takes /live's
          server component to await its DB stack. Without that
          feedback the tap reads as unresponsive (Steve 2026-05-13). */}
      {canManageMatch && (
        <div className="fixed inset-x-0 bottom-0 z-30 border-t border-hairline bg-surface px-4 pt-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] shadow-[0_-4px_16px_rgba(26,30,26,0.04)] sm:px-7 sm:pt-4">
          <div className="mx-auto max-w-4xl">
            <ContinueToLineupButton
              teamId={params.teamId}
              gameId={params.gameId}
            />
          </div>
        </div>
      )}
    </div>
  );
}
