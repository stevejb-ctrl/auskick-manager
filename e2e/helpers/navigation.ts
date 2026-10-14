// Navigation guard against `net::ERR_ABORTED` on `page.goto`.
//
// Background: the Next.js dev server compiles routes on-demand and the
// App Router fires RSC prefetches in the background. When a Playwright
// test navigates immediately after a previous goto/click, an in-flight
// prefetch from the PRIOR page can be cancelled by the new navigation
// and surfaces to Playwright as `page.goto: net::ERR_ABORTED`. The
// navigation itself is fine on a second attempt — the aborted prefetch
// has settled by then. We saw this fail account-deletion.spec.ts (the
// Restore-step `goto /account`) and feedback-fab.spec.ts (the
// `goto /teams/<id>/games/<id>/live` step) on every CI retry, each
// fast-failing in 2–6s with the exact same ERR_ABORTED signature.
//
// This wrapper retries the goto a small number of times on ERR_ABORTED
// (and ONLY that error — any other navigation failure is re-thrown
// immediately so genuine breakage still surfaces). WebKit reports the
// same race differently — "interrupted by another navigation" — when
// the page is still following one of the app's own redirects; that
// retries too. Centralised here so
// any spec hitting the same race gets the guard with one import.

import type { Page, Response } from "@playwright/test";

type WaitUntil = "load" | "domcontentloaded" | "networkidle" | "commit";

/**
 * `page.goto` with an automatic retry on `net::ERR_ABORTED`.
 *
 * @param page       - The Playwright page.
 * @param url        - Destination URL (same value you'd pass to goto).
 * @param opts.waitUntil - Load state to await, forwarded to goto.
 *                         Default: "load".
 * @param opts.retries   - Extra attempts after the first on ERR_ABORTED.
 *                         Default: 2 (so up to 3 navigations total).
 *
 * @example
 *   await gotoStable(page, `/teams/${team.id}/games/${game.id}/live`);
 */
export async function gotoStable(
  page: Page,
  url: string,
  opts?: { waitUntil?: WaitUntil; retries?: number },
): Promise<Response | null> {
  const waitUntil = opts?.waitUntil ?? "load";
  const retries = opts?.retries ?? 2;

  let lastErr: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await page.goto(url, { waitUntil });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (!message.includes("net::ERR_ABORTED") && !message.includes("interrupted by another navigation")) throw err;
      lastErr = err;
      // Brief settle so the aborted prefetch finishes before we retry.
      await page.waitForTimeout(300);
    }
  }
  throw lastErr;
}

/**
 * Wait until React has hydrated the page: network idle, then every
 * input, button, textarea and select carries React's own hydration
 * marker (`__reactProps$…`). Use it:
 *   - after a sign-in, so the app's own redirects (/dashboard → the team,
 *     or → /welcome) have finished before the test navigates; and
 *   - before typing straight after a goto: text typed before hydration
 *     sits in the box but React never sees it (Save stays disabled).
 * Chromium is fast enough to hide both; WebKit (iPhone) isn't.
 */
export async function waitForHydration(page: Page): Promise<void> {
  await page.waitForLoadState("networkidle");
  await page.waitForFunction(
    () => {
      const controls = Array.from(document.querySelectorAll("input, button, textarea, select"));
      return controls.every((el) => Object.keys(el).some((k) => k.startsWith("__reactProps")));
    },
    undefined,
    { timeout: 15_000 },
  );
}
