import Link from "next/link";
import { SirenWordmark } from "@/components/marketing/SirenWordmark";
import { SportThemeProvider } from "@/components/marketing/SportTheme";

// Public auth shell: login, signup, forgot-password, reset. Sits on the
// marketing side of the brand register — cream background, ink slab
// CTAs, accent reserved for typographic highlights — so the journey
// from the landing page through sign-in feels like one continuous
// surface. Wrapped in SportThemeProvider so any `accent` token used
// inside the forms picks up the same alarm-orange palette as `/`.
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <SportThemeProvider sport="footy">
      <div className="flex min-h-screen flex-col items-center justify-center bg-warm px-4 py-12">
        <div className="w-full max-w-sm">
          <div className="mb-8 flex flex-col items-center text-center">
            <Link href="/" aria-label="Siren home" className="inline-flex items-center gap-2">
              <SirenWordmark size="lg" pulsing />
              <span className="text-3xl font-medium leading-none text-ink-dim">
                Footy
              </span>
            </Link>
            <p className="mt-3 font-mono text-[11px] font-bold uppercase tracking-banner text-ink-mute">
              Junior AFL team management
            </p>
          </div>
          <div className="rounded-lg border border-hairline bg-surface px-6 py-8 shadow-card">
            {children}
          </div>
          <p className="mt-6 text-center font-mono text-[11px] uppercase tracking-banner text-ink-mute">
            <Link
              href="/help"
              className="transition-colors duration-fast ease-out-quart hover:text-ink-dim"
            >
              Help
            </Link>
          </p>
        </div>
      </div>
    </SportThemeProvider>
  );
}
