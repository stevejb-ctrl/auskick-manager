import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { loadTeamPlaybook } from "@/lib/playbook/load";
import { aflPlaybookInput, withBalanceSeason } from "@/lib/sports/afl/engine";
import { LineupPicker } from "@/components/live/LineupPicker";
import { seasonZoneMinutes } from "@/lib/fairness";
import { aflBranch, aflPositionModel, getAgeGroupConfig, teamSport } from "@/lib/sports";
import type { Game, GameEvent, LiveAuth, Player, Sport } from "@/lib/types";
import { EmptyState } from "@/components/ui/EmptyState";
import { BackLink } from "@/components/ui/BackLink";
import { LiveSync } from "@/components/live/LiveSync";
import { readLiveSyncStamp } from "@/lib/live/liveSyncStamp";

export const dynamic = "force-dynamic";

interface LineupPageProps {
  params: { token: string };
}

// In step with the coach's phone (LiveSync): once the game is under way
// (the other phone kicked off), this picker gives way to the live game.
export default async function LineupPage(props: LineupPageProps) {
  const admin = createAdminClient();
  const { data: row } = await admin.from("games").select("id").eq("share_token", props.params.token).maybeSingle();
  const stamp = row ? await readLiveSyncStamp(admin, (row as { id: string }).id) : null;
  const body = await LineupPageBody(props);
  return (
    <>
      <LiveSync stamp={stamp} syncUrl={`/run/${props.params.token}/sync`} />
      {body}
    </>
  );
}

async function LineupPageBody({ params }: LineupPageProps) {
  const admin = createAdminClient();

  const { data: game } = await admin
    .from("games")
    .select("*")
    .eq("share_token", params.token)
    .maybeSingle();
  if (!game) notFound();
  const g = game as Game;
  const { count: lineupsSet } = await admin
    .from("game_events")
    .select("id", { count: "exact", head: true })
    .eq("game_id", g.id)
    .eq("type", "lineup_set");
  if ((lineupsSet ?? 0) > 0) redirect(`/run/${params.token}`);

  const { data: teamRow } = await admin
    .from("teams")
    .select("name, sport, age_group, chip_a_mode, chip_b_mode, chip_c_mode")
    .eq("id", g.team_id)
    .single();
  if (!teamRow) notFound();
  const teamName = teamRow.name ?? "Team";
  const sport: Sport = teamSport((teamRow as { sport?: Sport }).sport);

  // This page is AFL's lineup picker. Netball and league pick their
  // lineup on /run/[token] itself (their live screens have a built-in
  // pre-kickoff picker), so every other sport goes back there. Only
  // sending netball back gave a league runner AFL's picker, AFL U10's
  // settings, and an AFL-shaped lineup at kickoff.
  if (sport !== "afl") {
    redirect(`/run/${params.token}`);
  }

  const ageCfg = getAgeGroupConfig(aflBranch(sport), (teamRow as { age_group?: string } | null)?.age_group ?? null);
  const positionModel = aflPositionModel(ageCfg);

  const auth: LiveAuth = { kind: "token", token: params.token };

  const [{ data: avail }, { data: players }, { data: teamGames }] =
    await Promise.all([
      admin
        .from("game_availability")
        .select("player_id, status")
        .eq("game_id", g.id)
        .eq("status", "available")
        .order("player_id"),
      admin
        .from("players")
        .select("*")
        .eq("team_id", g.team_id)
        .eq("is_active", true)
        .order("jersey_number").order("full_name").order("id"),
      admin.from("games").select("id").eq("team_id", g.team_id),
    ]);

  const allActive = (players ?? []) as Player[];
  const availableIds = new Set((avail ?? []).map((a) => a.player_id));
  const availablePlayers = allActive.filter((p) => availableIds.has(p.id));
  const otherGameIds = (teamGames ?? [])
    .map((t) => t.id)
    .filter((id) => id !== g.id);
  const { data: seasonEvents } = otherGameIds.length
    ? await admin.from("game_events").select("*").in("game_id", otherGameIds)
    : { data: [] as GameEvent[] };
  const season = seasonZoneMinutes((seasonEvents ?? []) as GameEvent[]);
  // How we play for the AFL suggester (UX plan 3.6).
  const { resolved: playbook, prefs: playbookPrefs, rules: playbookRules } = await loadTeamPlaybook(
    admin,
    g.team_id,
    "afl",
    (teamRow as { age_group?: string } | null)?.age_group ?? null,
  );
  const aflPlaybook = withBalanceSeason(
    aflPlaybookInput(playbook, playbookPrefs, playbookRules),
    (seasonEvents ?? []) as GameEvent[],
    playbook.seasonBalanceSince,
  );

  // Pre-game saved lineup, if the coach built one ahead of game day.
  const { data: draftRow } = await admin
    .from("game_lineup_drafts")
    .select("*")
    .eq("game_id", g.id)
    .maybeSingle();
  const initialDraft = draftRow as import("@/lib/types").LineupDraft | null;
  const teamChipModes = {
    a: ((teamRow as { chip_a_mode?: "split" | "group" } | null)?.chip_a_mode ?? "split") as import("@/lib/chips").ChipMode,
    b: ((teamRow as { chip_b_mode?: "split" | "group" } | null)?.chip_b_mode ?? "split") as import("@/lib/chips").ChipMode,
    c: ((teamRow as { chip_c_mode?: "split" | "group" } | null)?.chip_c_mode ?? "split") as import("@/lib/chips").ChipMode,
  };

  return (
    <div className="mx-auto max-w-2xl space-y-6 p-3">
      <div>
        <BackLink href={`/run/${params.token}`} label="Availability" />
      </div>

      <div>
        <h2 className="text-xl font-bold text-ink">
          {teamName} vs {g.opponent}
        </h2>
        <p className="mt-1 text-sm text-ink-dim">
          Starting lineup · {availablePlayers.length} available
        </p>
      </div>

      {availablePlayers.length === 0 ? (
        <EmptyState
          title="No one's marked available yet."
          description="Go back and mark players available first."
        />
      ) : (
        <LineupPicker
          auth={auth}
          gameId={g.id}
          players={availablePlayers}
          season={season}
          defaultOnFieldSize={g.on_field_size}
          minOnFieldSize={ageCfg.minOnFieldSize}
          maxOnFieldSize={ageCfg.maxOnFieldSize}
          positionModel={positionModel}
          gameMinutes={(ageCfg.periodSeconds * ageCfg.periodCount) / 60}
          // The game's own interval, as the coach's page passes it —
          // without it the picker estimates one from the squad and
          // kickoff saves that over the game's setting.
          defaultSubMinutes={g.sub_interval_seconds / 60}
          // The share-token page feeds the age-group DEFAULT period for the
          // season-diversity threshold, not getEffectiveQuarterSeconds'
          // per-game/per-team override (accepted D-03 divergence, see
          // 08-04 SUMMARY).
          fullPeriodMs={ageCfg.periodSeconds * 1000}
          initialDraft={initialDraft}
          chipModeByKey={teamChipModes}
          aflPlaybook={aflPlaybook}
        />
      )}
    </div>
  );
}
