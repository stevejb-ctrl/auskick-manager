import type { Metadata } from "next";

// ─── /offline ─────────────────────────────────────────────────
//
// Slice 6 fallback. The service worker (configured in
// next.config.mjs) routes any failed page navigation here so the
// WebView shows our own copy instead of Chrome's grey
// ERR_INTERNET_DISCONNECTED page or Next's "Failed to fetch"
// generic error. Coach gets a clear, branded explanation and one-
// tap recovery actions.
//
// Static by design: no server data fetching, no auth check, no
// branding logic. The whole point is that this page works when
// nothing else does.

export const metadata: Metadata = {
  title: "You're offline — Siren Footy",
  robots: { index: false, follow: false },
};

export default function OfflinePage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center px-6 py-12 text-center">
      <div
        aria-hidden="true"
        className="mb-6 inline-flex h-12 w-12 items-center justify-center rounded-full border border-warn/40 bg-warn-soft"
      >
        <span className="block h-3 w-3 rounded-full bg-warn" />
      </div>

      <h1 className="text-2xl font-semibold tracking-tight text-ink">
        You&rsquo;re offline
      </h1>

      <p className="mt-3 text-sm leading-relaxed text-ink-dim">
        We can&rsquo;t reach the internet right now. If you&rsquo;re running a
        game, anything you tapped will sync the moment you reconnect &mdash;
        keep going.
      </p>

      <div className="mt-6 flex w-full flex-col gap-2">
        <a
          href="/dashboard"
          className="inline-flex w-full items-center justify-center rounded-md border border-brand-700 bg-brand-700 px-4 py-2 text-sm font-medium text-white shadow-card transition-colors duration-fast ease-out-quart hover:bg-brand-800"
        >
          Try again
        </a>
        <a
          href="/dashboard"
          className="inline-flex w-full items-center justify-center rounded-md border border-hairline bg-surface px-4 py-2 text-sm font-medium text-ink-dim transition-colors duration-fast ease-out-quart hover:bg-surface-alt hover:text-ink"
        >
          Open dashboard
        </a>
      </div>

      <p className="mt-8 text-xs leading-relaxed text-ink-mute">
        This page lives in the app&rsquo;s offline cache, so it will always
        load &mdash; even with no signal.
      </p>
    </main>
  );
}
