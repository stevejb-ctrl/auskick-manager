import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient, getUser } from "@/lib/supabase/server";
import { SignOutButton } from "@/components/auth/SignOutButton";
import { ConnectedWordmark } from "@/components/brand/ConnectedWordmark";
import { NativeNotificationsBridge } from "@/components/notifications/NativeNotificationsBridge";
import { AppHeaderShell } from "@/components/layout/AppHeaderShell";
import { LiveAwareMain } from "@/components/layout/LiveAwareMain";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const {
    data: { user },
  } = await getUser();

  if (!user) {
    redirect("/login");
  }

  // Super-admin check: one cheap own-profile read (RLS allows it).
  // Used only to render a conditional "Admin" link in the header.
  const { data: profile } = await createClient()
    .from("profiles")
    .select("is_super_admin")
    .eq("id", user.id)
    .maybeSingle();
  const isSuperAdmin = Boolean(profile?.is_super_admin);

  return (
    <div>
      {/* Push-notification registration. No-op on web; on native,
          requests permission once and saves the FCM/APNs token
          into device_tokens. Mounted here (not in root layout) so
          it only fires for authenticated users. */}
      <NativeNotificationsBridge />
      {/* App-bar header.

          z-20: the netball court's PositionToken wrappers use z-10
          for sibling stacking (goal-confirm chip etc.), so a sticky
          header at z-10 ties on stacking order and tokens render in
          front on scroll. z-20 keeps the header above page content
          while staying under modals (z-50).

          `pt-[env(safe-area-inset-top)]` pushes the title row below
          the iPhone notch on web / installed PWAs.

          NOTE on the Capacitor iOS shell: with the in-prod build's
          `contentInset: "always"` config (mobile/capacitor.config.ts),
          this same env() padding double-stacks with iOS WKWebView's
          internal safe-area shift. Four CSS-side fixes were tried
          (May 2026: sticky, fixed, data-attr override, CSS-var
          fallback) — none resolved both the in-flow and locked
          states cleanly, because iOS's actual inset value isn't
          exposed to CSS. The native config has now been updated to
          `contentInset: "never"`; the bug clears once a new
          TestFlight ships with that. Until then, the in-prod
          installed app has a visible gap above the header at
          scroll=0. */}
      {/* AppHeaderShell hides this whole header on /live routes so
          the in-game top bar (Exit + game date + walkthrough ?) is
          the sole top chrome during a live game. Steve 2026-05-13:
          the Admin / Sign-out / email controls are noise once a
          coach is mid-game — the live UI surfaces only what's needed
          to run the match. */}
      <AppHeaderShell>
        <header className="sticky top-0 z-20 border-b border-hairline bg-surface/85 pt-[env(safe-area-inset-top)] backdrop-blur supports-[backdrop-filter]:bg-surface/70">
          <div className="mx-auto flex max-w-4xl items-center justify-between px-4 py-2 sm:py-3">
            {/* ConnectedWordmark wraps SirenWordmark with a live
                reconcile halo — pulses around the mark when the
                device returns from offline / drains a backlog of
                queued writes. Positive recovery signal so coaches
                who saw the OfflineBanner can confirm at a glance
                their work landed. See P1.5-2 in
                .planning/MICRO-INTERACTIONS-PLAN.md. */}
            <ConnectedWordmark size="sm" />
            <div className="flex items-center gap-2 sm:gap-3">
              {isSuperAdmin && (
                <Link
                  href="/admin"
                  className="rounded-md border border-hairline bg-surface px-2.5 py-1 text-xs font-medium text-ink-dim hover:bg-surface-alt hover:text-ink"
                >
                  Admin
                </Link>
              )}
              {/* Help is reachable from the footer and the in-page
                  walkthrough; hiding it on phones declutters the bar
                  without losing access. */}
              <Link
                href="/help"
                className="hidden rounded-md border border-hairline bg-surface px-2.5 py-1 text-xs font-medium text-ink-dim hover:bg-surface-alt hover:text-ink sm:inline-flex"
              >
                Help
              </Link>
              <span className="hidden text-sm text-ink-mute sm:block">
                {user.email}
              </span>
              <SignOutButton />
            </div>
          </div>
        </header>
      </AppHeaderShell>
      {/* LiveAwareMain drops <main>'s top padding AND the offline
          strip's bottom margin on /live routes so the in-game
          sticky bar can anchor flush at viewport top:0. Non-live
          routes keep the original py-4 + mb-3 rhythm. The offline
          banner itself (Slice 5 phase 5e — informational only,
          taps still queue + replay on reconnect) is rendered
          INSIDE LiveAwareMain now so the wrapper's margin can be
          conditional alongside main's padding. */}
      <LiveAwareMain>{children}</LiveAwareMain>
      {/* `pb-[calc(...)]` adds the iPhone home-indicator inset on
          top of the 1rem base so the Help link doesn't sit under
          the indicator on iOS. Resolves to plain 1rem on devices
          without an inset. */}
      <footer className="border-t border-hairline pb-[calc(1rem+env(safe-area-inset-bottom))] pt-4 text-center text-xs text-ink-mute">
        <Link href="/help" className="hover:text-ink-dim">
          Help
        </Link>
      </footer>
    </div>
  );
}
