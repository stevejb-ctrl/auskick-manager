import { SirenWordmark } from "@/components/marketing/SirenWordmark";

/**
 * Mobile-only thin bar above the login form. Replaces the full
 * brand panel on viewports < 720 px (the `md:` breakpoint).
 *
 * Layout: SirenWordmark on the left, mono caption on the right.
 * Surface-coloured strip with a hairline border bottom, matching
 * the prototype's `<LoginMobileBand>`.
 */
export function LoginMobileBand() {
  return (
    <div className="flex items-center justify-between border-b border-hairline bg-surface px-5 py-4 md:hidden">
      <SirenWordmark size="sm" />
      <span className="font-mono text-[9px] font-bold uppercase tracking-[0.14em] text-ink-mute">
        Junior AFL · Team management
      </span>
    </div>
  );
}
