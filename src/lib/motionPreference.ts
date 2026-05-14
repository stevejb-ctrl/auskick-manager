// Motion preference — Siren-managed reduced-motion override.
// P2-10 in MICRO-INTERACTIONS-PLAN.md.
//
// The browser's `prefers-reduced-motion: reduce` media query is the
// canonical source, BUT most users don't know about the iOS / Android
// system toggle. This module exposes a Siren-side override that
// persists in localStorage and (via MotionPreferenceBridge) sets
// `<html data-motion="reduce">` to drive the global CSS rule in
// globals.css that kills keyframe animations.
//
// Three values the app can observe:
//   - "system"   — defer to prefers-reduced-motion (default)
//   - "reduce"   — user explicitly opted into reduced motion
//   - "full"     — user explicitly opted IN to full motion even if
//                  the system pref says reduce (rare, but the
//                  symmetric override matters for users who set
//                  the system pref for OS-level UI but want
//                  Siren's brand animations).
//
// The bridge resolves "system" against `prefers-reduced-motion`
// before setting the data attribute, so the CSS rule only fires
// when reduction is genuinely wanted.

export type MotionPreference = "system" | "reduce" | "full";

export const MOTION_PREFERENCE_STORAGE_KEY = "siren-motion-pref-v1";
export const MOTION_PREFERENCE_EVENT = "siren:motion-pref-change";

export function readMotionPreference(): MotionPreference {
  if (typeof window === "undefined") return "system";
  try {
    const raw = window.localStorage.getItem(MOTION_PREFERENCE_STORAGE_KEY);
    if (raw === "reduce" || raw === "full") return raw;
  } catch {
    // localStorage can throw in private-mode Safari + embedded
    // WebViews. Fall through to "system".
  }
  return "system";
}

export function writeMotionPreference(pref: MotionPreference): void {
  if (typeof window === "undefined") return;
  try {
    if (pref === "system") {
      window.localStorage.removeItem(MOTION_PREFERENCE_STORAGE_KEY);
    } else {
      window.localStorage.setItem(MOTION_PREFERENCE_STORAGE_KEY, pref);
    }
  } catch {
    // see above
  }
  // Fire a custom event so the Bridge updates the data attribute
  // without needing a full page reload.
  window.dispatchEvent(new CustomEvent(MOTION_PREFERENCE_EVENT));
}

/**
 * Resolve the user's effective motion preference against the
 * browser's prefers-reduced-motion media query. Returns true if
 * motion should be reduced.
 */
export function shouldReduceMotion(pref: MotionPreference): boolean {
  if (pref === "reduce") return true;
  if (pref === "full") return false;
  // system — defer to the media query
  if (typeof window === "undefined") return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}
