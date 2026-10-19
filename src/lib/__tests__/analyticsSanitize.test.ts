// Nothing secret or personal may reach PostHog in a URL. /run/<token>
// gives live control of a game, /join/<token> is a team invite, and
// query strings can carry auth codes or an email. e2e/tests/
// posthog-analytics.spec.ts checks the same thing in the browser.
import { describe, expect, it } from "vitest";
import type { CaptureResult } from "posthog-js";
import { sanitizeEvent, sanitizeUrl } from "@/lib/analytics/sanitize";

describe("sanitizeUrl", () => {
  it("hides runner and invite tokens in paths", () => {
    expect(sanitizeUrl("/run/9f2c1e7a")).toBe("/run/:token");
    expect(sanitizeUrl("/run/9f2c1e7a/lineup")).toBe("/run/:token/lineup");
    expect(sanitizeUrl("/join/inv_abc123")).toBe("/join/:token");
    expect(sanitizeUrl("https://www.sirenfooty.com.au/run/9f2c1e7a")).toBe(
      "https://www.sirenfooty.com.au/run/:token",
    );
  });

  it("keeps campaign tags and drops every other query param", () => {
    expect(sanitizeUrl("/?utm_source=club&utm_campaign=kotara")).toBe(
      "/?utm_source=club&utm_campaign=kotara",
    );
    expect(sanitizeUrl("/login?next=%2Fjoin%2Fsecret")).toBe("/login");
    expect(sanitizeUrl("/auth/callback?code=abc&utm_source=email")).toBe("/auth/callback?utm_source=email");
    expect(sanitizeUrl("https://www.sirenfooty.com.au/login?email=coach%40example.com")).toBe(
      "https://www.sirenfooty.com.au/login",
    );
  });

  it("drops the fragment, which can carry an access token", () => {
    expect(sanitizeUrl("/reset#access_token=abc&type=recovery")).toBe("/reset");
  });

  it("leaves ordinary paths and non-URL strings alone", () => {
    expect(sanitizeUrl("/teams/4f25d042/games")).toBe("/teams/4f25d042/games");
    expect(sanitizeUrl("/")).toBe("/");
    expect(sanitizeUrl("$pageview")).toBe("$pageview");
    expect(sanitizeUrl("Mozilla/5.0 (iPhone)")).toBe("Mozilla/5.0 (iPhone)");
  });
});

function event(properties: Record<string, unknown>, extra: Partial<CaptureResult> = {}): CaptureResult {
  return { uuid: "u", event: "$pageview", properties, ...extra } as CaptureResult;
}

describe("sanitizeEvent", () => {
  it("scrubs every URL-shaped property, however deep", () => {
    const out = sanitizeEvent(
      event({
        $current_url: "https://www.sirenfooty.com.au/run/9f2c1e7a?x=1",
        $pathname: "/run/9f2c1e7a",
        $referrer: "https://www.sirenfooty.com.au/login?next=%2Fjoin%2Fsecret",
        nested: { list: ["/join/inv_abc123"] },
        $browser: "Chrome",
      }),
    );
    expect(out?.properties).toEqual({
      $current_url: "https://www.sirenfooty.com.au/run/:token",
      $pathname: "/run/:token",
      $referrer: "https://www.sirenfooty.com.au/login",
      nested: { list: ["/join/:token"] },
      $browser: "Chrome",
    });
  });

  it("scrubs person properties too", () => {
    const out = sanitizeEvent(
      event(
        {},
        {
          $set: { $current_url: "/run/9f2c1e7a" },
          $set_once: { $initial_current_url: "/join/inv_abc123?code=1" },
        },
      ),
    );
    expect(out?.$set).toEqual({ $current_url: "/run/:token" });
    expect(out?.$set_once).toEqual({ $initial_current_url: "/join/:token" });
  });

  it("keeps the page title on public pages only", () => {
    expect(sanitizeEvent(event({ $pathname: "/help", title: "Help · Siren" }))?.properties.title).toBe(
      "Help · Siren",
    );
    expect(
      sanitizeEvent(event({ $pathname: "/teams/4f25d042", title: "Kotara Koalas" }))?.properties,
    ).not.toHaveProperty("title");
    expect(sanitizeEvent(event({ title: "No path" }))?.properties).not.toHaveProperty("title");
  });
});
