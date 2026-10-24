import type { Metadata } from "next";
import { Suspense } from "react";
import { LoginScreen } from "@/components/auth/LoginScreen";
import type { JoinStory } from "@/components/auth/LoginForm";
import { loginContextFor } from "@/lib/auth/loginContext";
import { inviteState } from "@/lib/invites/inviteState";
import { createAdminClient } from "@/lib/supabase/admin";
import { ROLE_LABEL } from "@/lib/roles";
import type { TeamRole } from "@/lib/types";

export const metadata: Metadata = {
  alternates: { canonical: "/login" },
};

/**
 * Unified email-first login. Rendered full-bleed — the (auth) layout
 * is a pass-through, so this page owns the entire viewport.
 *
 * Suspense wraps the screen because the inner LoginForm uses
 * useSearchParams (to honour `?next=`) and Next.js requires a
 * Suspense boundary for that hook on statically-prerendered pages.
 *
 * Reached from an invite (?next=/join/<token>) or the team-code page,
 * it tells the joining story ("Join Hawthorn Hornets", as a Manager)
 * instead of the coach's "you'll set up a team" (round 2 usability,
 * 24 Oct 2026).
 */
export default async function LoginPage({ searchParams }: { searchParams?: { next?: string } }) {
  const join = await joinStoryFor(searchParams?.next);
  return (
    <Suspense fallback={null}>
      <LoginScreen join={join} />
    </Suspense>
  );
}

async function joinStoryFor(next: string | undefined): Promise<JoinStory | null> {
  if (!next) return null;
  const context = loginContextFor(next);
  if (context.kind === "code") return { teamName: null, roleLabel: ROLE_LABEL.parent };
  if (context.kind !== "invite") return null;
  // The join page shows an open invite's team and role to anyone with
  // the link; a used or cancelled one says so there, so here it's just
  // "your team".
  const admin = createAdminClient();
  const { data: invite } = await admin
    .from("team_invites")
    .select("team_id, role, accepted_at, revoked_at, expires_at")
    .eq("token", context.token)
    .maybeSingle();
  if (!invite || inviteState(invite) !== "open") return { teamName: null, roleLabel: null };
  const { data: team } = await admin.from("teams").select("name").eq("id", invite.team_id).maybeSingle();
  return { teamName: team?.name ?? null, roleLabel: ROLE_LABEL[invite.role as TeamRole] ?? null };
}
