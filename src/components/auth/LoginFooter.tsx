import Link from "next/link";

/**
 * Login screen footer — `SF / V0.4` mono version stamp on the left,
 * Help / Privacy / Terms link row on the right.
 *
 * Routes are wired to existing pages: `/help`, `/privacy`, `/terms`.
 * Hardcoded version stamp for now; swap to `process.env`-driven
 * once we have a build-time variable for it.
 */
export function LoginFooter() {
  // Wraps: at 320 px with 200% text the links ran 20 px off the screen
  // (R6 follow-up, 25 Oct 2026). The links go under the stamp, and onto
  // their own lines, when a row can't hold them.
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-t border-hairline pt-3 text-xs text-ink-dim">
      <span className="font-mono text-[10px] font-bold uppercase tracking-[0.12em] text-ink-mute">
        SF / V0.4
      </span>
      <div className="flex flex-wrap gap-x-4 gap-y-2">
        <FooterLink href="/help">Help</FooterLink>
        <FooterLink href="/privacy">Privacy</FooterLink>
        <FooterLink href="/terms">Terms</FooterLink>
      </div>
    </div>
  );
}

function FooterLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className="border-b border-hairline pb-px text-ink-dim transition-colors duration-fast ease-out-quart hover:text-ink"
    >
      {children}
    </Link>
  );
}
