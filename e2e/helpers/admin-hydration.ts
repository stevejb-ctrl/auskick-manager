// Phase 5 — admin-membership hydration race guard (side-finding #3).
//
// Background: After the multi-sport merge, three of our admin-only
// toggles (track-scoring on settings, deactivate/reactivate on the
// squad page) gained a non-trivial hydration race. The Toggle
// component renders with `disabled={isPending || !isAdmin}`, where
// `isAdmin` resolves from a client-side membership query that fires
// on mount. Under parallel Playwright workers we occasionally click
// the switch BEFORE the membership query resolves — the click hits a
// disabled element, the server action never fires, and the
// downstream assertion times out 30s later as a flake.
//
// The fix is a Web-First assertion: wait for the switch to be
// enabled before clicking. Five seconds is generous; in practice the
// hydration completes in < 200ms when not under load.
//
// This helper centralises that wait in one place so:
//   1. Future spec authors hitting the same surface (or a new
//      admin-gated toggle) get the guard for free with a single
//      import — no need to chase down the original commit (b014ef9 /
//      fa26cd1) or re-derive the rationale from a comment block in
//      one of the three affected specs.
//   2. The race rationale lives ONCE — if the underlying behaviour
//      changes (e.g. Toggle becomes optimistic-enabled, or membership
//      moves to server-side hydration), we update one file.
//
// Note: game-edit.spec.ts has a structurally similar race but uses a
// DIFFERENT guard shape (DB-poll for cascade-delete completion, not a
// toBeEnabled-on-switch assertion). It is NOT a candidate for this
// helper; see the comment block in that spec for the divergent
// rationale.
//
// Locked per .planning/phases/05-test-and-type-green/05-CONTEXT.md
// D-CONTEXT-side-finding-3.

import { expect, type Locator } from "@playwright/test";

/**
 * Wait for an admin-gated `role="switch"` element to become enabled
 * before interacting with it.
 *
 * The Toggle component used by track-scoring (settings page) and
 * activate/deactivate (squad page) renders with
 * `disabled={isPending || !isAdmin}`. The `isAdmin` flag flips false
 * → true once the client-side team_memberships query resolves, which
 * is async and can race with Playwright's click under parallel
 * workers. This Web-First assertion holds the test until hydration
 * settles, eliminating the race deterministically.
 *
 * @param switchLocator - A `page.getByRole("switch", { name: ... })`
 *                        Locator (or any Locator pointing at an
 *                        admin-gated control with the same disabled-
 *                        until-hydrated pattern).
 * @param opts.timeout   - Override the default 5s wait (e.g. for
 *                        slow CI runners). Default: 5_000 ms.
 *
 * @example
 *   const toggle = page.getByRole("switch", { name: /track scoring/i });
 *   await waitForAdminHydration(toggle);
 *   await toggle.click();
 */
export async function waitForAdminHydration(
  switchLocator: Locator,
  opts?: { timeout?: number },
): Promise<void> {
  await expect(switchLocator).toBeEnabled({ timeout: opts?.timeout ?? 5_000 });
}
