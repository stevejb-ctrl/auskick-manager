import { LoginBrandPanel } from "@/components/auth/LoginBrandPanel";
import { LoginFooter } from "@/components/auth/LoginFooter";
import { LoginForm } from "@/components/auth/LoginForm";
import { LoginMobileBand } from "@/components/auth/LoginMobileBand";
import { SirenWordmark } from "@/components/marketing/SirenWordmark";
import { getBrand } from "@/lib/brand";

/**
 * Full-screen login layout.
 *
 *   Desktop (≥ md = 768 px in Tailwind, close enough to the design's
 *   720 px breakpoint):
 *     ┌────────── form ────────┬───── brand panel ─────┐
 *     │  wordmark + tagline    │  giant footy oval     │
 *     │   ...form body...      │  headline + bullets   │
 *     │  footer                │                       │
 *     └────────────────────────┴───────────────────────┘
 *
 *   Mobile (< md):
 *     ┌────────────────────────┐
 *     │   mobile band          │
 *     │   ...form body...      │
 *     │   footer               │
 *     └────────────────────────┘
 *
 * The form column is capped at ~400 px content width so the layout
 * stays readable even on very wide phone-only viewports (when the
 * brand panel is hidden).
 */
export function LoginScreen() {
  // Steve 2026-05-17: align with the marketing design refresh
  // (commit 718e7e4 — mint backdrop, accent in place of
  // italic-serif). The form column inherits the mint gradient
  // from this wrapper; the dark brand panel on the right keeps
  // its own `bg-ink` surface, and the mobile band keeps its
  // `bg-surface` strip so the wordmark has a clean read on top
  // of the gradient.
  const brand = getBrand();
  return (
    <div className="flex min-h-screen flex-col bg-gradient-to-b from-brand-50 to-brand-100 text-ink antialiased md:flex-row">
      <LoginMobileBand />

      {/* Form column */}
      <div className="flex flex-col px-5 pb-9 pt-5 md:flex-[0_0_52%] md:min-h-screen md:px-14 md:py-10">
        {/* Brand row — hidden on mobile (the band carries it
            instead). Caption is brand-aware (Steve 2026-05-17):
            AFL → "Junior AFL team management", netball → "Junior
            Netball team management". */}
        <div className="hidden items-center gap-2.5 md:flex">
          <SirenWordmark size="sm" />
          <span className="border-l border-hairline pl-2.5 text-xs text-ink-dim">
            Junior {brand.shortName} team management
          </span>
        </div>

        {/* Form body — vertically centred in the column */}
        <div className="mx-auto flex w-full max-w-[400px] flex-1 flex-col justify-center pb-2 pt-2 md:pb-10 md:pt-10">
          <LoginForm />
        </div>

        <LoginFooter />
      </div>

      <LoginBrandPanel />
    </div>
  );
}
