import { notFound } from "next/navigation";
import { createClient, getUser } from "@/lib/supabase/server";
import { TeamSongSettings } from "@/components/team/TeamSongSettings";
import { TeamNameSettings } from "@/components/team/TeamNameSettings";
import { TrackScoringToggle } from "@/components/games/TrackScoringToggle";
import {
  TeamMembersSettings,
  type MemberRow,
  type PendingInvite,
} from "@/components/team/TeamMembersSettings";
import type { Sport, TeamRole } from "@/lib/types";

interface SettingsPageProps {
  params: { teamId: string };
}

export default async function SettingsPage({ params }: SettingsPageProps) {
  const supabase = createClient();

  const {
    data: { user },
  } = await getUser();

  const [{ data: team }, { data: membership }] = await Promise.all([
    supabase
      .from("teams")
      .select("id, name, sport, track_scoring, song_url, song_start_seconds, song_duration_seconds, song_enabled")
      .eq("id", params.teamId)
      .single(),
    user
      ? supabase
          .from("team_memberships")
          .select("role")
          .eq("team_id", params.teamId)
          .eq("user_id", user.id)
          .single()
      : Promise.resolve({ data: null }),
  ]);

  if (!team) notFound();

  const isAdmin = membership?.role === "admin";
  const sport = ((team.sport as string | null) ?? "afl") as Sport;

  // Members: joined to profiles so we can show names/emails.
  type RawMembership = {
    user_id: string;
    role: TeamRole;
    profiles: { full_name: string | null; email: string | null } | null;
  };
  const { data: rawMembers } = await supabase
    .from("team_memberships")
    .select("user_id, role, profiles(full_name, email)")
    .eq("team_id", params.teamId)
    .returns<RawMembership[]>();

  const members: MemberRow[] = (rawMembers ?? [])
    .map((m) => ({
      user_id: m.user_id,
      role: m.role,
      full_name: m.profiles?.full_name ?? null,
      email: m.profiles?.email ?? null,
      isSelf: !!user && m.user_id === user.id,
    }))
    // Admins first, then GM, then parent; within each, current user last-ish.
    .sort((a, b) => {
      const order: Record<TeamRole, number> = { admin: 0, game_manager: 1, parent: 2 };
      return order[a.role] - order[b.role];
    });

  // Pending invites: only visible to admins via RLS; fine to query
  // unconditionally since non-admins will get an empty array.
  let invites: PendingInvite[] = [];
  if (isAdmin) {
    const { data: rawInvites } = await supabase
      .from("team_invites")
      .select("id, token, role, email_hint, created_at, expires_at")
      .eq("team_id", params.teamId)
      .is("accepted_at", null)
      .is("revoked_at", null)
      .order("created_at", { ascending: false });
    invites = (rawInvites ?? []) as PendingInvite[];
  }

  return (
    <div className="space-y-6">
      <TeamNameSettings
        teamId={params.teamId}
        currentName={team.name}
        isAdmin={isAdmin}
      />
      <TeamMembersSettings
        teamId={params.teamId}
        isAdmin={isAdmin}
        members={members}
        invites={invites}
      />
      <TrackScoringToggle
        teamId={params.teamId}
        initialEnabled={team.track_scoring ?? false}
        isAdmin={isAdmin}
        sportId={sport}
      />
      <TeamSongSettings
        teamId={params.teamId}
        currentSongUrl={team.song_url ?? null}
        currentStartSeconds={team.song_start_seconds ?? 0}
        currentDurationSeconds={team.song_duration_seconds ?? 15}
        currentEnabled={team.song_enabled ?? true}
        isAdmin={isAdmin}
      />
    </div>
  );
}
