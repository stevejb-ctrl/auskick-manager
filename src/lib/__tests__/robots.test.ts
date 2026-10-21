// The crawlers that put Siren in search results and AI answers must
// always reach the public pages. Training crawlers (GPTBot, ClaudeBot,
// CCBot, Google-Extended…) are a separate decision (plan decision 2);
// this test is about the ones that fetch pages to cite them.
//
// The matcher follows RFC 9309: a bot obeys the group that names it, or
// "*" if none does, and the longest matching rule wins, Allow on a tie.
// So a new group for one bot, or a broad Disallow, fails here.
//
// Covers: src/app/robots.ts and src/lib/public-routes.ts.
import { describe, expect, it, vi } from "vitest";
import type { MetadataRoute } from "next";
import { INDEXABLE_ROUTES, PUBLIC_FILE_PATHS, UNLISTED_PUBLIC_PATHS } from "@/lib/public-routes";
import robots from "@/app/robots";

vi.mock("@/lib/seo", () => ({ siteUrl: () => "https://www.sirenfooty.com.au" }));

const SEARCH_AND_CITATION_BOTS = [
  "Googlebot",
  "Bingbot",
  "OAI-SearchBot",
  "ChatGPT-User",
  "PerplexityBot",
  "Perplexity-User",
  "Claude-SearchBot",
  "Claude-User",
  "Applebot",
  "DuckDuckBot",
];

type Rule = MetadataRoute.Robots["rules"];
type Group = Exclude<Rule, unknown[]>;

const list = (v: string | string[] | undefined): string[] => (v === undefined ? [] : Array.isArray(v) ? v : [v]);

function groupFor(rules: Rule, bot: string): Group | undefined {
  const groups = Array.isArray(rules) ? rules : [rules];
  const named = groups.find((g) => list(g.userAgent).some((ua) => ua.toLowerCase() === bot.toLowerCase()));
  return named ?? groups.find((g) => list(g.userAgent).includes("*"));
}

/** A robots.txt path pattern ("*" wildcard, "$" end) as a RegExp. */
function patternToRegExp(pattern: string): RegExp {
  const anchored = pattern.endsWith("$");
  const body = (anchored ? pattern.slice(0, -1) : pattern)
    .split("*")
    .map((part) => part.replace(/[.+?^${}()|[\]\\]/g, "\\$&"))
    .join(".*");
  return new RegExp(`^${body}${anchored ? "$" : ""}`);
}

function isAllowed(group: Group | undefined, path: string): boolean {
  if (!group) return true;
  const longest = (patterns: string[]) =>
    Math.max(-1, ...patterns.filter((p) => p && patternToRegExp(p).test(path)).map((p) => p.length));
  return longest(list(group.allow)) >= longest(list(group.disallow));
}

const PUBLIC_PATHS = [
  ...INDEXABLE_ROUTES.map((r) => r.path),
  ...UNLISTED_PUBLIC_PATHS,
  ...PUBLIC_FILE_PATHS,
];

describe("robots.txt", () => {
  const { rules } = robots();

  it("lets search and citation bots read every public page", () => {
    const blocked = SEARCH_AND_CITATION_BOTS.flatMap((bot) =>
      PUBLIC_PATHS.filter((path) => !isAllowed(groupFor(rules, bot), path)).map((path) => `${bot} ${path}`),
    );
    expect(blocked).toEqual([]);
  });

  it("still keeps them out of the app and token links", () => {
    for (const bot of SEARCH_AND_CITATION_BOTS) {
      for (const path of ["/dashboard", "/teams/1", "/run/abc", "/join/abc", "/api/x"]) {
        expect(isAllowed(groupFor(rules, bot), path), `${bot} ${path}`).toBe(false);
      }
    }
  });

  it("reads robots.txt rules the way crawlers do", () => {
    const group: Group = { userAgent: "*", allow: ["/", "/help/public$"], disallow: ["/help", "/*.json$"] };
    expect(isAllowed(group, "/")).toBe(true);
    expect(isAllowed(group, "/help/faq")).toBe(false);
    expect(isAllowed(group, "/help/public")).toBe(true);
    expect(isAllowed(group, "/data.json")).toBe(false);
    expect(groupFor([{ userAgent: "*", allow: "/" }, { userAgent: "ClaudeBot", disallow: "/" }], "ClaudeBot")).toEqual({
      userAgent: "ClaudeBot",
      disallow: "/",
    });
  });
});
