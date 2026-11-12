import type { HomeContent } from "@/lib/marketing/homeContent";

interface TrustBandProps {
  entries: HomeContent["trustBand"];
  className?: string;
}

/**
 * Four plain facts along the foot of the homepage hero, on the grass:
 * the boundary line under the pitch. Each is its number in Archivo,
 * then what it counts, run together as a sentence would ("10 junior
 * sports"), so it reads as a fact rather than a dashboard.
 */
export function TrustBand({ entries, className = "" }: TrustBandProps) {
  return (
    <ul aria-label="At a glance" className={`grid grid-cols-2 gap-x-6 gap-y-4 py-6 sm:flex sm:flex-wrap sm:gap-x-10 ${className}`}>
      {entries.map((item) => (
        <li key={item.label} className="flex items-baseline gap-2 text-mark">
          <span className="font-display text-[1.75rem] font-extrabold leading-none stretch-75">{item.stat}</span>
          <span className="text-[0.9375rem] leading-snug text-mark/80">{item.label}</span>
        </li>
      ))}
    </ul>
  );
}
