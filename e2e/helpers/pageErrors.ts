// Page-error watching that tells a real crash from WebKit's navigation
// noise.
//
// When a page goes away (goto, reload, a server redirect), WebKit cancels
// its in-flight fetches and reports each one: "Load failed", or "Fetch API
// cannot load <url> due to access control checks." Playwright's WebKit
// surfaces those as `pageerror`s even though the app caught them
// (LiveSync's live/sync poll, GameGoneWatcher's live/exists, the router's
// RSC fetches). Chromium reports nothing for the same aborts. So these
// messages are ignored only while a document navigation is under way or
// just after it lands; the same text at any other time is still an error.

import type { Page } from "@playwright/test";

const ABORT_MESSAGES: RegExp[] = [
  /due to access control checks\.?$/,
  /^(TypeError: )?Load failed$/,
  // Next's router logging the same cancelled RSC fetch.
  /^Failed to fetch RSC payload for \S+\. Falling back to browser navigation\. TypeError: Load failed$/,
];

/** How long after a navigation lands its cancelled fetches may still report. */
const SETTLE_MS = 5_000;

/**
 * A check for "this is a fetch WebKit cancelled because the page navigated".
 * Attach it before the first goto.
 */
export function navAbortGuard(page: Page): (message: string) => boolean {
  let pending = false;
  let lastNavAt = -Infinity;
  page.on("request", (req) => {
    if (req.isNavigationRequest() && req.frame() === page.mainFrame()) {
      pending = true;
      lastNavAt = Date.now();
    }
  });
  page.on("framenavigated", (frame) => {
    if (frame === page.mainFrame() && pending) {
      pending = false;
      lastNavAt = Date.now();
    }
  });
  page.on("requestfailed", (req) => {
    if (req.isNavigationRequest() && req.frame() === page.mainFrame()) pending = false;
  });
  return (message) =>
    ABORT_MESSAGES.some((re) => re.test(message.trim())) && (pending || Date.now() - lastNavAt <= SETTLE_MS);
}

/** Push each page error onto `errors` as "pageerror: …", minus navigation aborts. */
export function watchPageErrors(page: Page, errors: string[]): void {
  const isNavAbort = navAbortGuard(page);
  page.on("pageerror", (err) => {
    if (!isNavAbort(err.message)) errors.push(`pageerror: ${err.message}`);
  });
}
