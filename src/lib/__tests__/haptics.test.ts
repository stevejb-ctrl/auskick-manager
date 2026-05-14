// Web-fallback coverage for the haptics primitive
// (src/lib/haptics.ts). Pins the contract:
//   1. On a touch device with no Capacitor (= browser, Android
//      Chrome, iOS Safari), `hapticTap` and `hapticSiren` fall
//      through to `navigator.vibrate` with the right pattern.
//   2. On a non-touch device (`hover: hover`), neither function
//      fires anything — desktop is silent.
//   3. Style → vibrate-ms mapping for hapticTap matches the
//      design: light=15, medium=30, heavy=60.
//   4. Siren pattern is [200, 100, 200] — the long-pause-long
//      cadence that already shipped pre-fix and the Android/web
//      fallback preserves for backwards compatibility.
//
// The native Capacitor path (iOS Taptic, Android vibrator via
// plugin) requires `window.Capacitor.isNativePlatform()` to
// return true. That path is exercised on-device, not here — these
// tests cover the WEB fallback that the pre-2026-05-14 code didn't
// even have for iOS users.

import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

// Stand up a minimal browser-shaped global before each test.
// vitest's default environment is `node`, so window/navigator must
// be assembled by hand. Node ≥20 exposes `globalThis.navigator` as
// a non-writable getter (no `window`), so we use defineProperty
// with configurable:true and tear back down in afterEach.
function defineBrowserGlobals(props: {
  vibrate: ReturnType<typeof vi.fn>;
  matchMedia: ReturnType<typeof vi.fn>;
}) {
  Object.defineProperty(globalThis, "window", {
    value: { matchMedia: props.matchMedia, Capacitor: undefined },
    configurable: true,
    writable: true,
  });
  Object.defineProperty(globalThis, "navigator", {
    value: { vibrate: props.vibrate },
    configurable: true,
    writable: true,
  });
}

function setupTouchDevice() {
  const vibrate = vi.fn().mockReturnValue(true);
  // matchMedia must return `{ matches: true }` for "(hover: none)"
  // — that's how the primitive distinguishes touch from desktop.
  const matchMedia = vi.fn((q: string) => ({
    matches: q === "(hover: none)",
    media: q,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  }));
  defineBrowserGlobals({ vibrate, matchMedia });
  return { vibrate, matchMedia };
}

function setupDesktop() {
  const vibrate = vi.fn().mockReturnValue(true);
  const matchMedia = vi.fn((q: string) => ({
    matches: q === "(hover: hover)",
    media: q,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  }));
  defineBrowserGlobals({ vibrate, matchMedia });
  return { vibrate };
}

afterEach(() => {
  // Tear back down so the next test starts from a fresh Node
  // global (no window, no navigator).
  Object.defineProperty(globalThis, "window", {
    value: undefined,
    configurable: true,
    writable: true,
  });
  Object.defineProperty(globalThis, "navigator", {
    value: undefined,
    configurable: true,
    writable: true,
  });
  vi.resetModules();
});

describe("haptics — touch-device web fallback", () => {
  beforeEach(() => {
    setupTouchDevice();
  });

  test("hapticTap('light') vibrates for 15ms", async () => {
    const { hapticTap } = await import("../haptics");
    await hapticTap("light");
    expect((globalThis.navigator.vibrate as unknown as ReturnType<typeof vi.fn>))
      .toHaveBeenCalledWith(15);
  });

  test("hapticTap('medium') vibrates for 30ms", async () => {
    const { hapticTap } = await import("../haptics");
    await hapticTap("medium");
    expect((globalThis.navigator.vibrate as unknown as ReturnType<typeof vi.fn>))
      .toHaveBeenCalledWith(30);
  });

  test("hapticTap('heavy') vibrates for 60ms", async () => {
    const { hapticTap } = await import("../haptics");
    await hapticTap("heavy");
    expect((globalThis.navigator.vibrate as unknown as ReturnType<typeof vi.fn>))
      .toHaveBeenCalledWith(60);
  });

  test("hapticTap() defaults to light (15ms)", async () => {
    const { hapticTap } = await import("../haptics");
    await hapticTap();
    expect((globalThis.navigator.vibrate as unknown as ReturnType<typeof vi.fn>))
      .toHaveBeenCalledWith(15);
  });

  test("hapticSiren fires the [200,100,200] cadence", async () => {
    const { hapticSiren } = await import("../haptics");
    await hapticSiren();
    expect((globalThis.navigator.vibrate as unknown as ReturnType<typeof vi.fn>))
      .toHaveBeenCalledWith([200, 100, 200]);
  });
});

describe("haptics — non-touch device is silent", () => {
  beforeEach(() => {
    setupDesktop();
  });

  test("hapticTap does not vibrate on desktop", async () => {
    const { hapticTap } = await import("../haptics");
    await hapticTap("heavy");
    expect((globalThis.navigator.vibrate as unknown as ReturnType<typeof vi.fn>))
      .not.toHaveBeenCalled();
  });

  test("hapticSiren does not vibrate on desktop", async () => {
    const { hapticSiren } = await import("../haptics");
    await hapticSiren();
    expect((globalThis.navigator.vibrate as unknown as ReturnType<typeof vi.fn>))
      .not.toHaveBeenCalled();
  });
});
