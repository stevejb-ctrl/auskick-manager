"use client";

import { useEffect } from "react";
import { isStandalone } from "@/lib/pwa";

// Sets `document.documentElement.dataset.standalone = "true"` once on
// mount when the page is launched from the home-screen PWA install
// (or saved as a webapp on iOS). CSS can then target
// `html[data-standalone="true"] ...` to hide the "Install" banner and
// any "Open in browser" / Safari address-bar prompts, and components
// can read `document.documentElement.dataset.standalone` to make
// conditional UX decisions (e.g. render an in-app back button when
// the browser back chrome isn't available).
//
// We update on `display-mode` change too so the flag stays correct if
// the user installs the PWA in this session and re-enters via the
// home-screen icon without a full page reload — rare but cheap to
// support.
export function StandaloneMarker() {
  useEffect(() => {
    const apply = () => {
      const standalone = isStandalone();
      const html = document.documentElement;
      if (standalone) {
        html.dataset.standalone = "true";
      } else {
        delete html.dataset.standalone;
      }
    };

    apply();

    if (typeof window.matchMedia !== "function") return;
    const mq = window.matchMedia("(display-mode: standalone)");
    // `addEventListener("change", ...)` is supported on every browser
    // we ship to; the older `addListener` fallback is no longer needed.
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, []);

  return null;
}
