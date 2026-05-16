import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient, getUser } from "@/lib/supabase/server";
import { Badge } from "@/components/ui/Badge";
import { Eyebrow, SFCard, SFIcon } from "@/components/sf";
import { DeleteAccountSection } from "@/components/account/DeleteAccountSection";
import { ROLE_LABEL } from "@/lib/roles";
import type { TeamRole } from "@/lib/types";

// Force dynamic — the page reads the user's profile + deletion
// schedule. Even though that's a tiny query, we don't want stale
// scheduled-deletion state served from the Vercel CDN.
export const dynamic = "force-dynamic";

interface ProfileRow {
  full_name: string | null;
  email: string;
  deletion_scheduled_for: string | null;
}

interface MembershipWithTeam {
  role: TeamRole;
  teams: { id: string; name: string } | null;
}

/**
 * /account — user-level settings landing page.
 *
 * Two responsibilities:
 *   1. Show the user who they're signed in as (email + name + team list).
 *      Mirrors the data the admin /admin/users/[profileId] page surfaces
 *      to super-admins, scoped to the current user.
 *   2. House the account-deletion flow (Apple guideline 5.1.1(v)).
 *      The destructive affordance is gated behind a type-to-confirm
 *      modal and surfaces consequences (sole-admin teams that will be
 *      deleted vs teams the user will simply leave).
 */
export default async function AccountPage() {
  const {
    data: { user },
  } = await getUser();
  if (!user) redirect("/login");

  const supabase = createClient();
  const [{ data: profile }, { data: memberships }] = await Promise.all([
    supabase
      .from("profiles")
      .select("full_name, email, deletion_scheduled_for")
      .eq("id", user.id)
      .maybeSingle<ProfileRow>(),
    supabase
      .from("team_memberships")
      .select("role, teams(id, name)")
      .eq("user_id", user.id)
      .returns<MembershipWithTeam[]>(),
  ]);

  const teams = (memberships ?? []).flatMap((m) =>
    m.teams ? [{ ...m.teams, role: m.role }] : [],
  );

  // For each team the user admins, look up the total admin count so
  // we can classify it as "sole admin → gets deleted with the account"
  // vs "co-admin → just gets left". One round-trip for all of them via
  // a single `in (...)` query.
  const adminTeamIds = teams
    .filter((t) => t.role === "admin")
    .map((t) => t.id);
  const adminCounts: Record<string, number> = {};
  if (adminTeamIds.length > 0) {
    const { data: rows } = await supabase
      .from("team_memberships")
      .select("team_id")
      .in("team_id", adminTeamIds)
      .eq("role", "admin");
    for (const r of (rows ?? []) as { team_id: string }[]) {
      adminCounts[r.team_id] = (adminCounts[r.team_id] ?? 0) + 1;
    }
  }

  const soleAdminTeams = teams.filter(
    (t) => t.role === "admin" && (adminCounts[t.id] ?? 0) <= 1,
  );
  const soleAdminIds = new Set(soleAdminTeams.map((t) => t.id));
  const memberTeams = teams.filter((t) => !soleAdminIds.has(t.id));

  return (
    <div className="space-y-6">
      <header>
        <Link
          href="/dashboard"
          className="inline-flex items-center gap-1 text-sm font-medium text-ink-dim transition-colors duration-fast ease-out-quart hover:text-ink"
        >
          <SFIcon.chevronLeft />
          Back
        </Link>
        <Eyebrow className="mt-4">Settings</Eyebrow>
        <h1 className="mt-1.5 text-3xl font-bold tracking-tightest text-ink">
          My account
        </h1>
      </header>

      <SFCard>
        <dl className="space-y-3 text-sm">
          <div>
            <dt className="font-mono text-[11px] font-semibold uppercase tracking-micro text-ink-dim">
              Email
            </dt>
            <dd className="mt-1 break-all text-ink">
              {profile?.email ?? user.email}
            </dd>
          </div>
          <div>
            <dt className="font-mono text-[11px] font-semibold uppercase tracking-micro text-ink-dim">
              Name
            </dt>
            <dd className="mt-1 text-ink">
              {profile?.full_name || (
                <span className="text-ink-mute">Not set</span>
              )}
            </dd>
          </div>
        </dl>
      </SFCard>

      <section className="space-y-2">
        <Eyebrow>Your teams</Eyebrow>
        {teams.length === 0 ? (
          <p className="rounded-lg border border-dashed border-hairline bg-surface-alt px-4 py-4 text-sm text-ink-mute">
            You&apos;re not on any teams.
          </p>
        ) : (
          <SFCard pad={0}>
            <ul className="divide-y divide-hairline">
              {teams.map((t) => (
                <li
                  key={t.id}
                  className="flex items-center justify-between gap-3 px-4 py-3 text-sm"
                >
                  <span className="truncate font-medium text-ink">
                    {t.name}
                  </span>
                  <Badge variant={t.role}>{ROLE_LABEL[t.role]}</Badge>
                </li>
              ))}
            </ul>
          </SFCard>
        )}
      </section>

      <DeleteAccountSection
        scheduledFor={profile?.deletion_scheduled_for ?? null}
        soleAdminTeams={soleAdminTeams.map((t) => ({
          id: t.id,
          name: t.name,
        }))}
        memberTeams={memberTeams.map((t) => ({
          id: t.id,
          name: t.name,
          role: t.role,
        }))}
      />
    </div>
  );
}
