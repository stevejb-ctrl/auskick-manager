import { notFound, redirect } from "next/navigation";
import { createClient, getUser } from "@/lib/supabase/server";
import { TeamSongSettings } from "@/components/team/TeamSongSettings";
import { TeamNameSettings } from "@/components/team/TeamNameSettings";
import { CohortChipsSettings } from "@/components/team/CohortChipsSettings";
import { QuarterLengthInput } from "@/components/team/QuarterLengthInput";
import { MidQuarterSubsToggle } from "@/components/team/MidQuarterSubsToggle";
import { UnbrokenPeriodsToggle } from "@/components/team/UnbrokenPeriodsToggle";
import { TrackZoneTimeToggle } from "@/components/team/TrackZoneTimeToggle";
import { TrackScoringToggle } from "@/components/games/TrackScoringToggle";
import { SettingsSection } from "@/components/team/SettingsSection";
import { AgeGroupSettings } from "@/components/team/AgeGroupSettings";
import { DangerZone } from "@/components/team/DangerZone";
import {
  HowWePlayCard,
  type HowWePlayPosition,
  type HowWePlayRow,
} from "@/components/playbook/HowWePlayCard";
import {
  TeamMembersSettings,
  type MemberRow,
  type PendingInvite,
} from "@/components/team/TeamMembersSettings";
import { getAgeGroupConfig, getSportConfig } from "@/lib/sports";
import { normalizeChipMode } from "@/lib/chips";
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
      .select("id, name, sport, age_group, track_scoring, quarter_length_seconds, allow_mid_quarter_subs, enforce_unbroken_periods, track_zone_time, song_url, song_start_seconds, song_duration_seconds, song_enabled, chip_a_label, chip_b_label, chip_c_label, chip_a_mode, chip_b_mode, chip_c_mode")
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
  // Parents follow the team read-only — no Team tab (UX plan §6).
  if (membership?.role === "parent") redirect(`/teams/${params.teamId}`);

  // Read `join_code` in its own query so a deploy that beats the
  // migration to prod still renders the rest of the page. Migration
  // 0041 added the column; if it hasn't been applied yet the SELECT
  // errors and we keep joinCode = null. JoinCodeSection already
  // renders only when joinCode is non-null, so the panel just
  // doesn't appear until the migration is in. Once 0041 is applied
  // everywhere this two-step can be inlined back into the SELECT
  // above.
  let joinCode: string | null = null;
  const { data: codeRow } = await supabase
    .from("teams")
    .select("join_code")
    .eq("id", params.teamId)
    .maybeSingle();
  if (codeRow) {
    joinCode = (codeRow as { join_code?: string | null }).join_code ?? null;
  }

  const isAdmin = membership?.role === "admin";
  const sport = ((team.sport as string | null) ?? "afl") as Sport;

  // Members: joined to profiles so we can show names/emails.
  // team_memberships has two FKs to profiles (user_id, invited_by), so
  // the embed must name the user_id FK — an unqualified profiles(...)
  // is ambiguous (PGRST201) and returns no rows at all.
  type RawMembership = {
    user_id: string;
    role: TeamRole;
    profiles: { full_name: string | null; email: string | null } | null;
  };
  const { data: rawMembers } = await supabase
    .from("team_memberships")
    .select("user_id, role, profiles!team_memberships_user_id_fkey(full_name, email)")
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
      .select(
        "id, token, role, email_hint, invited_email, email_sent_at, email_send_count, created_at, expires_at"
      )
      .eq("team_id", params.teamId)
      .is("accepted_at", null)
      .is("revoked_at", null)
      .order("created_at", { ascending: false });
    invites = (rawInvites ?? []) as PendingInvite[];
  }

  const ageGroupCfg = getAgeGroupConfig(sport, (team as { age_group?: string | null }).age_group ?? null);
  const [{ data: playbookRow }, { data: positionRows }, { data: squadRows }] = await Promise.all([
    supabase
      .from("team_playbooks")
      .select("strategy, policy_overrides, season_balance, season_balance_since, rules, vest_strategy")
      .eq("team_id", params.teamId)
      .maybeSingle(),
    supabase
      .from("team_positions")
      .select("id, label, name, line, sort, archived_at")
      .eq("team_id", params.teamId)
      .is("archived_at", null)
      .order("sort"),
    supabase
      .from("players")
      .select("id, full_name")
      .eq("team_id", params.teamId)
      .eq("is_active", true)
      .order("full_name"),
  ]);
  const ageOptions = getSportConfig(sport).ageGroups.map((a) => ({ id: a.id, label: a.label, notes: a.notes }));

  // Team tab sections (UX plan §6 "Where each setting goes"): what the
  // coach changes about how the team plays, who's on it, the season, the
  // game-day extras, and the danger zone — instead of one long stack.
  return (
    <div className="space-y-8">
      <TeamNameSettings
        teamId={params.teamId}
        currentName={team.name}
        isAdmin={isAdmin}
      />

      <SettingsSection
        title="How we play"
        description="How your team rotates on game day."
      >
        <HowWePlayCard
          teamId={params.teamId}
          sport={sport}
          ageGroup={ageGroupCfg.id}
          ageLabel={ageGroupCfg.label}
          onFieldSize={ageGroupCfg.defaultOnFieldSize}
          maxOnFieldSize={ageGroupCfg.maxOnFieldSize}
          periodWord={ageGroupCfg.periodLabel === "half" ? "half" : "quarter"}
          row={(playbookRow ?? null) as HowWePlayRow | null}
          positions={(positionRows ?? []) as HowWePlayPosition[]}
          players={(squadRows ?? []).map((p) => ({ id: p.id as string, name: p.full_name as string }))}
          isAdmin={isAdmin}
        />
        {/* Rugby league §6 Junior Laws: each player plays two full
            unbroken quarters (U6–U9) or one full half (U10–U12). Off by
            default for casual comps. */}
        {sport === "rugby_league" && (
          <UnbrokenPeriodsToggle
            teamId={params.teamId}
            initialEnabled={
              (team as { enforce_unbroken_periods?: boolean | null }).enforce_unbroken_periods ?? false
            }
            isAdmin={isAdmin}
          />
        )}
        {/* Rugby league zone-time bar (AFL F/C/B equivalent). */}
        {sport === "rugby_league" && (
          <TrackZoneTimeToggle
            teamId={params.teamId}
            initialEnabled={
              (team as { track_zone_time?: boolean | null }).track_zone_time ?? false
            }
            isAdmin={isAdmin}
          />
        )}
        {/* Netball's opt-in rolling subs (Steve-requested). */}
        {sport === "netball" && (
          <MidQuarterSubsToggle
            teamId={params.teamId}
            initialEnabled={
              (team as { allow_mid_quarter_subs?: boolean | null }).allow_mid_quarter_subs ?? false
            }
            isAdmin={isAdmin}
          />
        )}
        <CohortChipsSettings
          teamId={params.teamId}
          initialLabels={{
            a: (team as { chip_a_label?: string | null }).chip_a_label ?? null,
            b: (team as { chip_b_label?: string | null }).chip_b_label ?? null,
            c: (team as { chip_c_label?: string | null }).chip_c_label ?? null,
          }}
          initialModes={{
            a: normalizeChipMode((team as { chip_a_mode?: string | null }).chip_a_mode),
            b: normalizeChipMode((team as { chip_b_mode?: string | null }).chip_b_mode),
            c: normalizeChipMode((team as { chip_c_mode?: string | null }).chip_c_mode),
          }}
          isAdmin={isAdmin}
          sport={sport}
          ageGroup={(team as { age_group?: string | null }).age_group ?? null}
        />
      </SettingsSection>

      <SettingsSection title="People">
        <TeamMembersSettings
          teamId={params.teamId}
          isAdmin={isAdmin}
          members={members}
          invites={invites}
          joinCode={joinCode}
        />
      </SettingsSection>

      <SettingsSection title="Season">
        <AgeGroupSettings
          teamId={params.teamId}
          current={ageGroupCfg.id}
          options={ageOptions}
          isAdmin={isAdmin}
        />
        {/* Every sport's period length (it used to show for netball
            only, though AFL and league honour it too). A game can still
            override it. */}
        <QuarterLengthInput
          teamId={params.teamId}
          ageGroupDefaultSeconds={ageGroupCfg.periodSeconds}
          initialOverrideSeconds={
            (team as { quarter_length_seconds?: number | null }).quarter_length_seconds ?? null
          }
          periodWord={ageGroupCfg.periodLabel === "half" ? "Half" : "Quarter"}
          isAdmin={isAdmin}
        />
      </SettingsSection>

      <SettingsSection title="Game-day extras">
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
      </SettingsSection>

      <SettingsSection title="Danger zone" tone="danger">
        <DangerZone teamId={params.teamId} teamName={team.name} isAdmin={isAdmin} />
      </SettingsSection>
    </div>
  );
}
