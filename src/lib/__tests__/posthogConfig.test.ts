// The privacy settings PostHog runs with. Squads are lists of children's
// names, so these are pinned: changing one should be a deliberate act
// that fails this test first.
import { describe, expect, it } from "vitest";
import { analyticsPlatform } from "@/lib/analytics/platform";
import { posthogOptions } from "@/lib/analytics/posthog-config";
import { sanitizeEvent } from "@/lib/analytics/sanitize";

describe("posthogOptions", () => {
  const live = posthogOptions({ debug: false });

  it("never sends on-screen text or element attributes", () => {
    expect(live.mask_all_text).toBe(true);
    expect(live.mask_all_element_attributes).toBe(true);
  });

  it("scrubs every event before it leaves the device", () => {
    expect(live.before_send).toBe(sanitizeEvent);
  });

  it("records no sessions and draws no heatmaps yet", () => {
    expect(live.disable_session_recording).toBe(true);
    expect(live.enable_heatmaps).toBe(false);
  });

  it("makes no feature-flag requests, which skip the scrubber", () => {
    expect(live.advanced_disable_flags).toBe(true);
  });

  it("only makes people for signed-in users, and honours Do Not Track", () => {
    expect(live.person_profiles).toBe("identified_only");
    expect(live.respect_dnt).toBe(true);
  });

  it("sends through our own /ingest proxy, to the US cloud", () => {
    expect(live.api_host).toBe("/ingest");
    expect(live.ui_host).toBe("https://us.posthog.com");
  });

  it("counts page changes in the app router", () => {
    expect(live.capture_pageview).toBe("history_change");
  });

  it("sends readable, unbatched events only in debug (e2e) mode", () => {
    expect(live.disable_compression).toBe(false);
    expect(live.request_batching).toBe(true);
    const debug = posthogOptions({ debug: true });
    expect(debug.disable_compression).toBe(true);
    expect(debug.request_batching).toBe(false);
    expect(debug.mask_all_text).toBe(true);
  });

  it("filters out bots live, but not Playwright's browser in debug mode", () => {
    expect(live.opt_out_useragent_filter).toBe(false);
    expect(posthogOptions({ debug: true }).opt_out_useragent_filter).toBe(true);
  });
});

describe("analyticsPlatform", () => {
  it("names the native shells", () => {
    expect(analyticsPlatform({ capacitor: "ios", standalone: false })).toBe("ios");
    expect(analyticsPlatform({ capacitor: "android", standalone: true })).toBe("android");
  });

  it("tells an installed web app from a browser tab", () => {
    expect(analyticsPlatform({ capacitor: "web", standalone: true })).toBe("pwa");
    expect(analyticsPlatform({ capacitor: undefined, standalone: false })).toBe("web");
  });
});
