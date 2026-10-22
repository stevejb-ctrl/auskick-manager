// /llms.txt: a plain-text map of Siren for AI tools, built from the
// facts and the sitemap so it can't fall behind them. It used to 307
// to /login like any path the middleware didn't know.
//
// Covers: src/lib/llms-txt.ts, src/app/llms.txt/route.ts and the
// middleware's public files (src/lib/public-routes.ts).
import { describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { LLMS_TXT_PATHS, buildLlmsTxt } from "@/lib/llms-txt";
import { INDEXABLE_ROUTES, PUBLIC_FILE_PATHS } from "@/lib/public-routes";
import { APP_STORE_URL } from "@/lib/app-links";
import { PRICE, sirenOneLiner } from "@/lib/siren-facts";
import { updateSession } from "@/lib/supabase/middleware";

vi.mock("@supabase/ssr", () => ({
  createServerClient: () => ({
    auth: { getUser: async () => ({ data: { user: null } }) },
  }),
}));

const SITE = "https://www.sirenfooty.com.au";
const txt = buildLlmsTxt(SITE);

describe("llms.txt", () => {
  it("opens with the title and the one-line summary", () => {
    expect(txt.startsWith(`# Siren\n\n> ${sirenOneLiner()}\n`)).toBe(true);
  });

  it("states the facts: price, maker, platforms, privacy", () => {
    expect(txt).toContain(`${PRICE.line}.`);
    expect(txt).toContain("Steve Bull, a parent-coach in Australia");
    expect(txt).toContain("on the App Store since 19 May 2026");
    expect(txt).toContain("Android included");
    expect(txt).toContain("player names are never shown publicly");
    expect(txt).toContain(APP_STORE_URL);
  });

  it("lists every sport, marking the beta ones", () => {
    expect(txt).toContain(
      ["- AFL", "- Netball", "- Rugby league", "- Rugby union", "- Football (soccer) (beta)", "- Basketball (beta)"].join(
        "\n",
      ),
    );
  });

  it("links every page in the sitemap, once, on this site", () => {
    expect([...LLMS_TXT_PATHS].sort()).toEqual(INDEXABLE_ROUTES.map((r) => r.path).sort());
    for (const { path } of INDEXABLE_ROUTES) {
      expect(txt, path).toContain(`](${SITE}${path})`);
    }
    expect(txt).toContain(`- [FAQ](${SITE}/help/faq): `);
  });

  it("is public, so the middleware doesn't send crawlers to /login", async () => {
    expect(PUBLIC_FILE_PATHS).toContain("/llms.txt");
    const res = await updateSession(
      new NextRequest(`${SITE}/llms.txt`, { headers: { host: "www.sirenfooty.com.au" } }),
    );
    expect(res.headers.get("location")).toBeNull();
    expect(res.status).toBe(200);
  });
});
