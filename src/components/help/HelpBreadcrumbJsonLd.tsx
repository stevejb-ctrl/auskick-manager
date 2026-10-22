"use client";

import { usePathname } from "next/navigation";
import { JsonLd } from "@/components/seo/JsonLd";
import { helpBreadcrumbJsonLd } from "@/lib/structured-data";

/**
 * Home → Help → article breadcrumbs for search engines. It sits in the
 * help layout, which can't see the path, so it reads it here. Client
 * components still render on the server, so the JSON-LD is in the
 * page's HTML.
 */
export function HelpBreadcrumbJsonLd({ siteUrl }: { siteUrl: string }) {
  const crumbs = helpBreadcrumbJsonLd(siteUrl, usePathname());
  return crumbs ? <JsonLd data={crumbs} /> : null;
}
