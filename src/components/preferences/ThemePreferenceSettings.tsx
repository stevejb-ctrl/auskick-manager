"use client";

import { useEffect, useId, useState } from "react";
import { SFCard, Eyebrow } from "@/components/sf";
import {
  type ThemePreference,
  THEME_PREFERENCE_EVENT,
  readThemePreference,
  writeThemePreference,
} from "@/lib/themePreference";

const OPTIONS: Array<{ value: ThemePreference; label: string; hint: string }> = [
  { value: "system", label: "System", hint: "Follow this phone's light or dark setting" },
  { value: "light", label: "Light", hint: "Always light, for bright sun" },
  { value: "dark", label: "Dark", hint: "Always dark, for night games" },
];

/**
 * Light / dark theme for this device, on Account beside the motion
 * setting and laid out the same way (a tri-state radio group). Kept per
 * device in localStorage: a coach's phone at night games and the club
 * iPad in the sun can differ. The choice applies at once and, via the
 * boot script in the root layout, before first paint on the next load.
 */
export function ThemePreferenceSettings() {
  // null until the first effect reads localStorage, so the server and
  // client render the same markup.
  const [pref, setPref] = useState<ThemePreference | null>(null);
  const headingId = useId();

  useEffect(() => {
    setPref(readThemePreference());
    const reread = () => setPref(readThemePreference());
    window.addEventListener(THEME_PREFERENCE_EVENT, reread);
    return () => window.removeEventListener(THEME_PREFERENCE_EVENT, reread);
  }, []);

  function handleChange(next: ThemePreference) {
    setPref(next);
    writeThemePreference(next);
  }

  return (
    <SFCard>
      <Eyebrow>Appearance</Eyebrow>
      <h2 id={headingId} className="mt-1.5 text-base font-semibold text-ink">
        Theme
      </h2>
      <p className="mt-1 text-xs text-ink-dim">
        Siren follows your phone&apos;s light or dark setting. Pick one here to keep it on this device.
      </p>
      <div role="radiogroup" aria-labelledby={headingId} className="mt-3 flex flex-col gap-2">
        {OPTIONS.map((option) => {
          const checked = pref === option.value;
          return (
            <label
              key={option.value}
              className={`flex cursor-pointer items-center justify-between rounded-md border px-3 py-2.5 text-sm transition-colors duration-fast ease-out-quart ${
                checked
                  ? "border-brand-500 bg-brand-50 text-brand-800"
                  : "border-hairline bg-surface text-ink hover:bg-surface-alt active:bg-hairline"
              }`}
            >
              <span className="flex flex-col">
                <span className="font-semibold">{option.label}</span>
                <span className="text-[11px] text-ink-mute">{option.hint}</span>
              </span>
              <input
                type="radio"
                name="theme-pref"
                value={option.value}
                checked={checked}
                onChange={() => handleChange(option.value)}
                className="h-4 w-4 accent-brand-600"
              />
            </label>
          );
        })}
      </div>
    </SFCard>
  );
}
