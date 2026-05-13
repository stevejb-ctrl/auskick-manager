import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient, getUser } from "@/lib/supabase/server";
import { SignOutButton } from "@/components/auth/SignOutButton";
import { SirenWordmark } from "@/components/marketing/SirenWordmark";
import { NativeNotificationsBridge } from "@/components/notifications/NativeNotificationsBridge";
import { OfflineBanner } from "@/components/live/OfflineBanner";

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

          `fixed` (not `sticky`) so the header is anchored to the
          viewport at all scroll positions. Sticky would partially
          scroll with the page in the in-flow → locked transition,
          which on iOS Capacitor produces a visible top-gap that
          shifts as the user scrolls.

          z-20: the netball court's PositionToken wrappers use z-10
          for sibling stacking (goal-confirm chip etc.). z-20 keeps
          the header above page content while staying under modals
          (z-50).

          `pt-[var(--safe-top)]` resolves to `env(safe-area-inset-
          top)` on web/PWA and a static 3rem on native (see
          globals.css). The native fallback exists because iOS
          WKWebView's `contentInset: "always"` interacts badly
          with env() values; mobile/capacitor.config.ts has been
          updated to `"never"` for the next native build, after
          which env() will work everywhere and the static
          fallback can go away.

          Backdrop-blur + 80%-alpha bg signals "app top bar"
          rather than "website nav". */}
      <header
        className="fixed inset-x-0 top-0 z-20 border-b border-hairline bg-surface/85 pt-[var(--safe-top)] backdrop-blur supports-[backdrop-filter]:bg-surface/70"
      >
        <div className="mx-auto flex max-w-4xl items-center justify-between px-4 py-2 sm:py-3">
          <SirenWordmark size="sm" />
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
      <main className="px-4 pb-4 pt-[calc(var(--safe-top)+3.5rem)]">
        {/* Persistent offline strip: invisible when online (zero
            pixels), shows a warn-coloured banner when the device
            is offline. Slice 5 phase 5e — offline taps in the
            live game still queue + replay on reconnect, so this
            is informational, not blocking. */}
        <div className="mx-auto mb-3 max-w-4xl">
          <OfflineBanner />
        </div>
        {children}
      </main>
      {/* `pb-[calc(...)]` uses `--safe-bottom` so it stacks an
          extra inset over the 1rem base on web/PWA, and resolves
          to plain 1rem on the Capacitor shell (Capacitor's iOS
          contentInset handles the home indicator there). */}
      <footer
        className="border-t border-hairline pb-[calc(1rem+var(--safe-bottom))] pt-4 text-center text-xs text-ink-mute"
      >
        <Link href="/help" className="hover:text-ink-dim">
          Help
        </Link>
      </footer>
    </div>
  );
}
