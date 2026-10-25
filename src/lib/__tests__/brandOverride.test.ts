// `?brand=netball` and the sticky siren_brand cookie switch the brand
// for local dev and preview deploys. They used to work on production
// too: www.sirenfooty.com.au/?brand=netball served "Siren Netball",
// with its canonical, sitemap and robots.txt on sirennetball.com.au, a
// domain that doesn't exist. One stray link could have pointed Google
// at it.
//
// The gate is VERCEL_ENV, not NODE_ENV: e2e runs `next start`, which is
// NODE_ENV=production with no VERCEL_ENV, and still needs the override.
//
// Covers: src/lib/supabase/middleware.ts (brand routing).

import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { BRAND_COOKIE_NAME, BRAND_HEADER_NAME } from "@/lib/brand";
import { updateSession } from "@/lib/supabase/middleware";

// A signed-out visitor, without a round trip to Supabase.
vi.mock("@supabase/ssr", () => ({
  createServerClient: () => ({
    auth: { getUser: async () => ({ data: { user: null } }) },
  }),
}));

function visit(url: string, cookie?: string): Promise<Response & { cookies: NextRequest["cookies"] }> {
  const headers = new Headers({ host: new URL(url).host });
  if (cookie) headers.set("cookie", cookie);
  return updateSession(new NextRequest(url, { headers })) as never;
}

async function brandOf(url: string, cookie?: string) {
  const res = await visit(url, cookie);
  return {
    brand: res.headers.get(BRAND_HEADER_NAME),
    stickyCookie: res.cookies.get(BRAND_COOKIE_NAME)?.value ?? null,
  };
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("brand override on production", () => {
  it("ignores ?brand=, so the sirenfooty canonical stands", async () => {
    vi.stubEnv("VERCEL_ENV", "production");
    expect(await brandOf("https://www.sirenfooty.com.au/?brand=netball")).toEqual({
      brand: "afl",
      stickyCookie: null,
    });
  });

  it("ignores a siren_brand cookie left from before", async () => {
    vi.stubEnv("VERCEL_ENV", "production");
    expect(
      await brandOf("https://www.sirenfooty.com.au/help", `${BRAND_COOKIE_NAME}=netball`),
    ).toEqual({ brand: "afl", stickyCookie: null });
  });
});

describe("brand override off production", () => {
  for (const env of ["preview", "development", undefined]) {
    it(`switches the brand and makes it sticky (VERCEL_ENV=${env ?? "unset"})`, async () => {
      vi.stubEnv("VERCEL_ENV", env);
      expect(await brandOf("http://localhost:3000/?brand=netball")).toEqual({
        brand: "netball",
        stickyCookie: "netball",
      });
      expect((await brandOf("http://localhost:3000/help", `${BRAND_COOKIE_NAME}=netball`)).brand).toBe(
        "netball",
      );
    });
  }
});
