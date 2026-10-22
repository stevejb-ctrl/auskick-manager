import { notFound, redirect } from "next/navigation";
import { createClient, getUser } from "@/lib/supabase/server";
import { TeamSongSettings } from "@/components/team/TeamSongSettings";
import { TeamNameSettings } from "@/components/team/TeamNameSettings";
import { QuarterLengthInput } from "@/components/team/QuarterLengthInput";
import { OnFieldSizeInput } from "@/components/team/OnFieldSizeInput";
import { teamOnFieldSize } from "@/lib/games/newGameDefaults";
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
import { getAgeGroupConfig, getSportConfig, isBasketball, isRugby, isSoccer, teamSport, periodLabels } from "@/lib/sports";
import { basketballAgeGroup, basketballAgeGroupForTeam } from "@/lib/sports/basketball";
import { soccerFamilyAgeGroup, soccerFamilyAgeGroupForTeam, soccerFamilyRules } from "@/lib/sports/soccer/family";
import { PeriodFormatSettings } from "@/components/team/PeriodFormatSettings";
import { TrackFoulsToggle } from "@/components/team/TrackFoulsToggle";
import { centreVest } from "@/lib/sports/rugby/zoneTime";
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
      .select("id, name, sport, age_group, track_scoring, quarter_length_seconds, on_field_size, period_count, track_fouls, allow_mid_quarter_subs, enforce_unbroken_periods, track_zone_time, song_url, song_start_seconds, song_duration_seconds, song_enabled")
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
  const sport = teamSport(team.sport);

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

  // Basketball plays the team's halves or quarters (migration 0069), as
  // does hockey; a soccer-family team's age group is its own sport's.
  const teamPeriodCount = (team as { period_count?: number | null }).period_count ?? null;
  const teamAgeGroup = (team as { age_group?: string | null }).age_group ?? null;
  const ageGroupCfg = isBasketball(sport)
    ? basketballAgeGroupForTeam(teamAgeGroup, teamPeriodCount)
    : isSoccer(sport)
      ? soccerFamilyAgeGroupForTeam(sport, teamAgeGroup, teamPeriodCount)
      : getAgeGroupConfig(sport, teamAgeGroup);
  // Hockey's halves or quarters: the game's length is the age group's
  // (4 × 15 is 2 × 30).
  const hockeyFormat =
    isSoccer(sport) && soccerFamilyRules(sport).halvesOrQuarters ? soccerFamilyAgeGroup(sport, teamAgeGroup) : null;
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
          onFieldSize={teamOnFieldSize(ageGroupCfg, (team as { on_field_size?: number | null }).on_field_size ?? null)}
          maxOnFieldSize={ageGroupCfg.maxOnFieldSize}
          periodWord={periodLabels(sport, ageGroupCfg).label}
          row={(playbookRow ?? null) as HowWePlayRow | null}
          positions={(positionRows ?? []) as HowWePlayPosition[]}
          players={(squadRows ?? []).map((p) => ({ id: p.id as string, name: p.full_name as string }))}
          isAdmin={isAdmin}
        />
        {/* Rugby league §6 Junior Laws: each player plays two full
            unbroken quarters (U6–U9) or one full half (U10–U12). Off by
            default for casual comps. U13+ plays international laws:
            no such rule, so no toggle. */}
        {isRugby(sport) && (ageGroupCfg.minUnbrokenPeriods ?? 0) > 0 && (
          <UnbrokenPeriodsToggle
            teamId={params.teamId}
            initialEnabled={
              (team as { enforce_unbroken_periods?: boolean | null }).enforce_unbroken_periods ?? false
            }
            isAdmin={isAdmin}
          />
        )}
        {/* Rugby zone-time bar (AFL F/C/B equivalent). */}
        {isRugby(sport) && (
          <TrackZoneTimeToggle
            teamId={params.teamId}
            initialEnabled={
              (team as { track_zone_time?: boolean | null }).track_zone_time ?? false
            }
            isAdmin={isAdmin}
            centreVest={centreVest(ageGroupCfg.vestRequirements)}
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
        {/* The team's competition's size and period length (competitions
            differ by state), for every sport. A game can still override
            both. */}
        <OnFieldSizeInput
          // Fresh after an age change: its range and saved size move.
          // Not keyed on the saved size: its own save would remount it
          // and drop the "Saved." confirmation. (Its own prefix: the
          // period-length card beside it is keyed on the age too.)
          key={`on-field:${ageGroupCfg.id}`}
          teamId={params.teamId}
          ageGroupDefault={ageGroupCfg.defaultOnFieldSize}
          min={ageGroupCfg.minOnFieldSize}
          max={ageGroupCfg.maxOnFieldSize}
          initialSize={(team as { on_field_size?: number | null }).on_field_size ?? null}
          isAdmin={isAdmin}
        />
        {isBasketball(sport) && (
          <PeriodFormatSettings
            teamId={params.teamId}
            initialCount={teamPeriodCount}
            halfMinutes={basketballAgeGroup(ageGroupCfg.id).periodSeconds / 60}
            note="Your competition's format. VIC and WA domestic play halves; QLD and the ACT play quarters."
            isAdmin={isAdmin}
          />
        )}
        {hockeyFormat && (
          <PeriodFormatSettings
            teamId={params.teamId}
            initialCount={ageGroupCfg.periodCount}
            halfMinutes={(hockeyFormat.periodSeconds * hockeyFormat.periodCount) / 2 / 60}
            note="Your competition's format. Siren plays quarters from Under 13 (4 × 15); Victoria plays halves."
            isAdmin={isAdmin}
          />
        )}
        <QuarterLengthInput
          // Fresh after an age or a halves/quarters change: its default moves.
          key={`${ageGroupCfg.id}:${ageGroupCfg.periodCount}`}
          teamId={params.teamId}
          ageGroupDefaultSeconds={ageGroupCfg.periodSeconds}
          initialOverrideSeconds={
            (team as { quarter_length_seconds?: number | null }).quarter_length_seconds ?? null
          }
          periodWord={periodLabels(sport, ageGroupCfg).label === "half" ? "Half" : "Quarter"}
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
        {isBasketball(sport) && (
          <TrackFoulsToggle
            teamId={params.teamId}
            initialEnabled={
              (team as { track_fouls?: boolean | null }).track_fouls ?? basketballAgeGroup(ageGroupCfg.id).tracksFoulsDefault
            }
            isAdmin={isAdmin}
          />
        )}
        {getSportConfig(sport).teamSong && (
          <TeamSongSettings
            teamId={params.teamId}
            currentSongUrl={team.song_url ?? null}
            currentStartSeconds={team.song_start_seconds ?? 0}
            currentDurationSeconds={team.song_duration_seconds ?? 15}
            currentEnabled={team.song_enabled ?? true}
            isAdmin={isAdmin}
          />
        )}
      </SettingsSection>

      <SettingsSection title="Danger zone" tone="danger">
        <DangerZone teamId={params.teamId} teamName={team.name} isAdmin={isAdmin} />
      </SettingsSection>
    </div>
  );
}
