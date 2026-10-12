import { Suspense } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { PlayerList } from "@/components/squad/PlayerList";
import { Spinner } from "@/components/ui/Spinner";

interface SquadPageProps {
  params: { teamId: string };
}

export default async function SquadPage({ params }: SquadPageProps) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  let isAdmin = false;
  if (user) {
    const { data: membership } = await supabase
      .from("team_memberships")
      .select("role")
      .eq("team_id", params.teamId)
      .eq("user_id", user.id)
      .single();
    isAdmin = membership?.role === "admin";
    // Parents follow the team read-only — no squad screen (UX plan §6).
    if (membership?.role === "parent") redirect(`/teams/${params.teamId}`);
  }

  return (
    <Suspense
      fallback={
        <div className="flex justify-center py-12">
          <Spinner size="lg" />
        </div>
      }
    >
      <PlayerList teamId={params.teamId} isAdmin={isAdmin} />
    </Suspense>
  );
}
