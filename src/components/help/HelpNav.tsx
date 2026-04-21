"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { HELP_PAGES } from "@/lib/help/pages";

export function HelpNav() {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [query, setQuery] = useState("");

  const filtered = HELP_PAGES.filter((p) =>
    p.title.toLowerCase().includes(query.toLowerCase())
  );

  function isActive(href: string) {
    if (href === "/help") return pathname === "/help";
    return pathname.startsWith(href);
  }

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
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              aria-hidden
            >
              <path
                d="M4 6h16M4 12h16M4 18h10"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
              />
            </svg>
            Topics
          </span>
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            className={`text-ink-mute transition-transform duration-fast ${mobileOpen ? "rotate-180" : ""}`}
            aria-hidden
          >
            <path
              d="M6 9l6 6 6-6"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>

        {mobileOpen && (
          <div className="mt-2 rounded-lg border border-hairline bg-surface p-3 shadow-card">
            <NavContents
              pages={filtered}
              isActive={isActive}
              query={query}
              setQuery={setQuery}
              onLinkClick={() => setMobileOpen(false)}
            />
          </div>
        )}
      </div>

      {/* Desktop: always-visible sidebar */}
      <nav className="hidden md:block" aria-label="Help topics">
        <NavContents
          pages={filtered}
          isActive={isActive}
          query={query}
          setQuery={setQuery}
        />
      </nav>
    </>
  );
}

interface NavContentsProps {
  pages: typeof HELP_PAGES;
  isActive: (href: string) => boolean;
  query: string;
  setQuery: (q: string) => void;
  onLinkClick?: () => void;
}

function NavContents({
  pages,
  isActive,
  query,
  setQuery,
  onLinkClick,
}: NavContentsProps) {
  return (
    <div className="space-y-1">
      <div className="mb-3">
        <input
          type="search"
          placeholder="Search topics…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="w-full rounded-md border border-hairline bg-warm px-3 py-1.5 text-sm text-ink placeholder-ink-mute focus:border-brand-400 focus:outline-none focus:ring-1 focus:ring-brand-400"
        />
      </div>

      {pages.length === 0 ? (
        <p className="px-2 py-1 text-xs text-ink-mute">No topics match.</p>
      ) : (
        <ul>
          {pages.map((page) => (
            <li key={page.slug}>
              <Link
                href={page.href}
                onClick={onLinkClick}
                className={`block rounded-md px-2.5 py-1.5 text-sm transition-colors duration-fast ${
                  isActive(page.href)
                    ? "bg-brand-50 font-semibold text-brand-700"
                    : "text-ink-dim hover:bg-surface-alt hover:text-ink"
                }`}
              >
                {page.title}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
