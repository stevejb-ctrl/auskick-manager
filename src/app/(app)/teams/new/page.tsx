import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { SetupProgress } from "@/components/setup/SetupProgress";
import { TeamBasicsForm } from "@/components/setup/TeamBasicsForm";

export default async function NewTeamPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login?next=/teams/new");

  // "Back" link destination depends on whether this is a first-time
  // setup (coming from /welcome) or an existing user adding another
  // team (coming from /dashboard).  Cheapest proxy for "first team":
  // count the user's memberships.  This is the same zero-check the
  // /welcome page uses, so the back button stays consistent.
  const { count: membershipCount } = await supabase
    .from("team_memberships")
    .select("team_id", { count: "exact", head: true })
    .eq("user_id", user.id);

  const isFirstTeam = (membershipCount ?? 0) === 0;
  const backHref = isFirstTeam ? "/welcome" : "/dashboard";
  const backLabel = isFirstTeam ? "← Welcome" : "← My teams";

  return (
    <div className="mx-auto max-w-xl space-y-6">
      <Link
        href={backHref}
        className="inline-block text-sm text-ink-dim transition-colors duration-fast ease-out-quart hover:text-brand-700"
      >
        {backLabel}
      </Link>

      <SetupProgress current="basics" />

      <div className="space-y-2">
        <h1 className="text-2xl font-bold text-ink">
          {isFirstTeam ? "Tell us about your team" : "Create your team"}
        </h1>
        <p className="text-sm text-ink-dim">
          Your age group sets the default on-field size, quarter length, and
          rotation rules for this team (you can fine-tune on-field numbers per
          game later). The team name is easy to change anytime from Settings.
        </p>
      </div>

      <div className="rounded-lg border border-hairline bg-surface p-5 shadow-card">
        <TeamBasicsForm userId={user.id} />
      </div>
    </div>
  );
}
