import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import type {
  AvailabilityStatus,
  FillIn,
  GameAvailability,
  LiveAuth,
  Player,
} from "@/lib/types";
import { AvailabilityRow } from "@/components/games/AvailabilityRow";
import { AddFillInForm } from "@/components/games/AddFillInForm";
import { FillInRow } from "@/components/games/FillInRow";

interface AvailabilityListProps {
  auth: LiveAuth;
  teamId: string;
  gameId: string;
  /**
   * Flip per-player availability? Any team member (parents included)
   * plus anyone on the runner token can do this.
   */
  canMarkAvailability: boolean;
  /**
   * Add/remove fill-ins? Restricted to admins + game managers, plus
   * the trusted runner token on match day.
   */
  canManageMatch: boolean;
  /**
   * AFL teams show a jersey-number input on the fill-in form; netball
   * teams don't (no jersey numbers in netball). Defaults to true so
   * unchanged callers keep their current behaviour.
   */
  showJerseyNumber?: boolean;
  /**
   * Minimum number of available players needed before the game can
   * start (= court positions count). When provided, the count pill
   * reads "X of N" and a hint surfaces below if the threshold isn't
   * met. Stagehand 2026-05-09 found that without this hint, runners
   * mark 3 of 7 players Available and then bash on "Start game"
   * indefinitely because nothing tells them more are needed.
   * Omit to keep the legacy "X available" rendering.
   */
  requiredAvailable?: number;
}

export async function AvailabilityList({
  auth,
  teamId,
  gameId,
  canMarkAvailability,
  canManageMatch,
  showJerseyNumber = true,
  requiredAvailable,
}: AvailabilityListProps) {
  const supabase = auth.kind === "token" ? createAdminClient() : createClient();

  const [{ data: players }, { data: availability }, { data: fillInRows }] = await Promise.all([
    supabase
      .from("players")
      .select("*")
      .eq("team_id", teamId)
      .eq("is_active", true)
      .order("jersey_number"),
    supabase.from("game_availability").select("*").eq("game_id", gameId),
    supabase
      .from("game_fill_ins")
      .select("*")
      .eq("game_id", gameId)
      .order("created_at"),
  ]);

  const squad = (players ?? []) as Player[];
  const fillIns = (fillInRows ?? []) as FillIn[];
  const availMap = new Map<string, AvailabilityStatus>();
  for (const row of (availability ?? []) as GameAvailability[]) {
    availMap.set(row.player_id, row.status);
  }

  let available = 0;
  let unavailable = 0;
  for (const p of squad) {
    const s = availMap.get(p.id) ?? "unknown";
    if (s === "available") available++;
    else unavailable++;
  }
  // Fill-ins are always available — addFillIn stamps an availability row for them.
  available += fillIns.length;

  // When a required minimum is provided, show the warm-orange-ish
  // tint until the threshold is met. The body hint below tells the
  // user what to do next so they're not just staring at a stuck
  // "Start game" button.
  //
  // Steve 2026-05-20: the count pill now reads "X of N available"
  // where N is the TOTAL squad (active players + fill-ins), not
  // the on-field-size minimum. Previously the denominator was the
  // `requiredAvailable` minimum, which read as "X of 12" for a
  // 12-on-field U10 team — looked wrong when the squad had 18
  // available because "18 of 12" doesn't make sense. The minimum
  // still gates `needsMore` for the warning copy; only the
  // displayed denominator changes.
  const needsMore =
    typeof requiredAvailable === "number" && available < requiredAvailable;
  const totalRoster = squad.length + fillIns.length;
  return (
    <div className="space-y-4">
      <div className="flex gap-2 text-sm">
        <span
          className={`inline-flex items-center gap-1 rounded-full border px-3 py-1 font-semibold ${
            needsMore
              ? "border-warn/30 bg-warn/10 text-warn"
              : "border-ok/30 bg-ok/10 text-ok"
          }`}
        >
          {`${available} of ${totalRoster} available`}
        </span>
        <span className="inline-flex items-center gap-1 rounded-full border border-hairline bg-surface-alt px-3 py-1 font-semibold text-ink-mute">
          {unavailable} unavailable
        </span>
      </div>
      {needsMore && (
        <p className="text-xs text-ink-dim">
          Mark at least {requiredAvailable} players available before the
          game can start.
        </p>
      )}

      <div className="rounded-lg border border-hairline bg-surface shadow-card">
        {squad.length === 0 && fillIns.length === 0 ? (
          <p className="px-4 py-6 text-center text-sm text-ink-mute">
            No active players in the squad.
          </p>
        ) : (
          <ul className="divide-y divide-hairline">
            {squad.map((p) => (
              <AvailabilityRow
                key={p.id}
                auth={auth}
                gameId={gameId}
                playerId={p.id}
                playerName={p.full_name}
                jerseyNumber={p.jersey_number}
                status={availMap.get(p.id) ?? "unknown"}
                canEdit={canMarkAvailability}
              />
            ))}
            {fillIns.map((f) => (
              <FillInRow
                key={f.id}
                auth={auth}
                gameId={gameId}
                fillInId={f.id}
                fullName={f.full_name}
                jerseyNumber={f.jersey_number}
                canEdit={canManageMatch}
              />
            ))}
          </ul>
        )}
        {canManageMatch && (
          <AddFillInForm
            auth={auth}
            gameId={gameId}
            showJerseyNumber={showJerseyNumber}
          />
        )}
      </div>
    </div>
  );
}
