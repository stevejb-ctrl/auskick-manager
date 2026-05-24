import Link from "next/link";
import { redirect } from "next/navigation";
import { getUser } from "@/lib/supabase/server";
import { JoinTeamForm } from "./JoinTeamForm";

/**
 * Manual code-entry surface — the counterpart to the
 * /join/{token} URL-based invite flow.
 *
 * Reached from:
 *   - /welcome  (second CTA, side-by-side with "Set up a new team")
 *   - UserMenu  (account dropdown in the header, always available)
 *   - /dashboard?welcome=skipped empty state (link below "Create")
 *
 * Auth-gated by the (app)/ layout — but we also handle the unauth
 * case here for any future deep-link entry point that pre-dates
 * sign-in (e.g. a parent who opens the link on a fresh device).
 */
export default async function JoinTeamPage() {
  const {
    data: { user },
  } = await getUser();
  if (!user) redirect("/login?next=/join-team");

  return (
    <div className="mx-auto max-w-md space-y-6 py-4 sm:py-8">
      <div className="space-y-2 text-center">
        <p className="text-[11px] font-bold uppercase tracking-micro text-brand-700">
          Join a team
        </p>
        <h1 className="text-2xl font-bold tracking-tightest text-ink sm:text-3xl">
          Got a join code?
        </h1>
        <p className="text-sm text-ink-dim">
          Enter the 8-character code your coach gave you. Codes look like{" "}
          <code className="rounded bg-surface-alt px-1 font-mono text-ink">
            ABCD-EFGH
          </code>
          .
        </p>
      </div>

      <JoinTeamForm />

      <p className="text-center text-xs text-ink-mute">
        Don&rsquo;t have a code?{" "}
        <Link
          href="/dashboard"
          className="font-medium text-brand-700 hover:text-brand-800"
        >
          Back to my teams
        </Link>
      </p>
    </div>
  );
}
