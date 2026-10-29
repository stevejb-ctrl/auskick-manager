import { Suspense } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { PlayerList } from "@/components/squad/PlayerList";
import { Spinner } from "@/components/ui/Spinner";
import { ReadOnlyNote, MANAGER_CAN } from "@/components/team/ReadOnlyNote";

interface SquadPageProps {
  params: { teamId: string };
}

export default async function SquadPage({ params }: SquadPageProps) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  let isAdmin = false;
  let isManager = false;
  if (user) {
    const { data: membership } = await supabase
      .from("team_memberships")
      .select("role")
      .eq("team_id", params.teamId)
      .eq("user_id", user.id)
      .single();
    isAdmin = membership?.role === "admin";
    isManager = membership?.role === "game_manager";
    // Parents follow the team read-only — no squad screen (UX plan §6).
    if (membership?.role === "parent") redirect(`/teams/${params.teamId}?coachOnly=squad`);
  }

  return (
    <div className="space-y-4">
      {isManager && (
        <ReadOnlyNote>Only the coach can change the squad. {MANAGER_CAN}</ReadOnlyNote>
      )}
      <Suspense
        fallback={
          <div className="flex justify-center py-12">
            <Spinner size="lg" />
          </div>
        }
      >
        <PlayerList teamId={params.teamId} isAdmin={isAdmin} />
      </Suspense>
    </div>
  );
}
