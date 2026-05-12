// Client-side feature detection for "is this page running as an
// installed PWA?" and "which mobile OS / install flow applies?".
//
// All helpers are guarded so they're safe to call during SSR (they
// just return false). The Standalone marker mounts in the root layout
// to flip `document.documentElement.dataset.standalone` early, and
// the install-prompt banner uses the platform sniffs to pick the right
// instructions for iOS vs Android.

/** True when the page is launched from the home screen (PWA install) or saved as a webapp. */
export function isStandalone(): boolean {
  if (typeof window === "undefined") return false;

  // Modern spec — Android Chrome, desktop Chrome/Edge installed PWA,
  // and iOS 16.4+ all honour this. We check it first so newer
  // platforms don't fall through to the vendor-prefix branch.
  if (window.matchMedia?.("(display-mode: standalone)").matches) return true;

  // Legacy iOS Safari — pre-16.4 doesn't support the display-mode
  // media query, so `navigator.standalone` is the only signal.
  // Not on the WHATWG Navigator type, hence the cast.
  const navStandalone = (window.navigator as Navigator & { standalone?: boolean })
    .standalone;
  return navStandalone === true;
}

/** Rough iOS sniff — covers iPhone + iPad (including iPadOS 13+ which lies as Mac). */
export function isIos(): boolean {
  if (typeof window === "undefined") return false;
  const ua = window.navigator.userAgent;
  if (/iPad|iPhone|iPod/.test(ua)) return true;
  // iPadOS 13+ reports a Mac UA but exposes touch + Safari. The combo
  // is a safe enough tell for routing the install instructions.
  return (
    window.navigator.maxTouchPoints > 1 &&
    /Macintosh/.test(ua) &&
    /Safari/.test(ua)
  );
}

/** True only for Android Chrome / Chromium-based browsers that fire `beforeinstallprompt`. */
export function isAndroidChromium(): boolean {
  if (typeof window === "undefined") return false;
  const ua = window.navigator.userAgent;
  // Exclude Samsung Internet / Firefox / others that may set "Android"
  // but don't fire beforeinstallprompt or have inconsistent install UX.
  return /Android/.test(ua) && /Chrome\/\d+/.test(ua) && !/EdgA|OPR|SamsungBrowser/.test(ua);
}
