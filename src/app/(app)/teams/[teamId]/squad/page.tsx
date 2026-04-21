import { Suspense } from "react";
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
