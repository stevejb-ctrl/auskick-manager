"use client";

import { useEffect } from "react";
import { isNative } from "@/lib/platform";

// Hides Capacitor's native splash screen as soon as the React app
// has mounted. Configured in mobile/capacitor.config.ts as
// `launchAutoHide: false` so the splash stays visible until this
// effect fires — covering the entire cold-start gap between the
// iOS LaunchScreen disappearing and the remote WebView painting
// its first frame.
//
// No-op on web. The @capacitor/splash-screen package is dynamically
// imported so it never enters the web bundle.
export function NativeSplashHide() {
  useEffect(() => {
    if (!isNative()) return;
    let cancelled = false;

    (async () => {
      try {
        const { SplashScreen } = await import("@capacitor/splash-screen");
        if (cancelled) return;
        // 250ms fade matches `launchFadeOutDuration` in
        // capacitor.config.ts. Splash gracefully dissolves into
        // the rendered app.
        await SplashScreen.hide({ fadeOutDuration: 250 });
      } catch {
        // Plugin not present on a non-Capacitor build, or hide
        // failed for some reason. Either way nothing to do — the
        // launchShowDuration ceiling in capacitor.config.ts is
        // the safety net.
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  return null;
}
