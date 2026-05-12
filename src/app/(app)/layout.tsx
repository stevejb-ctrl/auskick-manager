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

          `fixed` (not `sticky`) so the header positions relative to
          the viewport, not the scroll container. This sidesteps an
          iOS WebView bug where `position: sticky` + Capacitor's
          `contentInset: "always"` produces a phantom top gap (the
          contentInset's empty area shows through above the sticky
          header when at scroll=0). Fixed positioning ignores the
          scroll container's contentInset entirely — header always
          sits at screen top, internal `pt-[env(safe-area-inset-top)]`
          handles the status-bar offset.

          The corresponding push-down for page content lives on
          `<main>` below as `pt-[calc(env(safe-area-inset-top)+3.5rem)]`
          — accounts for the safe-area inset plus the header's own
          py-2/sm:py-3 + wordmark height (~3.5rem total).

          z-20: the netball court's PositionToken wrappers use z-10
          for sibling stacking (goal-confirm chip etc.), so a sticky
          header at z-10 ties on stacking order and tokens render in
          front on scroll. z-20 keeps the header above page content
          while staying under modals (z-50).

          Backdrop-blur + 80%-alpha bg is the small-but-distinctive
          touch that signals "app top bar" rather than "website nav". */}
      <header className="fixed inset-x-0 top-0 z-20 border-b border-hairline bg-surface/85 pt-[env(safe-area-inset-top)] backdrop-blur supports-[backdrop-filter]:bg-surface/70">
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
      <main className="px-4 pb-4 pt-[calc(env(safe-area-inset-top)+3.5rem)]">
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
      {/* `pb-[calc(...)]` keeps the existing 1rem footer padding and
          adds whatever the iPhone home-indicator inset is on top so
          the Help link doesn't sit under the home indicator on
          iOS. Resolves to plain 1rem on devices without an inset. */}
      <footer className="border-t border-hairline pb-[calc(1rem+env(safe-area-inset-bottom))] pt-4 text-center text-xs text-ink-mute">
        <Link href="/help" className="hover:text-ink-dim">
          Help
        </Link>
      </footer>
    </div>
  );
}
