import Link from "next/link";
import { unstable_noStore as noStore } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { AcceptInviteButton } from "./AcceptInviteButton";
import { ROLE_LABEL, ROLE_SUMMARY } from "@/lib/roles";
import type { TeamInvite } from "@/lib/types";

export const dynamic = "force-dynamic";

interface JoinPageProps {
  params: { token: string };
}

export default async function JoinPage({ params }: JoinPageProps) {
  noStore();
  const admin = createAdminClient();

  const { data: invite } = await admin
    .from("team_invites")
    .select("*")
    .eq("token", params.token)
    .maybeSingle();

  if (!invite) return <InviteShell>{renderBadState("This invite link isn't valid.")}</InviteShell>;
  const inv = invite as TeamInvite;

  if (inv.revoked_at)
    return <InviteShell>{renderBadState("This invite has been revoked.")}</InviteShell>;

  if (new Date(inv.expires_at) < new Date())
    return <InviteShell>{renderBadState("This invite has expired.")}</InviteShell>;

  const { data: team } = await admin
    .from("teams")
    .select("id, name")
    .eq("id", inv.team_id)
    .single();
  const teamName = team?.name ?? "a team";

  // Check logged-in user + existing membership.
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    const nextPath = `/join/${params.token}`;
    return (
      <InviteShell>
        <InviteHeader teamName={teamName} role={inv.role} />
        <p className="text-sm text-ink-dim">
          Sign in or create an account to join this team.
        </p>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Link
            href={`/login?next=${encodeURIComponent(nextPath)}`}
            className="inline-flex flex-1 items-center justify-center rounded-md bg-brand-600 px-4 py-2 text-sm font-medium text-warm transition-colors duration-fast ease-out-quart hover:bg-brand-700"
          >
            Sign in
          </Link>
          <Link
            href={`/signup?next=${encodeURIComponent(nextPath)}`}
            className="inline-flex flex-1 items-center justify-center rounded-md border border-hairline bg-surface px-4 py-2 text-sm font-medium text-ink transition-colors duration-fast ease-out-quart hover:bg-surface-alt"
          >
            Create account
          </Link>
        </div>
      </InviteShell>
    );
  }

  // Already a member?
  const { data: existing } = await admin
    .from("team_memberships")
    .select("role")
    .eq("team_id", inv.team_id)
    .eq("user_id", user.id)
    .maybeSingle();

  if (existing) {
    return (
      <InviteShell>
        <InviteHeader teamName={teamName} role={inv.role} />
        <p className="text-sm text-ink-dim">
          You&rsquo;re already a member of {teamName}.
        </p>
        <Link
          href={`/teams/${inv.team_id}`}
          className="inline-flex items-center justify-center rounded-md bg-brand-600 px-4 py-2 text-sm font-medium text-warm transition-colors duration-fast ease-out-quart hover:bg-brand-700"
        >
          Go to team →
        </Link>
      </InviteShell>
    );
  }

  return (
    <InviteShell>
      <InviteHeader teamName={teamName} role={inv.role} />
      <AcceptInviteButton token={params.token} />
    </InviteShell>
  );
}

function InviteShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-[70vh] items-center justify-center bg-warm p-4">
      <div className="w-full max-w-md space-y-4 rounded-lg border border-hairline bg-surface p-6 shadow-card">
        {children}
      </div>
    </div>
  );
}

function InviteHeader({
  teamName,
  role,
}: {
  teamName: string;
  role: TeamInvite["role"];
}) {
  return (
    <div className="space-y-2">
      <p className="text-xs font-bold uppercase tracking-micro text-brand-700">
        Team invitation
      </p>
      <h1 className="text-xl font-semibold text-ink">
        Join {teamName} as {ROLE_LABEL[role]}
      </h1>
      <p className="text-sm text-ink-dim">{ROLE_SUMMARY[role]}</p>
    </div>
  );
}

function renderBadState(message: string) {
  return (
    <div className="space-y-3">
      <p className="text-xs font-bold uppercase tracking-micro text-ink-mute">
        Invite unavailable
      </p>
      <p className="text-sm text-ink">{message}</p>
      <Link
        href="/dashboard"
        className="inline-flex items-center text-sm font-medium text-brand-700 transition-colors duration-fast ease-out-quart hover:text-brand-800"
      >
        Go to dashboard →
      </Link>
    </div>
  );
}
