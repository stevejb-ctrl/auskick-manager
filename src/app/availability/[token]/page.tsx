import type { Metadata } from "next";
import Link from "next/link";
import { unstable_noStore as noStore } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { SirenWordmark } from "@/components/marketing/SirenWordmark";
import { FormattedDateTime } from "@/components/ui/FormattedDateTime";
import { Eyebrow, SFCard, SFIcon } from "@/components/sf";
import { getSportConfig, teamSport } from "@/lib/sports";
import { kidLabel } from "@/lib/availability/parentLink";
import { ParentAvailabilityList, type ParentKid } from "./ParentAvailabilityList";
import type { AvailabilityStatus } from "@/lib/types";

export const dynamic = "force-dynamic";

// A private link from the group chat: never in a search index.
export const metadata: Metadata = {
  title: "Who's playing? · Siren",
  robots: { index: false, follow: false },
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * /availability/<token>: a game's availability link (migration 0072).
 * The coach posts it in the group chat ("Ask parents who's in"); a
 * parent opens it on their phone, with no account, and marks their child
 * In or Out. The coach's availability list shows who answered.
 *
 * The wizard used to promise "Share availability with parents" with
 * nothing to share (round 2 usability, 24 Oct 2026).
 */
export default async function ParentAvailabilityPage({ params }: { params: { token: string } }) {
  noStore();
  if (!UUID.test(params.token)) return <Shell>{invalid()}</Shell>;

  const admin = createAdminClient();
  const { data: game } = await admin
    .from("games")
    .select("id, team_id, opponent, scheduled_at, location, status")
    .eq("availability_token", params.token)
    .maybeSingle();
  if (!game) return <Shell>{invalid()}</Shell>;

  const [{ data: team }, { data: players }, { data: availability }] = await Promise.all([
    admin.from("teams").select("name, sport").eq("id", game.team_id).maybeSingle(),
    admin
      .from("players")
      .select("id, full_name, jersey_number")
      .eq("team_id", game.team_id)
      .eq("is_active", true)
      .order("full_name"),
    admin.from("game_availability").select("player_id, status, replied_at").eq("game_id", game.id),
  ]);
  const teamName = team?.name ?? "Your team";
  const numbered = team ? getSportConfig(teamSport(team.sport)).jerseyNumbers : false;

  const header = (
    <div>
      <Eyebrow>Who&rsquo;s playing?</Eyebrow>
      <h1 className="mt-1.5 text-2xl font-bold leading-tight tracking-tightest text-ink">
        {teamName} v {game.opponent}
      </h1>
      <div className="mt-2 flex flex-col gap-1 text-sm text-ink-dim">
        <span>
          <FormattedDateTime iso={game.scheduled_at} mode="long" />
        </span>
        {game.location && (
          <span className="inline-flex items-center gap-1">
            <SFIcon.pin />
            {game.location}
          </span>
        )}
      </div>
    </div>
  );

  if (game.status !== "upcoming") {
    return (
      <Shell>
        <SFCard>
          {header}
          <p className="mt-4 text-sm text-ink">
            This game has started, so availability is closed. Tell the coach on
            the day.
          </p>
        </SFCard>
      </Shell>
    );
  }

  const answers = new Map(
    (availability ?? []).map((a) => [a.player_id as string, a as { status: AvailabilityStatus; replied_at: string | null }]),
  );
  const kids: ParentKid[] = (players ?? []).map((p) => ({
    id: p.id as string,
    label: kidLabel(p.full_name as string),
    jerseyNumber: numbered ? ((p.jersey_number as number | null) ?? null) : null,
    status: answers.get(p.id as string)?.status ?? "unknown",
    replied: !!answers.get(p.id as string)?.replied_at,
  }));

  return (
    <Shell>
      <SFCard>
        {header}
        <p className="mt-4 text-sm leading-relaxed text-ink-dim">
          Find your child and tap <strong className="text-ink">In</strong> or{" "}
          <strong className="text-ink">Out</strong>. No account needed: the coach
          sees your answer straight away. You can change it any time before the
          game.
        </p>
      </SFCard>
      {kids.length === 0 ? (
        <p className="text-center text-sm text-ink-mute">The squad isn&rsquo;t set up yet.</p>
      ) : (
        <ParentAvailabilityList token={params.token} gameId={game.id as string} kids={kids} />
      )}
    </Shell>
  );
}

function invalid() {
  return (
    <SFCard>
      <Eyebrow>Availability</Eyebrow>
      <p className="mt-2 text-sm text-ink">
        This link isn&rsquo;t valid. Ask your coach for the game&rsquo;s
        availability link.
      </p>
    </SFCard>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-warm">
      <header className="border-b border-hairline bg-surface">
        <div className="mx-auto flex max-w-md items-center px-4 py-2.5">
          <Link href="/" aria-label="Siren home">
            <SirenWordmark size="sm" />
          </Link>
        </div>
      </header>
      <main className="mx-auto max-w-md space-y-4 px-4 py-5">{children}</main>
    </div>
  );
}
