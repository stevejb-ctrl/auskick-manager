import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { TeamNav } from "@/components/team/TeamNav";

interface TeamLayoutProps {
  children: React.ReactNode;
  params: { teamId: string };
}

export default async function TeamLayout({ children, params }: TeamLayoutProps) {
  const supabase = createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect(`/login?next=/teams/${params.teamId}`);
  }

  // Fetch team + membership via service-role client.  The RLS-backed
  // cookie-client SELECT was intermittently returning null for freshly
  // created teams right after the server-action redirect out of
  // createTeam, which caused `notFound()` to fire on this layout
  // BEFORE the setup page even ran — the real source of the onboarding
  // redirect loop.  We bypass RLS here and gate access with an explicit
  // team_memberships lookup; downstream mutations are still guarded by
  // is_team_admin() in their server actions.
  const adminClient = createAdminClient();

  const [{ data: team }, { data: membership }] = await Promise.all([
    adminClient
      .from("teams")
      .select("name")
      .eq("id", params.teamId)
      .maybeSingle(),
    adminClient
      .from("team_memberships")
      .select("role")
      .eq("team_id", params.teamId)
      .eq("user_id", user.id)
      .maybeSingle(),
  ]);

  console.log("[TeamLayout] fetch", {
    teamId: params.teamId,
    userId: user.id,
    hasTeam: !!team,
    hasMembership: !!membership,
  });

  if (!team || !membership) {
    notFound();
  }

  return (
    <div className="space-y-6">
      <TeamNav teamId={params.teamId} teamName={team.name} />
      {children}
    </div>
  );
}
