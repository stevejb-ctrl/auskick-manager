// Every page under src/app must be classified in src/lib/public-routes.ts:
// indexed (in the sitemap), unlisted, or private (disallowed in
// robots.txt). The sitemap used to be a hand-kept list, and /why-siren
// and /support never made it in.
import { readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  INDEXABLE_ROUTES,
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
  const pages = pagePaths();

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

  it("never lists a private page", () => {
    expect([...indexable, ...UNLISTED_PUBLIC_PATHS].filter(isPrivatePath)).toEqual([]);
  });

  it("keeps token links and the app private", () => {
    for (const p of ["/run/abc", "/join/abc", "/teams/1/games", "/dashboard", "/reset", "/api/x"]) {
      expect(isPrivatePath(p), p).toBe(true);
    }
  });

  it("gives every sitemap entry a real date", () => {
    for (const r of INDEXABLE_ROUTES) {
      expect(r.lastModified, r.path).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(Number.isNaN(new Date(r.lastModified).getTime()), r.path).toBe(false);
    }
  });
});
