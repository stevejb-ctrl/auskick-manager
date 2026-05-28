import Link from "next/link";
import { unstable_noStore as noStore } from "next/cache";
import { DeviceFrame } from "@/components/DeviceFrame";
import { SirenWordmark } from "@/components/marketing/SirenWordmark";
import { createAdminClient } from "@/lib/supabase/admin";

// Back-target resolution. /run/{token} is reached by two distinct
// audiences:
//
//   1. Demo visitors — landed via the /demo picker. Back should
//      return them to /demo so they can try another sport without
//      retracing through the homepage.
//
//   2. Real parent-runners — handed the run-token by a coach for
//      live scoring. They have nowhere meaningful to "go back" to;
//      the homepage / marketing site is the safe default.
//
// We discriminate by querying the team behind the token's game:
// teams.is_demo is the same flag the /demo picker keys off when
// finding the demo team to start a game against.
async function resolveBackTarget(token: string): Promise<string> {
  const admin = createAdminClient();
  const { data: row } = await admin
    .from("games")
    .select("team:teams!inner(is_demo)")
    .eq("share_token", token)
    .maybeSingle();

  // Defensive default: invalid tokens, lookup failures, or any
  // non-demo team fall through to the homepage. Only confirmed
  // demo games get the /demo back-target.
  const teamRow = row?.team as { is_demo: boolean | null } | undefined;
  return teamRow?.is_demo ? "/demo" : "/";
}

export default async function RunLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: { token: string };
}) {
  noStore();
  const backHref = await resolveBackTarget(params.token);

  return (
    <div>
      {/* Non-sticky — scrolls with the page so it doesn't stack
          with LiveTopBar (also sticky-top) once the runner reaches
          the live game. The chevron+wordmark is still visible on
          first paint of every route as a back-to-home affordance;
          once the user scrolls / the live-game UI takes over,
          LiveTopBar's "✕ Exit" carries the navigation duty.
          Steve 2026-05-13 audit fix.

          Link target is dynamic — `/demo` for demo games (so the
          back arrow returns to the sport picker), `/` for real
          run-tokens. See resolveBackTarget above. */}
      <header className="border-b border-hairline bg-surface">
        <div className="flex items-center px-3 py-2">
          <Link
            href={backHref}
            className="flex items-center gap-1"
            aria-label={backHref === "/demo" ? "Back to demo picker" : "Siren home"}
          >
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              aria-hidden="true"
              className="shrink-0 text-ink-dim"
            >
              <path
                d="M15 18l-6-6 6-6"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            <SirenWordmark size="sm" />
          </Link>
        </div>
      </header>
      <DeviceFrame>
        <main>{children}</main>
      </DeviceFrame>
    </div>
  );
}
