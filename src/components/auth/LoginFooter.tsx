import Link from "next/link";

/**
 * Login screen footer — Help / Privacy / Terms link row.
 *
 * Routes are wired to existing pages: `/help`, `/privacy`, `/terms`.
 * The old "SF / V0.4" stamp went (design review, Oct 2026): an
 * internal version label means nothing to a coach signing in.
 */
export function LoginFooter() {
  return (
    <div className="flex items-center justify-end border-t border-hairline pt-3 text-xs text-ink-dim">
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
