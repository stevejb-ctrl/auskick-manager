import Link from "next/link";
import { HelpBreadcrumbJsonLd } from "@/components/help/HelpBreadcrumbJsonLd";
import { HelpNav } from "@/components/help/HelpNav";
import { SirenWordmark } from "@/components/marketing/SirenWordmark";
import { siteUrl } from "@/lib/seo";
import { getUser } from "@/lib/supabase/server";

export const metadata = {
  title: "Help · Siren",
  description: "How to use Siren, the game-day app for junior sport coaches.",
};

// Help opens from inside the app (the avatar menu), so a signed-in
// coach gets a way back instead of a "Sign in" button (UX plan §2.5).
export default async function HelpLayout({ children }: { children: React.ReactNode }) {
  const {
    data: { user },
  } = await getUser();
  const exit = user
    ? { href: "/dashboard", label: "← Back to Siren" }
    : { href: "/login", label: "Sign in" };
  return (
    <div className="min-h-screen bg-warm">
      <HelpBreadcrumbJsonLd siteUrl={siteUrl()} />
      <header className="sticky top-0 z-10 border-b border-hairline bg-surface">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
          <Link href={user ? "/dashboard" : "/"} aria-label="Siren home">
            <SirenWordmark size="sm" />
          </Link>
          <Link
            href={exit.href}
            className="inline-flex min-h-[44px] items-center rounded-md border border-hairline bg-surface px-3 text-xs font-medium text-ink-dim hover:bg-surface-alt hover:text-ink"
          >
            {exit.label}
          </Link>
        </div>
      </header>

      <div className="mx-auto max-w-5xl px-4 py-8">
        <div className="md:flex md:gap-10">
          <aside className="mb-6 md:mb-0 md:w-48 md:shrink-0">
            <p className="mb-3 font-mono text-[10px] font-bold uppercase tracking-micro text-ink-mute">
              Help
            </p>
            <HelpNav />
          </aside>

          <main className="min-w-0 flex-1">{children}</main>
        </div>
      </div>

      <footer className="mt-12 border-t border-hairline py-6 text-center text-xs text-ink-mute">
        <span>Siren · </span>
        <Link href={exit.href} className="hover:text-ink-dim">
          {exit.label}
        </Link>
      </footer>
    </div>
  );
}
