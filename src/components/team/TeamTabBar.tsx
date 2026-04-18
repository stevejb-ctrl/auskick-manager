"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

interface TeamTabBarProps {
  teamId: string;
}

export function TeamTabBar({ teamId }: TeamTabBarProps) {
  const pathname = usePathname();

  const tabs = [
    { label: "Squad", href: `/teams/${teamId}/squad` },
    { label: "Games", href: `/teams/${teamId}/games` },
  ];

  return (
    <nav className="border-b border-gray-200">
      <ul className="-mb-px flex gap-6">
        {tabs.map((tab) => {
          const isActive = pathname?.startsWith(tab.href);
          return (
            <li key={tab.href}>
              <Link
                href={tab.href}
                className={`inline-block border-b-2 px-1 py-3 text-sm font-medium transition-colors ${
                  isActive
                    ? "border-brand-600 text-brand-600"
                    : "border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700"
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
