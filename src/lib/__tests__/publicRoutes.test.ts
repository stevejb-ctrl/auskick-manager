// Every page under src/app must be classified in src/lib/public-routes.ts:
// indexed (in the sitemap), unlisted, or private (disallowed in
// robots.txt). The sitemap used to be a hand-kept list, and /why-siren
// and /support never made it in.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { MARKETING_SPORTS, sportPagePath } from "@/lib/sports/marketing-sports";
import {
  INDEXABLE_ROUTES,
  UNLISTED_ANALYTICS_PATHS,
  UNLISTED_PUBLIC_PATHS,
  isPrivatePath,
} from "@/lib/public-routes";

const APP_DIR = fileURLToPath(new URL("../../app", import.meta.url));

/** URL paths of every page.tsx under src/app, route groups dropped. */
function pagePaths(dir = APP_DIR, segments: string[] = []): string[] {
  const paths: string[] = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) {
      const isGroup = name.startsWith("(") && name.endsWith(")");
      paths.push(...pagePaths(full, isGroup ? segments : [...segments, name]));
    } else if (name === "page.tsx") {
      paths.push(`/${segments.join("/")}`);
    }
  }
  return paths;
}

const indexable = INDEXABLE_ROUTES.map((r) => r.path);

describe("public routes", () => {
  // The sport pages are one dynamic route, built for each marketing sport.
  const pages = pagePaths().flatMap((p) => (p === "/[sport]" ? MARKETING_SPORTS.map(sportPagePath) : [p]));

  it("finds the app's pages", () => {
    expect(pages).toContain("/");
    expect(pages).toContain("/run/[token]");
  });

  it("classifies every page as indexed, unlisted or private", () => {
    const unclassified = pages.filter(
      (p) => !indexable.includes(p) && !UNLISTED_PUBLIC_PATHS.includes(p) && !isPrivatePath(p),
    );
    expect(unclassified).toEqual([]);
  });

  it("lists only real pages in the sitemap, once each", () => {
    expect(indexable.filter((p) => !pages.includes(p))).toEqual([]);
    expect(new Set(indexable).size).toBe(indexable.length);
  });

  it("measures only unlisted pages that really are unlisted and public", () => {
    for (const p of UNLISTED_ANALYTICS_PATHS) {
      expect(UNLISTED_PUBLIC_PATHS, p).toContain(p);
      expect(indexable, p).not.toContain(p);
    }
  });

  it("never lists a private page", () => {
    expect([...indexable, ...UNLISTED_PUBLIC_PATHS].filter(isPrivatePath)).toEqual([]);
  });

  it("keeps token links and the app private", () => {
    for (const p of ["/run/abc", "/join/abc", "/teams/1/games", "/dashboard", "/reset", "/api/x"]) {
      expect(isPrivatePath(p), p).toBe(true);
    }
  });

  it("dates the policies as the pages themselves do", () => {
    // privacy, terms and support print "Last updated: <date>"; the
    // sitemap said 12 May for privacy after its 19 Oct rewrite.
    for (const [path, file] of [
      ["/privacy", "(marketing)/privacy/page.tsx"],
      ["/terms", "(marketing)/terms/page.tsx"],
      ["/support", "(marketing)/support/page.tsx"],
    ]) {
      const shown = readFileSync(join(APP_DIR, file), "utf8").match(/LAST_UPDATED = "([^"]+)"/)?.[1];
      const shownIso = new Date(`${shown} UTC`).toISOString().slice(0, 10);
      expect(INDEXABLE_ROUTES.find((r) => r.path === path)?.lastModified, path).toBe(shownIso);
    }
  });

  it("gives every sitemap entry a real date", () => {
    for (const r of INDEXABLE_ROUTES) {
      expect(r.lastModified, r.path).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(Number.isNaN(new Date(r.lastModified).getTime()), r.path).toBe(false);
    }
  });
});
