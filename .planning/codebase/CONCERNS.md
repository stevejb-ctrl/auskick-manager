# Codebase Concerns

**Analysis Date:** 2026-04-29

## Tech Debt

**PlayHQ import test isolation:**
- Issue: `e2e/tests/playhq-import.spec.ts:28` is marked `test.fixme()`. The test stubs `playhq.com` via `page.route()` but the server action `previewPlayhqFixtures` and `importPlayhqFixtures` (in `src/app/(app)/teams/[teamId]/games/actions.ts`) run server-side, so the client-side fetch stub is silently ignored. The action then errors or returns no fixtures, the preview list stays empty, and the spec times out.
- Files: `e2e/tests/playhq-import.spec.ts:14-27` (documented), `src/lib/playhq.ts`
- Impact: PlayHQ fixture import flow is untested end-to-end. A regression in `fetchPlayhqTeamPage()` won't be caught.
- Fix approach: One of three options (per spec comment): (a) Add `TEST_PLAYHQ_FIXTURES` env var that makes `lib/playhq.ts:fetchPlayhqTeamPage` return canned data; (b) Set up MSW on the server runtime; (c) Unit test `previewPlayhqFixtures` directly with mocked `fetch` at the module boundary.

**TagManager temporary ID handling — resolved but fragile history:**
- Issue: `src/components/admin/TagManager.tsx:33-43` documents a past bug where temp IDs (`temp-${Date.now()}`) were used, then `revalidatePath` was supposed to sync the real ID. But `useState(initialTags)` doesn't sync to prop changes, so the temp row stayed put. When edit mode tried to update the temp ID, Postgres rejected it with "invalid input syntax for type uuid", leaving the row stuck in edit mode.
- Files: `src/components/admin/TagManager.tsx:33-43` (comment)
- Impact: Now fixed (real row from server appended directly), but the pattern is a reminder that client state ↔ server revalidation boundaries are fragile. Similar issue could resurface in other optimistic-update flows.
- Fix approach: Document and review all `useState` calls that depend on prop initialization; use separate effect-driven state for server-synced data.

**eslint-disable without clear justification:**
- Issue: Two react-hooks/exhaustive-deps disables in LiveGame without explanation of why deps are missing.
  - `src/components/live/LiveGame.tsx:272`: Effect has `[songUrl, gameId, hydrated]` deps but the cleanup function references `playerDiv` (from outer scope) — disables because `playerDiv` ref is stable but not in deps.
  - `src/components/live/LiveGame.tsx:395`: Effect has `[currentQuarter, quarterEnded, finalised]` deps but likely references other state without declaring it.
- Files: `src/components/live/LiveGame.tsx:272`, `src/components/live/LiveGame.tsx:395`
- Impact: Effects may re-run unnecessarily or skip updates if the undeclared deps change. Tests currently passing means the bug is masked by timing/external state.
- Fix approach: Either add missing deps or, if the effect truly doesn't need them, add explicit comment explaining why (e.g., "ref is stable across renders").

**HelpPage img tag without alt:**
- Issue: `src/components/help/HelpPage.tsx:57` uses `{/* eslint-disable-next-line @next/next/no-img-element */}` to bypass the no-img-element rule. Likely using a raw `<img>` without `alt`.
- Files: `src/components/help/HelpPage.tsx:57`
- Impact: Accessibility/SEO issue, unclear why Next.js Image component can't be used.
- Fix approach: Use `next/image` Image component or document the reason (e.g., dynamic sizing, 3rd-party image).

## Known Bugs

**Pause time not event-persisted in live game:**
- Symptoms: If a user pauses the live-game clock, then reloads mid-quarter, the paused seconds are silently included in `accumulatedMs` on recovery. The clock rebuilds using wall-clock math (`Date.now() - quarterStartedAt`) but has no record of pauses.
- Files: `src/lib/stores/liveGameStore.ts:1-13` (documented)
- Trigger: Pause the clock, reload the page, observe zone minutes are inflated by pause duration.
- Workaround: Don't reload during an active quarter. Pauses in a completed quarter don't matter (minutes are already recorded).
- Impact: Fair rotation is compromised if mid-quarter reload happens after a pause. Zone minutes for that quarter will be overstated.
- Fix approach: Persist pause events to `game_events` table (similar to quarter_start/quarter_end). On load, replay all events to correctly compute accumulatedMs.

## Security Considerations

**Share token validation — minimal but consistent:**
- Risk: Share tokens are UUIDs generated at game creation time. Validation pattern is simple string equality (`game.share_token !== auth.token`), no rate limiting or token rotation.
- Files: `src/app/(app)/teams/[teamId]/games/[gameId]/actions.ts:29`, `src/app/(app)/teams/[teamId]/games/[gameId]/actions.ts:70`, `src/app/(app)/teams/[teamId]/games/[gameId]/actions.ts:220`, `src/app/(app)/teams/[teamId]/games/[gameId]/live/actions.ts:25`
- Current mitigation: Tokens are cryptographically random (gen_random_uuid), long enough to prevent guessing. Public runner URLs (`/run/[token]`) are the only token-based access point. No way to enumerate or list valid tokens (only the game creator can share the URL).
- Recommendations: (1) Log token-auth failures for abuse monitoring; (2) Add optional token rotation per game (longer-lived "enable sharing" + ephemeral token per session); (3) Consider rate-limiting share-token auth failures per IP.

**RLS policies rely on team_memberships for all access control:**
- Risk: Every table's SELECT/INSERT/UPDATE policy checks `is_team_member()` or `is_team_admin()`. If team_memberships integrity is compromised (a malicious INSERT via a bug), the user gains access to all team data.
- Files: `supabase/migrations/0001_initial_schema.sql:136-217` (RLS policy definitions)
- Current mitigation: `team_memberships` is protected — only team admin can INSERT/UPDATE/DELETE. Auto-trigger on team creation ensures the creator is added as admin. No direct user control over role escalation.
- Recommendations: (1) Audit triggers on team_memberships (log INSERTs/DELETEs); (2) Add a `verified_at` timestamp to team_memberships, fail checks if not set (catches bug insertions); (3) Test RLS with a non-admin user trying to escalate their role.

**Admin queries bypass RLS — trust boundary is correct but surface is large:**
- Risk: `src/lib/admin/queries.ts` has 736 lines of cross-tenant queries. All call `createAdminClient()` which bypasses RLS. If a route/action incorrectly marks itself `"use server"` but forgets `requireSuperAdmin()`, it leaks the admin client.
- Files: `src/lib/admin/queries.ts`, `src/app/(app)/admin/` routes
- Current mitigation: Admin routes are under `/admin` which has layout-level auth check. No public routes accidentally use admin functions.
- Recommendations: (1) Add a JSDoc comment to all functions in admin/queries.ts reminding devs it's privileged; (2) Create a linter rule that flags admin client usage outside of `/admin` routes; (3) Rotate admin API keys if a security incident involves admin access.

## Fragile Areas

**Live game state machine (LiveGame.tsx + liveGameStore.ts + fairness.ts):**
- Files: `src/components/live/LiveGame.tsx` (500+ lines), `src/lib/stores/liveGameStore.ts` (574 lines), `src/lib/fairness.ts` (748 lines)
- Why fragile: Recent commits indicate a pattern of repeated fixes to the live-game flow — `fix(e2e): long-press, lineup availability, TagManager temp-id`, `fix(e2e): five distinct fixes to unblock the actually-failing specs`, `fix(e2e): un-fixme injury-replacement specs`, `fix(e2e): un-fixme live-swaps + live-scoring`. The three-layer state (React local state + Zustand + fairness engine) creates multiple failure modes:
  - Selection state (field vs bench) can diverge from lineup state if a swap is in-flight.
  - Injury replacement updates both injuredIds and lineup in one call, but if the action fails, state is inconsistent.
  - Zone locking and field locking are separate but interact in opaque ways.
  - Pause state is ephemeral (not persisted), so reloads during a paused quarter silently corrupt minute tracking.
- Safe modification: (1) Write a regression test for each bug found (already being done, good); (2) Add invariant checks at quarter-end (total field minutes should equal quarter duration × on-field size); (3) Consider collapsing the three layers into a single event-sourced model (replay events to derive state); (4) Document the state machine explicitly (state diagram + transition rules).
- Test coverage: e2e specs exist for injury-replacement, live-swaps, live-scoring, and lineup (recent un-fixme commits indicate these are now passing). Unit tests exist in `src/lib/__tests__/` for fairness logic, suggest swaps, and apply injury swaps. Gap: no unit test for the interactive state transitions in LiveGame.tsx itself (selection → swap → apply → state update).

**Injury replacement modal and swap dialogs:**
- Files: `src/components/live/InjuryReplacementModal.tsx`, `src/components/live/SwapCard.tsx`, `src/components/live/SwapConfirmDialog.tsx`
- Why fragile: Multiple modals can be open (injury modal + swap card + confirm dialog). If a user dismisses one without committing, the others may still have stale state. Recent `fix(e2e): un-fixme injury-replacement specs` suggests this was broken before.
- Safe modification: Test the dismissal paths (press Esc, click outside, click Cancel) for each modal combination.

**Long-press handling in Field.tsx and PlayerTile.tsx:**
- Files: `src/components/live/Field.tsx:163`, `src/components/live/PlayerTile.tsx`
- Why fragile: Long-press is mobile-critical but tricky to implement. Recent commit `fix(e2e): long-press, lineup availability, TagManager temp-id` suggests it was broken. Desktop mouse events don't naturally support long-press (no onLongPress event), so it's typically a polyfill or custom hook.
- Safe modification: Check that onLongPress fires consistently on mobile (iOS/Android) and doesn't interfere with regular tap. Test in e2e with real touch events.

**Lineup availability indicator:**
- Files: `src/components/live/Field.tsx`, `src/components/live/Bench.tsx` (render players with availability data)
- Why fragile: Recent commit mentions "lineup availability" as one of the five fixes. The rendering of unavailable/loaned/injured players overlaps with slot allocation logic.
- Safe modification: Add a unit test for `suggestSwaps()` when some players are unavailable. Verify the suggested lineup never puts an unavailable player on the field.

## Performance Bottlenecks

**Field zone rendering with no key stability:**
- Problem: `src/components/live/Field.tsx:123-188` renders zones, then slots within each zone. The slot key is `slot` (the array index), not the player ID. If the lineup changes (a player is removed from a zone), slot indices shift and React may re-use DOM for the wrong player.
- Files: `src/components/live/Field.tsx:137` (`key={slot}`)
- Cause: Array indices as keys are an anti-pattern when the array order or length can change. Each slot render is lightweight, but swapping players between zones causes unnecessary mounts/unmounts.
- Improvement path: Use a stable key like `${key}-${slot}` (zone key + slot index) or `pid ?? 'empty'` (player ID or "empty" marker). This prevents React from re-using PlayerTile instances when zones shift.

**Bench rendering likely unbounded:**
- Problem: `src/components/live/Bench.tsx` renders all bench players in a scrollable list. If a squad has 25 players (typical), all are rendered even if the user scrolls past. No virtualization.
- Files: `src/components/live/Bench.tsx`
- Cause: React doesn't virtualize by default. For 25 PlayerTile renders it's fine, but scaling to larger squads or rendering on older devices could stall.
- Improvement path: Use `react-window` or a similar virtualization library if Bench grows beyond ~30 players. For now, acceptable performance but document the limit.

**Admin queries use offset pagination:**
- Problem: `src/lib/admin/queries.ts` and admin dashboard pages use `offset` pagination (SELECT ... OFFSET X LIMIT Y). This is slow on large tables because the database must scan and skip X rows each time.
- Files: `src/lib/admin/queries.ts` (uses `offset` implicitly in page math)
- Cause: Easier to implement than keyset pagination, but doesn't scale.
- Improvement path: Switch to keyset pagination (WHERE id > lastId LIMIT Y) for admin user list, team list, etc. Document the pattern.

**fairness.ts gameZoneMinutes may iterate all events multiple times:**
- Problem: `src/lib/fairness.ts:94-300+` replays a season's or game's events to compute zone minutes. Each event is examined sequentially, and there are multiple passes over the event array (one for gameZoneMinutes, more for suggestSwaps, etc.).
- Files: `src/lib/fairness.ts` (the entire module is O(n * iterations) in event count)
- Cause: The algorithm is correct but not cached. If a game is long (4 quarters) and you call suggestSwaps multiple times, the events are replayed each time.
- Improvement path: Memoize the gameZoneMinutes result in liveGameStore so it's only computed once per quarter. Cache suggestSwaps result and invalidate only on lineup/fairness-relevant events.

## Scaling Limits

**Supabase concurrent connections for live games:**
- Current capacity: Siren can handle 1 live game with ~15 players on field + ~10 bench, ~20 parents watching (all polling or subscribed). Supabase free tier has 100 concurrent connections; with overhead it's ~30 live games before exhaustion.
- Limit: Reaches when live-game listeners (one per parent + one per manager) exceed available connections.
- Scaling path: Move live-game state to a dedicated WebSocket server (or upgrade Supabase to paid tier with more connections). Batch parent updates (push-based notifications instead of polling) to reduce connection count.

**PlayHQ GraphQL API rate limiting:**
- Current capacity: Fetching a team page with 10+ rounds takes ~2-3 seconds. No explicit rate limit observed, but the API may throttle aggressive clients.
- Limit: If many teams import fixtures simultaneously, requests may slow or be rejected.
- Scaling path: Cache fixture data server-side with a TTL (e.g., 1 hour). Use a job queue to refresh popular teams' fixtures in background.

## Dependencies at Risk

**No pinned auth framework — manual OAuth state management:**
- Risk: Siren implements magic-link auth via Supabase (custom rules, email verification, redirects). No auth library (NextAuth, Clerk, etc.). If Supabase auth API changes, code must be updated manually.
- Impact: Auth flows in `src/app/auth/` and `src/lib/supabase/` are custom. A breaking Supabase change breaks login/signup.
- Migration plan: If needed, migrate to NextAuth with Supabase adapter (well-supported) or Clerk. This is not urgent (Supabase auth is stable), but consider it for a future refactor.

**Zustand store in client component only:**
- Risk: `useLiveGame()` hook only works in client components. If the app ever needs to hydrate live-game state server-side (e.g., for SSR), Zustand won't work. No server-side store equivalent.
- Impact: Live game page cannot be SSR'd; it's always `"use client"` which is acceptable for a live app but limits flexibility.
- Migration plan: Not urgent. If SSR becomes needed, move liveGameStore to a more transport-agnostic state management (e.g., a context + reducer).

**Playwright test dependency on local Supabase container:**
- Risk: E2E tests (`npm run e2e`) require `docker compose up` with Supabase running. If Docker or Supabase container image breaks, CI blocks.
- Impact: E2E suite is fragile to environment setup. CI might fail due to container pull timeouts, not code issues.
- Migration plan: (1) Use `@playwright/test`'s built-in fixtures to mock Supabase responses (MSW-style) for faster CI; (2) Keep local Supabase for developer testing; (3) Run integration tests (real Supabase) on a dedicated CI step with retries.

## Missing Critical Features

**No OTP/2FA for team admins:**
- Problem: Team admin accounts are email/password only. A compromised password gives full access to the team's game data and live-game control.
- Blocks: Complying with data protection best practices for team records.
- Fix approach: Add optional TOTP or email-based 2FA to auth. Require for super-admin, suggest for team admins.

**No audit log for game event mutations:**
- Problem: When a manager records a score, makes a sub, or ends a quarter, there's no permanent record of WHO did it or WHEN (beyond the game_events table structure, no actor ID).
- Blocks: Investigating disputes ("who changed the score?") or compliance audits.
- Fix approach: Add `user_id` and `updated_at` to relevant game_events rows. Create an audit log table that mirrors mutations with actor + timestamp.

**No test data reset for E2E — relies on timestamps:**
- Problem: E2E tests use `${timestamp}@siren.test` emails to avoid collisions. If tests are run frequently, the email addresses become very long or collide if tests run simultaneously.
- Blocks: Scaling E2E to many parallel runners.
- Fix approach: Add a `tearDown()` fixture that deletes test users at the end of each test (already done via `deleteTestUser`, good). Consider a `beforeAll` hook that cleans up stale test data (users older than 1 hour).

## Test Coverage Gaps

**No unit test for LiveGame.tsx state transitions:**
- What's not tested: The interactive state machine (selection, pending swaps, injury modals opening/closing) is integration-tested via e2e but not unit-tested. A change to the selection logic won't be caught until e2e runs.
- Files: `src/components/live/LiveGame.tsx` (entire file, no .test.tsx equivalent)
- Risk: Swaps or selections breaking undetected in CI if e2e is skipped or delayed.
- Priority: Medium (e2e coverage exists, but unit tests would catch regressions faster).

**No unit test for TagManager create/edit/delete state:**
- What's not tested: TagManager's optimistic update flow (setState immediately, then sync with server) is tested via e2e but not in isolation. The past bug (temp-id → stuck edit mode) would have been caught by a unit test.
- Files: `src/components/admin/TagManager.tsx`
- Risk: Similar bugs resurface if TagManager is refactored.
- Priority: Medium.

**Admin queries lack unit tests:**
- What's not tested: The `src/lib/admin/queries.ts` cross-tenant queries (736 lines) are tested via e2e (super-admin dashboard render tests) but not isolated. Query logic (pagination, filtering, aggregation) is untested.
- Files: `src/lib/admin/queries.ts`
- Risk: A subtle SQL bug in a KPI aggregation or user list filter could slip through.
- Priority: Low (rarely changes; e2e coverage is reasonable).

**Fairness engine edge cases not fully tested:**
- What's not tested: `src/lib/fairness.ts` is unit-tested for basic cases (suggestSwaps, applyInjurySwap) but not for edge cases: empty squad, all players injured, 1 player vs 10 zone slots, tied fairness scores.
- Files: `src/lib/fairness.ts`, `src/lib/__tests__/` (ageGroupFlow.test.ts, applyInjurySwap.test.ts, liveGameInit.test.ts, suggestStartingLineup.test.ts exist but are not exhaustive)
- Risk: Suggest swaps might panic or suggest invalid lineups in edge cases.
- Priority: Low (edge cases are rare in real use, but should be documented).

---

*Concerns audit: 2026-04-29*
