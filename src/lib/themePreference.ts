// Theme preference — System / Light / Dark, per device.
//
// The palette (src/lib/theme/palette.ts) follows the phone's
// `prefers-color-scheme` by default. A coach can pin it from Account →
// Theme: "light" or "dark" is kept in localStorage and written onto
// <html data-theme="…">, which the theme CSS keys on. "system" removes
// both, so the media query decides again.
//
// The inline script in app/layout.tsx (THEME_BOOT_SCRIPT) applies the
// stored choice before first paint, so a coach who chose Light on a dark
// phone never sees a dark flash on load.

export type ThemePreference = "system" | "light" | "dark";

export const THEME_PREFERENCE_STORAGE_KEY = "siren-theme-v1";
export const THEME_PREFERENCE_EVENT = "siren:theme-pref-change";

export function readThemePreference(): ThemePreference {
  if (typeof window === "undefined") return "system";
  try {
    const raw = window.localStorage.getItem(THEME_PREFERENCE_STORAGE_KEY);
    if (raw === "light" || raw === "dark") return raw;
  } catch {
    // localStorage can throw in private-mode Safari and embedded
    // WebViews. Fall through to "system".
  }
  return "system";
}

/** Puts the choice on <html> (or takes it off, for "system"). */
export function applyThemePreference(pref: ThemePreference): void {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  if (pref === "system") delete root.dataset.theme;
  else root.dataset.theme = pref;
}

export function writeThemePreference(pref: ThemePreference): void {
  if (typeof window === "undefined") return;
  try {
    if (pref === "system") window.localStorage.removeItem(THEME_PREFERENCE_STORAGE_KEY);
    else window.localStorage.setItem(THEME_PREFERENCE_STORAGE_KEY, pref);
  } catch {
    // see above
  }
  applyThemePreference(pref);
  window.dispatchEvent(new CustomEvent(THEME_PREFERENCE_EVENT));
}

/**
 * Runs inline in <head> before the body paints. Kept tiny and
 * dependency-free; mirrors readThemePreference + applyThemePreference.
 */
export const THEME_BOOT_SCRIPT = `(function(){try{var t=localStorage.getItem(${JSON.stringify(
  THEME_PREFERENCE_STORAGE_KEY,
)});if(t==="light"||t==="dark")document.documentElement.setAttribute("data-theme",t);}catch(e){}})();`;
