import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { loadTeamPlaybook } from "@/lib/playbook/load";
import { aflPlaybookInput, withBalanceSeason } from "@/lib/sports/afl/engine";
import { LineupPicker } from "@/components/live/LineupPicker";
import { seasonZoneMinutes } from "@/lib/fairness";
import { aflPositionModel, getAgeGroupConfig } from "@/lib/sports";
import type { Game, GameEvent, LiveAuth, Player, Sport } from "@/lib/types";
import { EmptyState } from "@/components/ui/EmptyState";
import { BackLink } from "@/components/ui/BackLink";

export const dynamic = "force-dynamic";

interface LineupPageProps {
  params: { token: string };
}

export default async function LineupPage({ params }: LineupPageProps) {
  const admin = createAdminClient();

  const { data: game } = await admin
    .from("games")
    .select("*")
    .eq("share_token", params.token)
    .maybeSingle();
  if (!game) notFound();
  const g = game as Game;

  const { data: teamRow } = await admin
    .from("teams")
    .select("name, sport, age_group, chip_a_mode, chip_b_mode, chip_c_mode")
    .eq("id", g.team_id)
    .single();
  const teamName = teamRow?.name ?? "Team";
  const sport: Sport = ((teamRow as { sport?: Sport } | null)?.sport) ?? "afl";

  // Netball runner-token flow doesn't use this separate /lineup step —
  // NetballLiveGame has a built-in pre-kickoff lineup picker that
  // shows on /run/[token] when no lineup_set has been recorded yet.
  // Bounce there so the netball flow stays single-page.
  if (sport === "netball") {
    redirect(`/run/${params.token}`);
  }

  const ageCfg = getAgeGroupConfig("afl", (teamRow as { age_group?: string } | null)?.age_group ?? null);
  const positionModel = aflPositionModel(ageCfg);

  const auth: LiveAuth = { kind: "token", token: params.token };

  const [{ data: avail }, { data: players }, { data: teamGames }] =
    await Promise.all([
      admin
        .from("game_availability")
        .select("player_id, status")
        .eq("game_id", g.id)
        .eq("status", "available"),
      admin
        .from("players")
        .select("*")
        .eq("team_id", g.team_id)
        .eq("is_active", true)
        .order("jersey_number"),
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
