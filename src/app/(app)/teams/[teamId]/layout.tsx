import { Suspense } from "react";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getUser } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { TeamNav } from "@/components/team/TeamNav";
import { TeamBottomBar } from "@/components/team/TeamBottomBar";
import { JoinedNotice } from "@/components/team/JoinedNotice";
import { SFButton, SFCard } from "@/components/sf";

interface TeamLayoutProps {
  children: React.ReactNode;
  params: { teamId: string };
}

export default async function TeamLayout({ children, params }: TeamLayoutProps) {
  const {
    data: { user },
  } = await getUser();

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

  if (!team) {
    notFound();
  }

  // Someone who was removed, or left, used to get a bare "Not found"
  // mid-action. Say what happened instead (without naming the team to
  // someone who isn't on it).
  if (!membership) {
    return <NotOnTeam />;
  }

  return (
    <div className="space-y-6">
      <TeamNav teamId={params.teamId} teamName={team.name} role={membership.role} />
      <Suspense fallback={null}>
        <JoinedNotice teamName={team.name} />
      </Suspense>
      {children}
      <TeamBottomBar teamId={params.teamId} role={membership.role} />
    </div>
  );
}

function NotOnTeam() {
  return (
    <div className="mx-auto max-w-md py-8">
      <SFCard>
        <h1 className="text-xl font-bold tracking-tightest text-ink">You&rsquo;re not on this team</h1>
        <p className="mt-2 text-sm leading-relaxed text-ink-dim">
          If you left it, or the coach removed you, you no longer have access. To
          come back, ask the coach for a new invite, or join with the team code.
        </p>
        <div className="mt-4 flex flex-col gap-2 sm:flex-row">
          <SFButton href="/dashboard?list=1" variant="primary">
            My teams
          </SFButton>
          <Link
            href="/join-team"
            className="inline-flex items-center justify-center rounded-md border border-hairline px-4 py-2 text-sm font-medium text-ink transition-colors duration-fast ease-out-quart hover:bg-surface-alt"
          >
            Join with a code
          </Link>
        </div>
      </SFCard>
    </div>
  );
}
