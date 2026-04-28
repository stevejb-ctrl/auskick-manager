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
  return (
    <div className="flex items-center justify-between border-t border-hairline pt-3 text-xs text-ink-dim">
      <span className="font-mono text-[10px] font-bold uppercase tracking-[0.12em] text-ink-mute">
        SF / V0.4
      </span>
      <div className="flex gap-4">
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
