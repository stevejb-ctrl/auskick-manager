// Unified haptics primitive — wraps Capacitor's Taptic Engine on iOS
// + Android, falls back to the W3C Vibration API on Chrome/Android
// web, no-ops on iOS Safari.
//
// Why this exists: pre-2026-05-14, three sites in LiveGame.tsx
// called `navigator.vibrate(...)` directly. That works on Android
// browsers and the Android Capacitor WebView, but Apple deliberately
// disabled `navigator.vibrate` in Safari/WebKit. The iOS Capacitor
// shell IS WebKit — so every iOS user got ZERO haptic feedback on
// swap-applied, sub-due-modal, or quarter-end hooter despite the
// device having the most expressive Taptic Engine on the market.
//
// This primitive:
//   - Calls Capacitor `Haptics` on native (iOS Taptic / Android
//     vibrator) — fidelity tier 1.
//   - Falls back to `navigator.vibrate` on browsers that support it
//     (Android Chrome) — fidelity tier 2.
//   - Silently no-ops on iOS Safari (no Taptic, no vibrate) —
//     fidelity tier 3.
//
// The Capacitor module is loaded via dynamic import gated on
// `isNative()`. Web bundles never resolve the chunk because the
// guard is false at every web call. The native shell pays one
// chunk-load on the first call (~10-50ms), then caches.
//
// Reduced-motion: not honoured directly. iOS users with Reduce
// Motion on still expect taptic confirmation — Apple's own apps
// haptic regardless. The discipline lives at the CALL SITE: haptics
// fire only on the seven moments-that-matter listed in P0-7 of
// .planning/MICRO-INTERACTIONS-PLAN.md. Overuse = annoyance.

import { isNative } from "@/lib/platform";

type Style = "light" | "medium" | "heavy";

// Cache the resolved plugin so subsequent calls skip the dynamic
// import entirely. `null` means "not loaded yet"; the resolved
// import is stored once it lands.
let hapticsModule: typeof import("@capacitor/haptics") | null = null;

async function getHaptics() {
  if (!isNative()) return null;
  if (hapticsModule) return hapticsModule;
  try {
    hapticsModule = await import("@capacitor/haptics");
    return hapticsModule;
  } catch {
    // Plugin missing or bridge unhealthy — fail soft. Caller falls
    // through to the web vibration path or no-ops.
    return null;
  }
}

function isTouchDevice(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(hover: none)").matches;
}

/**
 * Single impact tap. Use for confirming a discrete action landed
 * (swap applied, score recorded, start-quarter confirmed,
 * long-press pickup).
 *
 * Styles map to the iOS Taptic Engine intensity scale:
 *   - `light`  (default) — a tap. Use for confirmations.
 *   - `medium` — a thump. Use for deliberate actions.
 *   - `heavy`  — a firm hit. Use for "this needs your attention"
 *                moments (sub due, injury substitution opens).
 *
 * Fire-and-forget — the call site does not need to await. The
 * promise resolves once the haptic plays (or fails soft).
 */
export async function hapticTap(style: Style = "light"): Promise<void> {
  if (!isTouchDevice()) return;
  const hap = await getHaptics();
  if (hap) {
    const map = {
      light:  hap.ImpactStyle.Light,
      medium: hap.ImpactStyle.Medium,
      heavy:  hap.ImpactStyle.Heavy,
    } as const;
    try {
      await hap.Haptics.impact({ style: map[style] });
    } catch {
      // Bridge call failed (shouldn't happen on a healthy install,
      // but be defensive). Don't crash the calling render path.
    }
    return;
  }
  // Web fallback — Android Chrome supports navigator.vibrate; iOS
  // Safari does not (silent no-op via `?.`).
  navigator.vibrate?.(
    style === "heavy" ? 60 : style === "medium" ? 30 : 15,
  );
}

/**
 * Siren-pattern haptic. Two-pulse warning rhythm — for the actual
 * brand siren moments: quarter-end hooter, full-time.
 *
 * On iOS Taptic this maps to a `Warning` notification (a built-in
 * sub-second "duh-duh" cadence). On Android/web it falls back to
 * the long-pause-long vibrate pattern that already shipped pre-fix.
 */
export async function hapticSiren(): Promise<void> {
  if (!isTouchDevice()) return;
  const hap = await getHaptics();
  if (hap) {
    try {
      await hap.Haptics.notification({ type: hap.NotificationType.Warning });
    } catch {
      // see hapticTap
    }
    return;
  }
  navigator.vibrate?.([200, 100, 200]);
}
