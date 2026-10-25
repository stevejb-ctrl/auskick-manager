"use client";

import { useEffect, useRef, useState } from "react";
import { setAnnouncer } from "@/lib/a11y/announce";

// ─── LiveAnnouncer ───────────────────────────────────────────
// The app's one polite live region, mounted once in the root layout so
// it's on the page before anything is said into it (announce()). Screen
// readers read a region's changes, not a region that arrives with its
// text, so the toasts no longer carry their own (UX round 3, e4).
//
// It empties first and fills a moment later, so the same words twice
// ("Hawks goal" again) are read twice, and clears after a while so a
// screen reader browsing the page doesn't meet old news at the end.

const CLEAR_MS = 10_000;

export function LiveAnnouncer() {
  const [text, setText] = useState("");
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  useEffect(() => {
    const pending = timers.current;
    const later = (fn: () => void, ms: number) => pending.push(setTimeout(fn, ms));
    setAnnouncer((said) => {
      pending.splice(0).forEach(clearTimeout);
      setText("");
      later(() => setText(said), 60);
      later(() => setText(""), CLEAR_MS);
    });
    return () => {
      setAnnouncer(null);
      pending.splice(0).forEach(clearTimeout);
    };
  }, []);
  return (
    <div role="status" aria-live="polite" aria-atomic="true" className="sr-only" data-testid="live-announcer">
      {text}
    </div>
  );
}
