"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

interface TeamTabBarProps {
  teamId: string;
}

export function TeamTabBar({ teamId }: TeamTabBarProps) {
  const pathname = usePathname();

  const tabs = [
    { label: "Home", href: `/teams/${teamId}`, exact: true },
    { label: "Squad", href: `/teams/${teamId}/squad` },
    { label: "Games", href: `/teams/${teamId}/games` },
    { label: "Stats", href: `/teams/${teamId}/stats` },
    { label: "Settings", href: `/teams/${teamId}/settings` },
  ];

  return (
    <nav className="border-b border-hairline overflow-x-auto scrollbar-none">
      <ul className="-mb-px flex gap-1 whitespace-nowrap">
        {tabs.map((tab) => {
          const isActive = tab.exact
            ? pathname === tab.href
            : pathname?.startsWith(tab.href);
          return (
            <li key={tab.href}>
              <Link
                href={tab.href}
                className={`inline-block border-b-2 px-3 py-3 text-sm font-medium transition-colors duration-fast ${
                  isActive
                    ? "border-brand-600 text-brand-600"
                    : "border-transparent text-ink-mute hover:border-hairline hover:text-ink-dim"
                }`}
              >
                {tab.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
