import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

/**
 * First-time welcome.  Middleware routes brand-new authenticated users
 * here (zero teams, zero memberships) in place of the empty-state
 * dashboard — it's a warmer first impression than "You haven't created
 * or joined any teams yet."
 *
 * Anyone who already has a team lands on the dashboard instead.  This
 * page self-heals if someone deep-links to /welcome after they've
 * already created a team: we redirect them out.
 */
export default async function WelcomePage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login?next=/welcome");

  // If they're already a member of a team, the welcome is stale —
  // bounce to dashboard.
  const { count: membershipCount } = await supabase
    .from("team_memberships")
    .select("team_id", { count: "exact", head: true })
    .eq("user_id", user.id);

  if ((membershipCount ?? 0) > 0) {
    redirect("/dashboard");
  }

  const steps = [
    {
      num: 1,
      title: "Team basics",
      body: "Name and age group.",
    },
    {
      num: 2,
      title: "How you play",
      body: "Scoring on or off — you decide.",
    },
    {
      num: 3,
      title: "Add the squad",
      body: "The kids on your roster.",
    },
    {
      num: 4,
      title: "Your fixture",
      body: "Pull games from PlayHQ, or skip.",
    },
    {
      num: 5,
      title: "Ready for round 1",
      body: "Invite co-coaches, share availability.",
    },
  ];

  return (
    <div className="mx-auto max-w-xl space-y-8 py-4 sm:py-8">
      {/* Hero */}
      <div className="space-y-3 text-center">
        <p className="text-[11px] font-bold uppercase tracking-micro text-brand-700">
          Welcome to Siren
        </p>
        <h1 className="text-3xl font-bold tracking-tightest text-ink sm:text-4xl">
          G&rsquo;day Coach 👋
        </h1>
        <p className="mx-auto max-w-md text-base text-ink-dim sm:text-lg">
          Let&rsquo;s get your team ready for round 1. Takes about three
          minutes, and you can skip any step and come back to it later.
        </p>
      </div>

      {/* 5-step preview */}
      <ol className="space-y-3">
        {steps.map((s) => (
          <li
            key={s.num}
            className="flex items-start gap-4 rounded-lg border border-hairline bg-surface p-4 shadow-card"
          >
            <span
              aria-hidden
              className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-brand-100 text-sm font-bold text-brand-700"
            >
              {s.num}
            </span>
            <div className="min-w-0 flex-1">
              <p className="font-semibold text-ink">{s.title}</p>
              <p className="mt-0.5 text-sm text-ink-dim">{s.body}</p>
            </div>
          </li>
        ))}
      </ol>

      {/* CTA */}
      <div className="space-y-3">
        <Link
          href="/teams/new"
          className="flex w-full items-center justify-center gap-2 rounded-lg bg-brand-600 px-5 py-3.5 text-base font-semibold text-warm shadow-card transition-colors duration-fast ease-out-quart hover:bg-brand-700"
        >
          Let&rsquo;s go
          <span aria-hidden>→</span>
        </Link>
        <p className="text-center text-xs text-ink-mute">
          Already been invited to a team?{" "}
          <Link
            href="/dashboard?welcome=skipped"
            className="font-medium text-brand-700 hover:text-brand-800"
          >
            Skip to dashboard
          </Link>
        </p>
      </div>
    </div>
  );
}
