import { APP_STORE_URL } from "@/lib/app-links";
import { HELP_PAGES } from "@/lib/help/pages";
import {
  FEATURES,
  MAKER,
  PLATFORMS,
  PRICE,
  sirenOneLiner,
  sportsSentence,
} from "@/lib/siren-facts";

// ─── Structured data (JSON-LD) for search engines ────────────
// Plain builders: each takes the brand's canonical host (siteUrl())
// so sirenfooty.com.au and sirennetball.com.au describe themselves.
// <JsonLd> (src/components/seo/JsonLd.tsx) renders them.
//
// Only state what's true. No aggregateRating or review until there
// are real ones from a review source: Google treats invented ratings
// as spam, and Australian consumer law covers them too. The facts
// (sports, price, platforms, who makes Siren) come from
// src/lib/siren-facts.ts, as the pages' copy does.

const CONTEXT = "https://schema.org";
const SUPPORT_EMAIL = "hello@sirenfooty.com.au";

type JsonLdObject = Record<string, unknown>;

function organizationId(siteUrl: string): string {
  return `${siteUrl}/#organization`;
}

/** Siren, the publisher behind every brand site. */
export function organizationJsonLd(siteUrl: string): JsonLdObject {
  return {
    "@context": CONTEXT,
    "@type": "Organization",
    "@id": organizationId(siteUrl),
    name: "Siren",
    url: `${siteUrl}/`,
    logo: `${siteUrl}/favicon-512.png`,
    description: sirenOneLiner(),
    // Profiles elsewhere that are Siren. Add social pages as they open.
    sameAs: [APP_STORE_URL],
    founder: {
      "@type": "Person",
      name: MAKER.name,
      description: `A ${MAKER.role} in ${MAKER.country}`,
    },
    areaServed: { "@type": "Country", name: MAKER.country },
    contactPoint: {
      "@type": "ContactPoint",
      contactType: "customer support",
      email: SUPPORT_EMAIL,
      areaServed: "AU",
      availableLanguage: "en-AU",
    },
  };
}

/** The brand site itself, so results can show its name. */
export function websiteJsonLd(siteUrl: string, productName: string): JsonLdObject {
  return {
    "@context": CONTEXT,
    "@type": "WebSite",
    name: productName,
    url: `${siteUrl}/`,
    inLanguage: "en-AU",
    publisher: { "@id": organizationId(siteUrl) },
  };
}

/**
 * Siren as an app: every sport, its features, and the price from
 * siren-facts (free for the 2026 season, so a $0 offer valid to the
 * season's end). iOS has a store listing; Android runs it on the web
 * until a Play listing ships.
 */
export function softwareApplicationJsonLd(siteUrl: string, productName: string): JsonLdObject {
  return {
    "@context": CONTEXT,
    "@type": "SoftwareApplication",
    name: productName,
    description: sirenOneLiner(),
    url: `${siteUrl}/`,
    applicationCategory: "SportsApplication",
    operatingSystem: PLATFORMS.operatingSystem,
    installUrl: APP_STORE_URL,
    featureList: [`Sports: ${sportsSentence()}`, ...FEATURES],
    offers: {
      "@type": "Offer",
      price: String(PRICE.amountAud),
      priceCurrency: "AUD",
      priceValidUntil: PRICE.validUntil,
      description: PRICE.line,
    },
    publisher: { "@id": organizationId(siteUrl) },
  };
}

/**
 * Home → Help → article, for a help page's path. The titles come from
 * HELP_PAGES, the same registry the help nav reads. Null for any path
 * that isn't a help page.
 */
export function helpBreadcrumbJsonLd(
  siteUrl: string,
  pathname: string,
): { "@context": string; "@type": "BreadcrumbList"; itemListElement: JsonLdObject[] } | null {
  const page = HELP_PAGES.find((p) => p.href === pathname);
  if (!page) return null;

  const trail = [
    { name: "Home", path: "/" },
    { name: "Help", path: "/help" },
    ...(page.href === "/help" ? [] : [{ name: page.title, path: page.href }]),
  ];
  return {
    "@context": CONTEXT,
    "@type": "BreadcrumbList",
    itemListElement: trail.map((crumb, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: crumb.name,
      item: `${siteUrl}${crumb.path}`,
    })),
  };
}

/**
 * JSON for a <script type="application/ld+json">. Escapes "<" so no
 * string in the data can close the script tag early.
 */
export function serializeJsonLd(data: JsonLdObject): string {
  return JSON.stringify(data).replace(/</g, "\\u003c");
}
