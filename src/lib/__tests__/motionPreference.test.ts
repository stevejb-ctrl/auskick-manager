// Coverage for the motion-preference resolve logic. The shouldReduce
// function combines the user's stored preference with the system
// prefers-reduced-motion media query — three-state precedence:
//   - "reduce" → always reduce (user opted in explicitly)
//   - "full"   → never reduce (user opted out explicitly)
//   - "system" → defer to the media query
//
// P2-10 in MICRO-INTERACTIONS-PLAN.md.

import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

function withMediaQuery(prefersReduce: boolean) {
  const matchMedia = vi.fn((q: string) => ({
    matches: q === "(prefers-reduced-motion: reduce)" && prefersReduce,
    media: q,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  }));
  Object.defineProperty(globalThis, "window", {
    value: { matchMedia },
    configurable: true,
    writable: true,
  });
}

afterEach(() => {
  Object.defineProperty(globalThis, "window", {
    value: undefined,
    configurable: true,
    writable: true,
  });
});

describe("shouldReduceMotion — three-state resolve", () => {
  test("'reduce' wins regardless of system media query", async () => {
    withMediaQuery(false);
    const { shouldReduceMotion } = await import("../motionPreference");
    expect(shouldReduceMotion("reduce")).toBe(true);
    withMediaQuery(true);
    expect(shouldReduceMotion("reduce")).toBe(true);
  });

  test("'full' wins regardless of system media query", async () => {
    withMediaQuery(true);
    const { shouldReduceMotion } = await import("../motionPreference");
    expect(shouldReduceMotion("full")).toBe(false);
    withMediaQuery(false);
    expect(shouldReduceMotion("full")).toBe(false);
  });

  test("'system' defers to prefers-reduced-motion: reduce → reduce", async () => {
    withMediaQuery(true);
    const { shouldReduceMotion } = await import("../motionPreference");
    expect(shouldReduceMotion("system")).toBe(true);
  });

  test("'system' defers to prefers-reduced-motion: no-preference → full motion", async () => {
    withMediaQuery(false);
    const { shouldReduceMotion } = await import("../motionPreference");
    expect(shouldReduceMotion("system")).toBe(false);
  });

  test("SSR (no window) returns false — assume full motion server-side", async () => {
    // No window installed → typeof window === "undefined"
    const { shouldReduceMotion } = await import("../motionPreference");
    expect(shouldReduceMotion("system")).toBe(false);
    // explicit preferences still short-circuit before the window check
    expect(shouldReduceMotion("reduce")).toBe(true);
    expect(shouldReduceMotion("full")).toBe(false);
  });
});

describe("read/write motion preference", () => {
  beforeEach(() => {
    const store = new Map<string, string>();
    Object.defineProperty(globalThis, "window", {
      value: {
        localStorage: {
          getItem: (k: string) => store.get(k) ?? null,
          setItem: (k: string, v: string) => store.set(k, v),
          removeItem: (k: string) => store.delete(k),
        },
        dispatchEvent: vi.fn(),
        CustomEvent: globalThis.CustomEvent ?? class CustomEvent {
          constructor(public type: string) {}
        },
      },
      configurable: true,
      writable: true,
    });
  });

  test("read defaults to 'system' when nothing stored", async () => {
    const { readMotionPreference } = await import("../motionPreference");
    expect(readMotionPreference()).toBe("system");
  });

  test("write 'reduce' → read returns 'reduce'", async () => {
    const { readMotionPreference, writeMotionPreference } = await import(
      "../motionPreference"
    );
    writeMotionPreference("reduce");
    expect(readMotionPreference()).toBe("reduce");
  });

  test("write 'system' removes the stored value (default state)", async () => {
    const { readMotionPreference, writeMotionPreference } = await import(
      "../motionPreference"
    );
    writeMotionPreference("reduce");
    expect(readMotionPreference()).toBe("reduce");
    writeMotionPreference("system");
    expect(readMotionPreference()).toBe("system");
  });

  test("read rejects garbage values and falls back to 'system'", async () => {
    (globalThis.window.localStorage as Storage).setItem(
      "siren-motion-pref-v1",
      "definitely-not-a-valid-pref",
    );
    const { readMotionPreference } = await import("../motionPreference");
    expect(readMotionPreference()).toBe("system");
  });
});
