import { notFound } from "next/navigation";
import { unstable_noStore as noStore } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { SFButton } from "@/components/sf";

// Where the game-day link's EXIT goes. It used to link to the page it was
// on, so EXIT did nothing (UX round 2, 24 Oct 2026). A parent who leaves
// gets a plain word that nothing's lost, and the way back.

export const dynamic = "force-dynamic";

export default async function RunnerLeftPage({ params }: { params: { token: string } }) {
  noStore();
  const admin = createAdminClient();
  const { data: game } = await admin
    .from("games")
    .select("opponent, status, team:teams!inner(name)")
    .eq("share_token", params.token)
    .maybeSingle();
  if (!game) notFound();
  const g = game as unknown as { opponent: string | null; status: string; team: { name: string | null } | { name: string | null }[] | null };
  const team = Array.isArray(g.team) ? g.team[0] : g.team;
  const teamName = team?.name ?? "the team";
  const finished = g.status === "completed";

  return (
    <div className="space-y-4 px-4 py-8 text-center">
      <h1 className="text-xl font-bold tracking-[-0.01em] text-ink">You&apos;ve left the game</h1>
      <p className="text-sm text-ink-dim">
        {teamName}
        {g.opponent ? ` vs ${g.opponent}` : ""}
      </p>
      <p className="text-sm text-ink">
        {finished
          ? "Everything's saved. Thanks for running today's game!"
          : "Everything's saved. To come back, open the same link, or tap below."}
      </p>
      {!finished && (
        <SFButton href={`/run/${params.token}`} variant="primary" size="lg" full>
          Back to the game
        </SFButton>
      )}
      <p className="text-xs text-ink-dim">You can close this tab.</p>
    </div>
  );
}
