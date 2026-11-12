"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { HELP_PAGES } from "@/lib/help/pages";
import { SPORT_HELP, sportHelpByPath, type SportHelp } from "@/lib/help/sports";

/**
 * The help sidebar (a collapsible Topics menu on phones): the global
 * topics, then the ten sports. Inside a sport hub, that sport's
 * sections are listed under it, so a coach can jump straight to its
 * scoring or its subs.
 */
export function HelpNav() {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [query, setQuery] = useState("");
  const hub = sportHelpByPath(pathname);

  return (
    <>
      {/* Mobile: collapsible topics menu */}
      <div className="md:hidden">
        <button
          type="button"
          onClick={() => setMobileOpen((o) => !o)}
          className="flex w-full items-center justify-between rounded-md border border-hairline bg-surface px-3 py-2.5 text-sm font-medium text-ink shadow-card"
          aria-expanded={mobileOpen}
        >
          <span className="flex items-center gap-2">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
              <path d="M4 6h16M4 12h16M4 18h10" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
            {hub ? `Topics · ${hub.title}` : "Topics"}
          </span>
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            className={`text-ink-mute transition-transform duration-fast ${mobileOpen ? "rotate-180" : ""}`}
            aria-hidden
          >
            <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>

        {mobileOpen && (
          <div className="mt-2 rounded-lg border border-hairline bg-surface p-3 shadow-card">
            <NavContents
              pathname={pathname}
              hub={hub}
              query={query}
              setQuery={setQuery}
              onLinkClick={() => setMobileOpen(false)}
            />
          </div>
        )}
      </div>

      {/* Desktop: always-visible sidebar */}
      <nav className="hidden md:block" aria-label="Help topics">
        <NavContents pathname={pathname} hub={hub} query={query} setQuery={setQuery} />
      </nav>
    </>
  );
}

interface NavContentsProps {
  pathname: string;
  hub: SportHelp | undefined;
  query: string;
  setQuery: (q: string) => void;
  onLinkClick?: () => void;
}

const linkClass = (active: boolean) =>
  `block rounded-md px-2.5 py-1.5 text-sm transition-colors duration-fast ${
    active ? "bg-brand-50 font-semibold text-brand-700" : "text-ink-dim hover:bg-surface-alt hover:text-ink"
  }`;

function NavContents({ pathname, hub, query, setQuery, onLinkClick }: NavContentsProps) {
  const q = query.trim().toLowerCase();
  const matches = (text: string) => text.toLowerCase().includes(q);
  // A topic matches on its blurb too, word by word on each word's stem:
  // "subs" finds Rotations ("the next sub"), "injury" The Live Screen
  // ("injuries"), "fix score" Keeping Score ("fixing scores"). Titles
  // alone answered "No topics match" (Stagehand round 11).
  const stems = q.split(/\s+/).filter(Boolean).map((w) => w.slice(0, Math.max(3, w.length - 2)));
  const topicMatches = (p: { title: string; description: string }) => {
    const text = `${p.title} ${p.description}`.toLowerCase();
    return matches(p.title) || (stems.length > 0 && stems.every((s) => text.includes(s)));
  };
  const topics = HELP_PAGES.filter(topicMatches);
  const sports = SPORT_HELP.filter(
    (h) => matches(h.title) || (h === hub && h.sections.some((s) => matches(s.title))),
  );
  const isActive = (href: string) => (href === "/help" ? pathname === "/help" : pathname === href);

  return (
    <div className="space-y-1">
      <div className="mb-3">
        <input
          type="search"
          placeholder="Search topics…"
          aria-label="Search help topics"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="w-full rounded-md border border-hairline bg-warm px-3 py-1.5 text-sm text-ink placeholder-ink-mute focus:border-brand-400 focus:outline-none focus:ring-1 focus:ring-brand-400"
        />
      </div>

      {topics.length === 0 && sports.length === 0 ? (
        <p className="px-2 py-1 text-xs text-ink-mute">No topics match.</p>
      ) : null}

      {topics.length > 0 && (
        <ul data-testid="help-nav-topics">
          {topics.map((page) => (
            <li key={page.slug}>
              <Link href={page.href} onClick={onLinkClick} className={linkClass(isActive(page.href))}>
                {page.title}
              </Link>
            </li>
          ))}
        </ul>
      )}

      {sports.length > 0 && (
        <>
          <p className="mb-1 mt-5 px-2.5 font-mono text-nano font-bold uppercase tracking-micro text-ink-mute">
            Your sport
          </p>
          <ul data-testid="help-nav-sports">
            {sports.map((h) => (
              <li key={h.href}>
                <Link
                  href={h.href}
                  onClick={onLinkClick}
                  aria-current={h === hub ? "page" : undefined}
                  className={linkClass(h === hub)}
                >
                  <span
                    aria-hidden
                    className="mr-2 inline-block h-2 w-2 rounded-full align-middle"
                    style={{ backgroundColor: h.sport.accent }}
                  />
                  {h.title}
                </Link>
                {h === hub && (
                  <ul className="mb-2 ml-4 border-l border-hairline pl-2" data-testid="help-nav-sections">
                    {h.sections.map((s) => (
                      <li key={s.id}>
                        <Link
                          href={`${h.href}#${s.id}`}
                          onClick={onLinkClick}
                          className="block rounded-md px-2 py-1 text-xs text-ink-dim hover:bg-surface-alt hover:text-ink"
                        >
                          {s.title}
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
