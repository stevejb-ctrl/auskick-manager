"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export function AdminTabBar() {
  const pathname = usePathname();

  const tabs = [
    { label: "Overview", href: "/admin", exact: true },
    { label: "Users", href: "/admin/users" },
    { label: "Teams", href: "/admin/teams" },
    { label: "Games", href: "/admin/games" },
    { label: "Tags", href: "/admin/tags" },
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
