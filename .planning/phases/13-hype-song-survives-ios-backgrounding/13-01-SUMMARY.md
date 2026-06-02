---
phase: 13-hype-song-survives-ios-backgrounding
plan: 01
subsystem: live-game / hype-song audio (shared hook + pure controller)
tags: [hype-song, audio-01, ios-backgrounding, re-arm, visibilitychange, reduceSongArm, pure-controller, red-first-tdd, shared-hook, re-arm-not-rework]
provides:
  - reduceSongArm(state, event) — pure, framework-free re-arm controller (states idle/ready/suspended; events ready/play/hidden/visible/playSucceeded/playFailed; actions none/play/rearm-then-play/rearm); returns rearm-then-play (not a no-op) when a play arrives while suspended (the post-Q1-on-iOS case)
  - SongArmState / SongArmEvent / SongArmAction / SongArmResult types
  - useHypeSong re-arm wiring — armStateRef + a document visibilitychange effect (registered + cleaned up) that drives the controller and re-arms BOTH backends (YT wake via seekTo+playVideo; null songAudioRef so the next play builds a fresh Audio element) after the OS suspends the session; the suspended-context play rejection is surfaced (dispatch playFailed + dev warn) instead of swallowed
affects: [live-game (AFL LiveGame.tsx, netball NetballLiveGame.tsx — benefit for free, call sites untouched)]
tech-stack:
  added: []
  patterns: [pure-reducer-controller, thin-hook-adapter, page-visibility-re-arm, mirror-beep-audioctx-resume, surface-not-swallow, re-arm-not-rework, red-first-tdd, node-only-vitest]
key-files:
  created:
    - src/lib/live/hypeSongController.ts
    - src/lib/__tests__/hypeSongController.test.ts
  modified:
    - src/lib/live/useHypeSong.ts
key-decisions:
  - "D-01: one wave / one plan — fix the ALREADY-SHARED useHypeSong.ts; no per-sport fork (AFL + netball consume it verbatim; rugby league has no hype song)"
  - "D-02: extract a PURE reduceSongArm(state, event) controller into a new src/lib/live/hypeSongController.ts so the re-arm DECISION is unit-testable in the existing node Vitest env (repo has no jsdom / @testing-library / renderHook); the hook is a thin adapter"
  - "D-03: re-arm via a document visibilitychange listener in the hook (registered + cleaned up), mirroring the sub-due beep _audioCtx resume at LiveGame.tsx:144; re-arm BOTH backends — YT wake (seekTo+playVideo) and null songAudioRef.current so a fresh Audio element is built in-gesture"
  - "D-04: surface the suspended-context play rejection — dispatch playFailed + non-prod console.warn; the old silent .catch(() => {}) and bare outer catch {} are removed"
  - "D-05: re-arm, NOT rework — the YouTube-iframe embed, new Audio() fallback, 1×1 sizing, auto-pause timer, and songUrl.ts are unchanged; the hook's public { containerRef, playSong } is unchanged so AFL + netball call sites are untouched"
  - "D-06: red-first — hypeSongController.test.ts reproduces post-Q1 silence (reduceSongArm('suspended','play') must emit rearm-then-play, which fails against absent/naive logic) then confirms the full suspend→re-arm→play cycle + purity"
  - "D-07: no new e2e — iOS audio-session suspension is not faithfully reproducible in Playwright/Chromium and the song has no assertable DOM output; the red-first pure-controller unit test is the regression gate, the existing AFL + netball live specs remain the no-regression guard"
duration: ~1h
completed: 2026-06-02
---

# Phase 13 / Plan 01: Hype song survives iOS backgrounding (AUDIO-01 / B3)

**The team hype song no longer goes silent after Q1 on iOS. The audio
session is suspended when the OS backgrounds the app or at a period
transition; the hook never re-armed it (no visibility handler — teardown
only fired on gameId/songUrl/hydrated change) and the resulting play
rejection was swallowed. The fix extracts the re-arm DECISION into a pure
`reduceSongArm(state, event)` controller, then rewires `useHypeSong.ts`
to drive that controller from a `document` visibilitychange listener and
to re-arm BOTH audio backends after a suspend / a failed play — so a goal
scored in a later period still triggers the song. The suspended-context
rejection is now surfaced (dev warn), not hidden.**

This is a single-file bug fix in an ALREADY-SHARED hook (consumed verbatim
by AFL + netball; rugby league has no hype song). Re-arm, not rework — the
YouTube-iframe embed, the `new Audio()` fallback, the 1×1 sizing, and the
auto-pause timer are untouched; only the arm/re-arm wiring is added. No
migration, no new GameEventType, no new store slice, no new server action —
client-only audio wiring. The hook's public API is unchanged so the AFL +
netball call sites are not touched.

## Performance
- **Duration:** ~1h
- **Tasks:** 2/2 completed
- **Files:** 2 created, 1 modified (+374 / −3 lines)

## Accomplishments
- **`reduceSongArm` (pure controller, `src/lib/live/hypeSongController.ts`)** —
  a total, side-effect-free reducer over `(SongArmState, SongArmEvent)` →
  `{ state, action }`. The core fix lives here: a `play` while `suspended`
  returns `rearm-then-play` (re-arm the backend, then play) rather than a
  silent no-op — exactly the post-Q1-on-iOS case. A rejected play
  (`playFailed`) flips the session to `suspended` so the *following* play
  re-arms; `hidden` suspends; `visible` eagerly re-arms (`rearm`) but never
  auto-plays; `playSucceeded` proves the session live. No React / DOM /
  Supabase imports → fully unit-testable in the node Vitest env.
- **`useHypeSong` re-arm wiring (`src/lib/live/useHypeSong.ts`)** —
  `armStateRef` holds the controller state across renders; a `dispatchArm`
  helper reduces an event, stores the next state, and returns the action.
  A NEW sibling effect registers (and cleans up) a `document`
  visibilitychange listener that dispatches `hidden`/`visible`; on a `rearm`
  action it drops the suspended direct-audio element (`songAudioRef.current
  = null`) so the next play builds a fresh one inside the gesture. `onReady`
  now also dispatches `ready`. `playSong()` dispatches `play`: on
  `rearm-then-play` it re-arms first (YT path: `seekTo`+`playVideo` wakes the
  iframe; audio path: null the ref so `?? new Audio(songUrl)` recreates it),
  then plays. The YT path treats a successful `playVideo()` as
  `playSucceeded` and relies on `visibilitychange` to flag a later
  suspension; the audio path resolves to `playSucceeded` or, on rejection,
  `playFailed`.
- **Surfaced the error (D-04)** — the old `audio.play().catch(() => {})`
  swallow and the bare outer `catch {}` are gone. A rejected/synchronous
  failure now dispatches `playFailed` (so the next goal re-arms) and logs a
  non-production `console.warn` explaining the likely-suspended session.
- **Re-arm, not rework (D-05)** — the YouTube IFrame embed, the `new Audio()`
  fallback, the forced 1×1 iframe sizing, the auto-pause `setTimeout`, and
  `src/lib/songUrl.ts` are all unchanged. The hook's public return shape
  `{ containerRef, playSong }` is unchanged, so AFL (`LiveGame.tsx:466/778`)
  and netball (`NetballLiveGame.tsx:288/1285/2445`) benefit for free with no
  call-site edits.

## Task Commits
1. **Task 1: RED — controller spec reproducing post-Q1 silence** — `bf6e2e8` — `test(13-01): add failing reduceSongArm re-arm controller spec reproducing post-Q1 song silence`
2. **Task 2: GREEN — controller + useHypeSong rewire + DoD gates** — `dc9ca93` — `fix(13-01): re-arm hype song after iOS audio-session suspension via visibility-driven controller`

## Files Created/Modified
**Created**
- `src/lib/live/hypeSongController.ts` — pure `reduceSongArm(state, event)` + exported `SongArmState` / `SongArmEvent` / `SongArmAction` / `SongArmResult` types.
- `src/lib/__tests__/hypeSongController.test.ts` — 14 tests: the post-Q1 fix (`('suspended','play')` → `rearm-then-play`/`ready`), happy path (idle+ready, ready+play, idle+play→idle/play), suspension transitions (hidden→suspended, visible→rearm, playFailed→suspended, any+playSucceeded→ready, rearm never auto-plays), three full-lifecycle folds (Q1→background→Q2 rearm-then-play; hidden→visible→play; playFailed chain), and purity/determinism + totality across every (state, event) pair.

**Modified**
- `src/lib/live/useHypeSong.ts` — added `armStateRef` + `dispatchArm`; `onReady` dispatches `ready`; NEW visibilitychange effect (SSR-guarded, cleaned up on unmount) that re-arms the direct-audio backend on a `rearm` action; `playSong()` rewired to dispatch `play` and re-arm-then-play when suspended, dispatching `playSucceeded`/`playFailed`; both swallow sites removed.

## Decisions & Deviations
- **Followed the plan** for D-01 → D-07 as specified. No new modal, no new
  store slice, no migration, no new GameEventType, no new server action — the
  only files touched are the new controller + its spec and the shared hook.
- **DEV — backend-asymmetric re-arm.** The direct-audio fallback re-arms
  silently by nulling `songAudioRef.current` so a fresh element is built
  inside the next gesture; the YT iframe cannot be silently re-armed, so it
  is woken at the next goal by the existing `seekTo`+`playVideo` (the
  `rearm-then-play` path). The eager `visible` → `rearm` action is therefore
  a no-op for the YT backend (guarded by `!isYouTubeUrl(songUrl)`), and
  `rearm` NEVER auto-plays (asserted in the spec) — foregrounding can't spam
  audio.
- **DEV — mirrors the in-repo beep precedent.** The sub-due beep's `playBeep`
  (`LiveGame.tsx:138-160`) already re-attempts `ctx.resume()` when the audio
  context drifts back to `suspended`; the song lacked an equivalent. This fix
  applies the same intent (re-arm on suspension) to the song's two backends.

## D-07 — No new e2e (justification)
No Playwright spec was added for this fix, by design (D-07): **iOS
audio-session suspension is not faithfully reproducible in
Playwright/Chromium and the song has no assertable DOM output, so the
red-first pure-controller unit test is the regression gate; the existing
AFL + netball live specs remain the no-regression guard.** The bug is an
OS-level audio-session lifecycle behaviour (suspend on backgrounding /
period transition) that Chromium's headless test runner does not emulate,
and a hype song produces sound, not DOM — there is nothing for an e2e
assertion to read. Extracting the re-arm decision into the pure
`reduceSongArm` controller is precisely what makes the post-Q1 silence
testable in the existing node Vitest environment: `hypeSongController.test.ts`
fails against absent/naive logic (a suspended session that merely replays =
no-op = silence) and passes once the controller emits `rearm-then-play`. The
hook rewire keeps the public API identical, and the existing AFL
(`live-scoring.spec.ts` — goal → `playSong()` path) + netball
(`netball-live-flow.spec.ts` — hook mount) live specs were run to confirm no
regression from the rewire.

## DoD Gates
| Gate | Result |
|------|--------|
| `npx tsc --noEmit` | PASS (exit 0) |
| `npm run lint` | PASS (0 errors; only pre-existing exhaustive-deps warnings at LiveGame.tsx:1257, QuarterBreak.tsx:493, FeatureSection.tsx:77, NetballQuarterBreak.tsx:412 — none in the touched files) |
| `npm test` (Vitest) | PASS — 889/889 across 55 files (+14 new `hypeSongController.test.ts` tests, up from 875) |
| `npm run e2e` | PASS — `live-scoring.spec.ts` + `netball-live-flow.spec.ts` 16 passed / 1 pre-existing skip (`--workers=1` per Phase-9 protocol) |
| Schema drift | NONE — no migration, no new GameEventType, no new store slice, no new server action; client-only audio wiring; public hook API unchanged |

## Next Phase Readiness
- **AUDIO-01 / B3 closed.** This was the last requirement in milestone v1.1
  (Match Day Changes). The hype song now survives backgrounding and period
  transitions on iOS across both sports that have it (AFL + netball); rugby
  league has no song and was correctly left untouched.
- **Pattern available for future audio work.** The pure-controller + thin-hook
  adapter shape (`reduceSongArm` + `useHypeSong`) and the
  re-arm-on-visibilitychange technique mirror the existing beep precedent and
  can be reused if other audio surfaces need the same suspend/re-arm
  resilience.
