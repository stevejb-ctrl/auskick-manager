import { HELP_PAGES } from "@/lib/help/pages";
import { INDEXABLE_ROUTES } from "@/lib/public-routes";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/**
 * When a help page last changed: the sitemap's lastModified
 * (src/lib/public-routes.ts), so the date a reader sees, the article's
 * JSON-LD and the sitemap can't disagree. Bump it there. The label is
 * built by hand ("21 Oct 2026"), not with toLocaleDateString, so the
 * server and the browser render the same text. Null off the help pages.
 */
export function helpPageUpdated(pathname: string): { iso: string; label: string } | null {
  if (!HELP_PAGES.some((p) => p.href === pathname)) return null;
  const iso = INDEXABLE_ROUTES.find((r) => r.path === pathname)?.lastModified;
  if (!iso) return null;
  const [year, month, day] = iso.split("-").map(Number);
  return { iso, label: `${day} ${MONTHS[month - 1]} ${year}` };
}
