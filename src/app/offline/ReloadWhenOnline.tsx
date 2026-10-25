"use client";

import { useEffect } from "react";

// The service worker shows /offline in place of a page that couldn't
// load. When the signal comes back, load that page. (The app used to
// reload every page on reconnect; live pages now catch up without one:
// next.config.mjs, reloadOnOnline.)
export function ReloadWhenOnline() {
  useEffect(() => {
    const reload = () => window.location.reload();
    window.addEventListener("online", reload);
    return () => window.removeEventListener("online", reload);
  }, []);
  return null;
}
