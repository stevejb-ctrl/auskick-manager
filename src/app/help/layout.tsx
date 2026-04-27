import Link from "next/link";
import { HelpNav } from "@/components/help/HelpNav";
import { SirenWordmark } from "@/components/marketing/SirenWordmark";

export const metadata = {
  title: "Help — Siren Footy",
  description: "Documentation and guides for Siren Footy.",
};

export default function HelpLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-warm">
      <header className="sticky top-0 z-10 border-b border-hairline bg-surface">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
          <Link href="/" aria-label="Siren home">
            <SirenWordmark size="sm" />
          </Link>
          <Link
            href="/login"
            className="rounded-md border border-hairline bg-surface px-2.5 py-1 text-xs font-medium text-ink-dim hover:bg-surface-alt hover:text-ink"
          >
            Sign in
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
        <span>Siren Footy · </span>
        <Link href="/login" className="hover:text-ink-dim">
          Sign in
        </Link>
      </footer>
    </div>
  );
}
