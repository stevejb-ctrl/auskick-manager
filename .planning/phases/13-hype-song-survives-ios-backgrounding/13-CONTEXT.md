---
phase: 13-hype-song-survives-ios-backgrounding
type: context
mode: folded-decisions
requirements: [AUDIO-01]
feature: B3
source: .planning/MATCH-DAY-CHANGES-SPEC.md (lines 66-82)
ui_spec: none (no visible UI — audio-only fix in an existing hook)
research: skipped (single-file bug fix over an existing hook; in-repo re-arm analog already exists)
created: 2026-06-02
---

# Phase 13 Context — Hype song survives iOS backgrounding (B3)

> **Planning mode:** the user chose *skip research*, *plan directly from the
> spec* (no separate discuss-phase — fold the decisions here), and *extract a
> pure re-arm helper unit-tested in node Vitest* (do NOT add jsdom; do NOT make
> this e2e-only). This file folds the design decisions the planner/executor need
> so they don't re-ask. This is a bug fix → it lands with a red-first regression
> test that fails against the pre-fix code (CLAUDE.md "Testing is part of done").

## Goal (from ROADMAP Phase 13)

The team hype song keeps firing on goals through the WHOLE game on iOS — it no
longer goes silent after Q1 when the OS suspends the audio context. One
requirement:

- **AUDIO-01** — the audio element/context is **re-armed** after the OS suspends
  it (backgrounding / period transitions) so goals scored in **later periods**
  still trigger the song, not just Q1.

## What already exists (read-only recon — main checkout)

B3 is a **single-file bug** in an already-shared hook. The mechanism works in
Q1; it is simply never re-armed after iOS suspends the audio session, and the
failure is swallowed so nothing surfaces.

### The hook (the one file to fix)
- **`src/lib/live/useHypeSong.ts`** — shared by AFL + netball (rugby league has
  no hype song; confirmed below). Returns `{ containerRef, playSong }`.
  - **YouTube path** (`:70-115` effect builds `window.YT.Player`; `:124-131`
    `seekTo` + `playVideo` + auto-pause timer).
  - **Direct-audio fallback** (`:132-140`) — `const audio =
    songAudioRef.current ?? new Audio(songUrl); audio.play().catch(() => {})`.
  - **Silent swallow** — `audio.play().catch(() => {})` (`:136`) AND an outer
    `try { … } catch {}` around the whole `playSong` body (`:119/:142-144`).
    A suspended-context rejection is dropped on the floor.
  - **Teardown is the only lifecycle hook** — the YT effect cleanup
    (`:108-113`) destroys the player, but its deps are `[songUrl, gameId,
    hydrated]` (`:115`). There is **no `visibilitychange` / app-state handler**,
    so nothing re-arms the element/context after the OS suspends it at a period
    transition or on backgrounding. The song plays in Q1, the session goes
    suspended, and every later `playSong()` no-ops silently.

### Consumers (who calls it — no new fork needed)
- **AFL** `src/components/live/LiveGame.tsx` — `useHypeSong(...)` at `:466`,
  `playSong()` on goal commit at `:778`.
- **Netball** `src/components/netball/NetballLiveGame.tsx` — `useHypeSong(...)`
  at `:288`, `playSong()` at `:1285` and `:2445`.
- **Rugby league** — does **NOT** use `useHypeSong` (no hype song). Out of
  scope; nothing to mirror. **The fix is in the one shared hook → it benefits
  both consumers at once. One wave, one plan, no cross-sport fork.**

### The in-repo re-arm analog (the pattern to mirror)
- The **sub-due beep** already does exactly the "re-attempt resume on suspend"
  move the song is missing — `LiveGame.tsx:138-160` (`playBeep`): a single
  module-level `_audioCtx`, and on each play `if (ctx.state === "suspended")
  void ctx.resume().catch(() => {})` (`:144`) re-arms it before use. The
  surrounding comment (`:118-125`) documents the same iOS suspend-on-blur
  drift. The song lacks this re-arm step — Phase 13 adds the song's equivalent.

### Test infrastructure (the constraint that shaped the design)
- **`vitest.config.ts`** — `environment: "node"`, `include:
  ["src/**/__tests__/**/*.test.ts"]`, alias `@` → `./src`. There is **NO jsdom,
  NO @testing-library/react, NO renderHook** in the repo — every unit test is a
  pure function in node. So the regression test CANNOT mount the hook; it must
  drive a **pure helper**. (This is why D-02 extracts the re-arm decision into a
  pure controller.)

## Decisions (folded — do not re-ask)

- **D-01 — One wave, one plan; fix the shared hook (no fork).** `useHypeSong`
  is already shared chrome consumed verbatim by AFL + netball; rugby league has
  no song. The fix lives entirely in `useHypeSong.ts` (+ its new pure helper +
  spec), so both consuming sports get it for free. No per-sport work, no
  cross-sport mirror, no new component. Single plan `13-01`, `depends_on: []`.

- **D-02 — Extract a PURE re-arm controller, unit-testable in node.** Because
  the repo has no DOM test environment (see above), pull the "given the current
  arm state and an event, what should we do" decision out of the React effect
  into a new pure module **`src/lib/live/hypeSongController.ts`** — e.g. a
  reducer `reduceSongArm(state, event) -> { state, action }` over:
  - **states**: `idle` (nothing played yet) · `ready` (armed, audible) ·
    `suspended` (OS suspended the session — needs re-arm before next play)
  - **events**: `ready` (backend finished init) · `play` (goal fired) ·
    `hidden` (`document.hidden` → page backgrounded) · `visible` (foregrounded)
    · `playSucceeded` · `playFailed` (the play promise rejected — the signal
    that the context is suspended)
  - **actions**: `play` (just play) · `rearm-then-play` (re-arm the backend,
    then play — used when a goal fires while `suspended`) · `rearm` (re-arm
    eagerly on `visible`, no play) · `none`
  The hook becomes a thin adapter that wires real DOM/YT/Audio calls to the
  actions the pure controller returns. The controller carries NO React, NO DOM,
  NO Supabase imports → fully node-unit-testable.

- **D-03 — Re-arm via the Page Visibility API, mirroring the beep's resume.**
  The hook adds a `document.addEventListener("visibilitychange", …)` listener
  (registered in an effect, cleaned up on unmount) that dispatches `hidden` /
  `visible` into the controller, AND re-arms on a failed play, so a goal in a
  later period re-arms-then-plays. Re-arm touches BOTH backends:
  - **YouTube** — wake the suspended iframe player (e.g. `seekTo(start, true)`
    then `playVideo()`; treat as armed once it actually plays). Re-arm before
    the play so the later-period goal is audible.
  - **Direct audio** — null out `songAudioRef.current` on suspend so the next
    `playSong()` recreates the `Audio` element fresh inside the (re-armed) user
    /visibility gesture, instead of reusing a dead suspended element.
  Mirror the beep: re-attempt eagerly when the page returns to `visible`, and
  again defensively at play time if the controller is still `suspended`.

- **D-04 — Surface the suspended-context error; stop swallowing it.** Replace
  the silent `audio.play().catch(() => {})` and the bare outer `catch {}` so a
  play rejection (the suspended-context signal) drives a controller `playFailed`
  event (triggering `rearm-then-play`) AND is observable (a `console.warn`/dev
  log — not swallowed). The fix must make the failure *actionable*, per ROADMAP
  criterion #3 ("silent failure swallowing no longer hides a suspended-context
  error"). No user-facing error UI is in scope — just stop hiding it.

- **D-05 — Re-arm, don't rework.** Keep the existing audio MECHANISM exactly:
  the YouTube-iframe embed and the `new Audio()` fallback stay. We add a re-arm
  step and a visibility listener around them — we do NOT swap players, change
  the embed, add a new audio library, or touch `songUrl.ts`. (REQUIREMENTS
  Out-of-Scope: "Reworking the YouTube-iframe song path beyond re-arming it.")

- **D-06 — Red-first regression test reproduces the post-Q1 silence.** Write
  the spec FIRST against the pure controller and watch it go red: assert that
  the pre-fix decision logic (which has no `suspended`/re-arm notion) would
  no-op a `play` after a `hidden` (suspend) — i.e. it does NOT emit
  `rearm-then-play` — reproducing "silent after Q1". Then implement the
  controller so the same sequence (`ready` → `play`=`play` → `hidden` →
  `play`=`rearm-then-play`; and `hidden` → `visible`=`rearm` → `play`=`play`)
  goes green. Cover: play while ready → `play`; play while suspended →
  `rearm-then-play`; visible after hidden → `rearm`; `playFailed` → moves to
  `suspended` so the *next* play re-arms; purity (no input mutation).

- **D-07 — No new e2e (justified); the red-first UNIT test is the regression
  gate.** iOS audio-session suspension is not faithfully reproducible in
  Playwright/Chromium (no real OS suspend; `visibilitychange` in headless does
  not suspend a Web Audio/`<audio>` session the way iOS Safari does), and the
  song produces no assertable DOM output to gate on. ROADMAP criterion #4 asks
  for a "regression test (written red-first)" — the pure-controller node test
  satisfies it precisely and runs in the existing infra. The existing live e2e
  suites (AFL/netball) MUST stay green (no regression) but no new spec is added.
  Justification recorded here and to be restated in 13-01-SUMMARY.

## Out of scope (this phase)

- Reworking the YouTube-iframe song path or the `new Audio()` fallback beyond
  re-arming them (locked by AUDIO-01 Out-of-Scope).
- Any new audio library, embed swap, or change to `songUrl.ts`.
- A new e2e spec (D-07 — iOS suspension isn't simulable; node unit test is the
  regression gate). Existing live specs must still pass.
- Rugby league (it has no hype song) and any new user-facing error UI.
- jsdom / @testing-library / renderHook infra (the repo is node-only by design).

## Canonical refs

```
# The file to fix (shared hook — AFL + netball)
src/lib/live/useHypeSong.ts:70-115     # YT player effect + cleanup (deps [songUrl, gameId, hydrated]) — no visibility handler
src/lib/live/useHypeSong.ts:117-145    # playSong(): YT seekTo/playVideo OR `new Audio()`; outer try/catch swallows
src/lib/live/useHypeSong.ts:136        # audio.play().catch(() => {}) — the swallow to surface (D-04)
src/lib/live/useHypeSong.ts:142-144    # bare outer catch {} — also swallows

# In-repo re-arm analog to mirror (D-03)
src/components/live/LiveGame.tsx:118-160   # _audioCtx beep: ctx.state === "suspended" → ctx.resume() re-arm

# Consumers (no fork; benefit for free)
src/components/live/LiveGame.tsx:466,778            # AFL: useHypeSong + playSong() on goal
src/components/netball/NetballLiveGame.tsx:288,1285,2445  # netball: useHypeSong + playSong()
# (rugby league: NO useHypeSong — out of scope)

# Test infra constraint (D-02 / D-06)
vitest.config.ts                       # environment: "node"; include src/**/__tests__/**/*.test.ts; alias @ -> ./src

# To create
src/lib/live/hypeSongController.ts                  # pure reduceSongArm(state, event) (D-02)
src/lib/__tests__/hypeSongController.test.ts        # red-first regression (D-06)

# Spec source
.planning/MATCH-DAY-CHANGES-SPEC.md:66-82           # B3 recon (hypothesis (b) confirmed)
.planning/REQUIREMENTS.md:181                        # AUDIO-01
```
