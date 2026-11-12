"use client";

import { useEffect } from "react";

/**
 * Scrolls to element `id` once it has rendered, when the URL's hash names
 * it. A link like the dashboard's "Last result" (…/games/<id>#summary)
 * lands on the team's loading skeleton first, so Next's own jump to the
 * hash finds no #summary and the page stays at the top; on an iPhone the
 * summary was below the fold (10 Nov 2026). Render it inside the target.
 */
export function ScrollToHashTarget({ id }: { id: string }) {
  useEffect(() => {
    if (decodeURIComponent(window.location.hash.slice(1)) !== id) return;
    document.getElementById(id)?.scrollIntoView({ block: "start" });
  }, [id]);
  return null;
}
