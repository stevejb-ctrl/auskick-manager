"use client";

import { usePathname } from "next/navigation";
import { JsonLd } from "@/components/seo/JsonLd";
import { helpPageUpdated } from "@/lib/help/updated";
import { MAKER } from "@/lib/siren-facts";
import { helpArticleJsonLd } from "@/lib/structured-data";

/**
 * "Updated 21 Oct 2026 · Steve Bull, parent-coach" under each help
 * article, and the same date and author as TechArticle JSON-LD. Dated,
 * authored pages are what search engines and AI answers prefer to
 * cite. It sits in the help layout, which can't see the path, so it
 * reads it here (as HelpBreadcrumbJsonLd does); it still renders on the
 * server, so crawlers get it.
 */
export function HelpArticleMeta({ siteUrl }: { siteUrl: string }) {
  const pathname = usePathname();
  const updated = helpPageUpdated(pathname);
  const article = helpArticleJsonLd(siteUrl, pathname);
  if (!updated || !article) return null;
  return (
    <>
      <JsonLd data={article} />
      <p
        data-testid="help-updated"
        className="mt-10 border-t border-hairline pt-4 text-xs text-ink-mute"
      >
        Updated <time dateTime={updated.iso}>{updated.label}</time> &middot; {MAKER.name},{" "}
        {MAKER.role}
      </p>
    </>
  );
}
