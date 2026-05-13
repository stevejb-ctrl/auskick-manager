import Link from "next/link";
import { DeviceFrame } from "@/components/DeviceFrame";
import { SirenWordmark } from "@/components/marketing/SirenWordmark";

export default function RunLayout({ children }: { children: React.ReactNode }) {
  return (
    <div>
      {/* Non-sticky — scrolls with the page so it doesn't stack
          with LiveTopBar (also sticky-top) once the runner reaches
          the live game. The chevron+wordmark is still visible on
          first paint of every route as a back-to-home affordance;
          once the user scrolls / the live-game UI takes over,
          LiveTopBar's "✕ Exit" carries the navigation duty.
          Steve 2026-05-13 audit fix. */}
      <header className="border-b border-hairline bg-surface">
        <div className="flex items-center px-3 py-2">
          <Link
            href="/"
            className="flex items-center gap-1"
            aria-label="Siren home"
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
