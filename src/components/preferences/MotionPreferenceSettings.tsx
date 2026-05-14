"use client";

import { useEffect, useState } from "react";
import { SFCard, Eyebrow } from "@/components/sf";
import {
  type MotionPreference,
  MOTION_PREFERENCE_EVENT,
  readMotionPreference,
  writeMotionPreference,
} from "@/lib/motionPreference";

/**
 * Reduced-motion preference toggle for Team Settings.
 *
 * Three options:
 *   - "system" — defer to iOS / Android Reduce Motion (default)
 *   - "reduce" — Siren explicitly reduces motion
 *   - "full"   — Siren explicitly plays motion (overrides system)
 *
 * Writes via `writeMotionPreference`, which dispatches a window
 * event the Bridge listens for — so the data attribute updates
 * live without a reload. P2-10 in MICRO-INTERACTIONS-PLAN.md.
 *
 * Renders a tri-state radio group. Mirror of the system Settings →
 * Accessibility pattern.
 */
export function MotionPreferenceSettings() {
  // null until the first effect run reads localStorage — prevents
  // SSR/CSR hydration mismatch (the server can't know storage).
  const [pref, setPref] = useState<MotionPreference | null>(null);

  useEffect(() => {
    setPref(readMotionPreference());
    // Sync if another surface (e.g. a second tab) changes the pref
    // mid-session.
    function reread() {
      setPref(readMotionPreference());
    }
    window.addEventListener(MOTION_PREFERENCE_EVENT, reread);
    return () => window.removeEventListener(MOTION_PREFERENCE_EVENT, reread);
  }, []);

  function handleChange(next: MotionPreference) {
    setPref(next);
    writeMotionPreference(next);
  }

  return (
    <SFCard>
      <Eyebrow>Motion preferences</Eyebrow>
      <h2 className="mt-1.5 text-base font-semibold text-ink">
        Reduce animations
      </h2>
      <p className="mt-1 text-xs text-ink-dim">
        Halos, slide-ins, and the in-app pulse animations can be
        toned down or turned off. The default defers to your
        device&apos;s system setting (iOS&nbsp;→&nbsp;Settings&nbsp;→&nbsp;Accessibility&nbsp;→&nbsp;Motion&nbsp;→&nbsp;Reduce&nbsp;Motion).
      </p>
      <div className="mt-3 flex flex-col gap-2">
        {(
          [
            { value: "system", label: "Use system setting", hint: "Default" },
            { value: "reduce", label: "Always reduce", hint: "Skip animations" },
            { value: "full", label: "Always play", hint: "Override system" },
          ] as Array<{ value: MotionPreference; label: string; hint: string }>
        ).map((option) => {
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
                <span className="text-[11px] text-ink-mute">
                  {option.hint}
                </span>
              </span>
              <input
                type="radio"
                name="motion-pref"
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
