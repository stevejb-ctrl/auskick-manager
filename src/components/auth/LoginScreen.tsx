import { LoginBrandPanel } from "@/components/auth/LoginBrandPanel";
import { LoginFooter } from "@/components/auth/LoginFooter";
import { LoginForm } from "@/components/auth/LoginForm";
import { LoginMobileBand } from "@/components/auth/LoginMobileBand";
import { SirenWordmark } from "@/components/marketing/SirenWordmark";

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
  return (
    <div className="flex min-h-screen flex-col bg-warm text-ink antialiased md:flex-row">
      <LoginMobileBand />

      {/* Form column */}
      <div className="flex flex-col px-5 pb-9 pt-5 md:flex-[0_0_52%] md:min-h-screen md:px-14 md:py-10">
        {/* Brand row — hidden on mobile (the band carries it instead) */}
        <div className="hidden items-center gap-2.5 md:flex">
          <SirenWordmark size="sm" />
          <span className="border-l border-hairline pl-2.5 text-xs text-ink-dim">
            Junior AFL team management
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
