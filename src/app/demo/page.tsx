import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { unstable_noStore as noStore } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { AGE_GROUPS } from "@/lib/ageGroups";
import { netballSport } from "@/lib/sports";
import { getBrand } from "@/lib/brand";
import type { Sport } from "@/lib/types";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  alternates: { canonical: "/demo" },
};

export default async function DemoPage() {
  noStore();
  const admin = createAdminClient();

  // Pick the demo team that matches the inbound brand. Visitors on
  // sirenfooty.com.au get the AFL demo; visitors on
  // sirennetball.com.au get the netball demo. If no brand-matching
  // demo exists, fall back to ANY demo team so the page never
  // renders the "Demo not set up yet" placeholder when there's a
  // demo team for the other sport sitting around.
  const brand = getBrand();
  const sport: Sport = brand.brand.id;

  const { data: brandTeam } = await admin
    .from("teams")
    .select("id, age_group, sport")
    .eq("is_demo", true)
    .eq("sport", sport)
    .limit(1)
    .maybeSingle();

  let team = brandTeam;
  if (!team) {
    const { data: anyTeam } = await admin
      .from("teams")
      .select("id, age_group, sport")
      .eq("is_demo", true)
      .limit(1)
      .maybeSingle();
    team = anyTeam;
  }

  if (!team) {
    return (
      <div className="flex min-h-screen items-center justify-center p-6">
        <p className="text-center text-ink-dim">
          Demo not set up yet. Check back soon.
        </p>
      </div>
    );
  }

  const { data: adminRow } = await admin
    .from("team_memberships")
    .select("user_id")
    .eq("team_id", team.id)
    .eq("role", "admin")
    .limit(1)
    .maybeSingle();

  if (!adminRow) {
    return (
      <div className="flex min-h-screen items-center justify-center p-6">
        <p className="text-center text-ink-dim">Demo configuration error.</p>
      </div>
    );
  }

  // Clean up any leftover in-progress demo games before creating a fresh one.
  await admin
    .from("games")
    .update({ status: "completed" })
    .eq("team_id", team.id)
    .neq("status", "completed");

  // Sport-specific game-creation defaults. AFL pulls from the legacy
  // AGE_GROUPS table (which carries on_field_size + sub_interval_seconds
  // tuned for rolling subs); netball uses period-break-only subs, so
  // sub_interval_seconds is irrelevant — we still set it from the
  // age-group default to keep the INSERT typed cleanly.
  const teamSport = (team.sport as Sport | null | undefined) ?? "afl";
  const insertPayload =
    teamSport === "netball"
      ? (() => {
          // Use the team's actual age-group config so on_field_size
          // lines up with the position layout the lineup picker
          // expects (Set = 5-a-side, others = 7-a-side).
          const ageCfg =
            netballSport.ageGroups.find((a) => a.id === team!.age_group) ??
            netballSport.ageGroups.find((a) => a.id === "go")!;
          return {
            team_id: team!.id,
            opponent: "Demo Opponent",
            scheduled_at: new Date().toISOString(),
            location: null,
            notes: null,
            on_field_size: ageCfg.defaultOnFieldSize,
            sub_interval_seconds: ageCfg.subIntervalSeconds,
            // 8× perceived clock — same as AFL. A 10-min netball
            // quarter ticks down in ~1m15s of wall-clock so a
            // visitor sees the hooter, the Q-break suggester, and
            // per-third minute bars all play out inside a few
            // minutes.
            clock_multiplier: 8,
            created_by: adminRow.user_id,
          };
        })()
      : (() => {
          const cfg = AGE_GROUPS["U10"];
          return {
            team_id: team!.id,
            opponent: "Demo Opponent",
            scheduled_at: new Date().toISOString(),
            location: null,
            notes: null,
            on_field_size: cfg.defaultOnFieldSize,
            sub_interval_seconds: cfg.subIntervalSeconds,
            clock_multiplier: 8,
            created_by: adminRow.user_id,
          };
        })();

  const { data: newGame } = await admin
    .from("games")
    .insert(insertPayload)
    .select("id, share_token")
    .single();

  if (!newGame) {
    return (
      <div className="flex min-h-screen items-center justify-center p-6">
        <p className="text-center text-ink-dim">
          Could not start demo. Please try again.
        </p>
      </div>
    );
  }

  const { data: players } = await admin
    .from("players")
    .select("id")
    .eq("team_id", team.id)
    .eq("is_active", true);

  if (players && players.length > 0) {
    await admin.from("game_availability").insert(
      players.map((p) => ({
        game_id: newGame.id,
        player_id: p.id,
        status: "available" as const,
      }))
    );
  }

  redirect(`/run/${newGame.share_token}`);
}
