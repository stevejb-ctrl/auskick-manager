"use client";

import { useEffect } from "react";
import {
  MOTION_PREFERENCE_EVENT,
  readMotionPreference,
  shouldReduceMotion,
} from "@/lib/motionPreference";

/**
 * Mounts at app root and keeps `<html data-motion="...">` in sync
 * with the user's stored motion preference (resolved against the
 * system `prefers-reduced-motion` media query). The data attribute
 * triggers a global CSS rule in globals.css that kills keyframe
 * animations.
 *
 * Renders nothing — it's an effect-only bridge. P2-10 in
 * .planning/MICRO-INTERACTIONS-PLAN.md.
 *
 * Updates fire on:
 *   - Mount (initial sync from localStorage)
 *   - The siren:motion-pref-change custom event (when the user
 *     toggles the preference in Settings — same window dispatches
 *     it via writeMotionPreference()).
 *   - The matchMedia "prefers-reduced-motion" change event (the
 *     user flips their system pref while Siren is open).
 */
export function MotionPreferenceBridge() {
  useEffect(() => {
    function apply() {
      const pref = readMotionPreference();
      const html = document.documentElement;
      if (shouldReduceMotion(pref)) {
        html.dataset.motion = "reduce";
      } else {
        delete html.dataset.motion;
      }
    }

    apply();

    window.addEventListener(MOTION_PREFERENCE_EVENT, apply);
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    // Safari < 14 doesn't support addEventListener on MediaQueryList;
    // fall back to addListener (deprecated but works).
    if (mq.addEventListener) {
      mq.addEventListener("change", apply);
    } else {
      (mq as MediaQueryList).addListener(apply);
    }

    return () => {
      window.removeEventListener(MOTION_PREFERENCE_EVENT, apply);
      if (mq.removeEventListener) {
        mq.removeEventListener("change", apply);
      } else {
        (mq as MediaQueryList).removeListener(apply);
      }
    };
  }, []);

  return null;
}
