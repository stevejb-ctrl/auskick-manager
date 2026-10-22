// JSON-LD for search engines: who makes Siren, that it's an app, and
// where each help page sits. e2e/tests/seo.spec.ts checks the same
// data lands in the served HTML.
import { describe, expect, it } from "vitest";
import {
  helpBreadcrumbJsonLd,
  organizationJsonLd,
  serializeJsonLd,
  softwareApplicationJsonLd,
  websiteJsonLd,
} from "@/lib/structured-data";
import { APP_STORE_URL } from "@/lib/app-links";
import { HELP_PAGES } from "@/lib/help/pages";

const SITE = "https://www.sirenfooty.com.au";
const COPY = {
  productName: "Siren Footy",
  metaDescription: "Junior AFL game manager.",
};

describe("organizationJsonLd", () => {
  it("names Siren, with a logo and a support contact", () => {
    expect(organizationJsonLd(SITE)).toEqual({
      "@context": "https://schema.org",
      "@type": "Organization",
      "@id": `${SITE}/#organization`,
      name: "Siren",
      url: `${SITE}/`,
      logo: `${SITE}/favicon-512.png`,
      contactPoint: {
        "@type": "ContactPoint",
        contactType: "customer support",
        email: "hello@sirenfooty.com.au",
        areaServed: "AU",
        availableLanguage: "en-AU",
      },
    });
  });
});

describe("websiteJsonLd", () => {
  it("names the brand site and points at the organisation", () => {
    expect(websiteJsonLd(SITE, COPY.productName)).toEqual({
      "@context": "https://schema.org",
      "@type": "WebSite",
      name: "Siren Footy",
      url: `${SITE}/`,
      inLanguage: "en-AU",
      publisher: { "@id": `${SITE}/#organization` },
    });
  });
});

describe("softwareApplicationJsonLd", () => {
  const app = softwareApplicationJsonLd(SITE, COPY);

  it("describes a free sports app on iOS and the web", () => {
    expect(app).toMatchObject({
      "@context": "https://schema.org",
      "@type": "SoftwareApplication",
      name: "Siren Footy",
      description: "Junior AFL game manager.",
      url: `${SITE}/`,
      applicationCategory: "SportsApplication",
      operatingSystem: "iOS, Web",
      installUrl: APP_STORE_URL,
      offers: { "@type": "Offer", price: "0", priceCurrency: "AUD" },
      publisher: { "@id": `${SITE}/#organization` },
    });
  });

  it("claims no ratings or reviews", () => {
    expect(app).not.toHaveProperty("aggregateRating");
    expect(app).not.toHaveProperty("review");
  });
});

describe("helpBreadcrumbJsonLd", () => {
  it("runs Home → Help → the article", () => {
    expect(helpBreadcrumbJsonLd(SITE, "/help/squads")).toEqual({
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "Home", item: `${SITE}/` },
        { "@type": "ListItem", position: 2, name: "Help", item: `${SITE}/help` },
        { "@type": "ListItem", position: 3, name: "Squads", item: `${SITE}/help/squads` },
      ],
    });
  });

  it("stops at Help on the help home page", () => {
    expect(helpBreadcrumbJsonLd(SITE, "/help")?.itemListElement).toEqual([
      { "@type": "ListItem", position: 1, name: "Home", item: `${SITE}/` },
      { "@type": "ListItem", position: 2, name: "Help", item: `${SITE}/help` },
    ]);
  });

  it("covers every help page, ending on its title", () => {
    for (const page of HELP_PAGES.filter((p) => p.href !== "/help")) {
      const items = helpBreadcrumbJsonLd(SITE, page.href)?.itemListElement;
      expect(items, page.href).toHaveLength(3);
      expect(items?.[2], page.href).toMatchObject({ name: page.title, item: `${SITE}${page.href}` });
    }
  });

  it("returns nothing outside the help pages", () => {
    expect(helpBreadcrumbJsonLd(SITE, "/help/not-a-page")).toBeNull();
    expect(helpBreadcrumbJsonLd(SITE, "/")).toBeNull();
  });
});

describe("serializeJsonLd", () => {
  it("can't close the script tag it sits in", () => {
    const out = serializeJsonLd({ name: "</script><script>alert(1)</script>" });
    expect(out).not.toContain("</script>");
    expect(JSON.parse(out)).toEqual({ name: "</script><script>alert(1)</script>" });
  });
});
