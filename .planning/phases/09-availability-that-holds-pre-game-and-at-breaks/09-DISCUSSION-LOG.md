# Phase 9: Availability that holds — pre-game & at breaks - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-06-01
**Phase:** 9-Availability that holds — pre-game & at breaks
**Areas discussed:** B1 which screen is "the picker", B1 what "doesn't persist" means, B2 break-time actions & placement, B2 "mark out" semantics + cross-sport

---

## B1 — which screen is "the picker"

### Q1: When the unavailable edit doesn't stick, which screen are you on?

| Option | Description | Selected |
|--------|-------------|----------|
| The Availability screen | Dedicated list with the per-player toggle (AvailabilityRow → setAvailability). B1 = persistence/stale-read fix on an existing surface. | ✓ |
| The Lineup Picker (zones) | Drag-into-zones screen; no availability control today. B1 would require ADDING a mark-unavailable affordance there. | |
| Both / not sure | Treat the whole pre-game→kickoff path as in scope. | |

**User's choice:** The Availability screen
**Notes:** Resolves the recon discrepancy — availability is correctly edited on the Availability screen; no new control is added to LineupPicker.

### Q2: Which Availability mount do you use before a game?

| Option | Description | Selected |
|--------|-------------|----------|
| In-app (signed in) | The Availability page inside the app as coach (teams/[teamId]/games/[gameId]/availability). | ✓ |
| Share link (run token) | The /run/[token] share page; same AvailabilityList over a token path. | |
| Both, depending on the day | Harden persistence for both mounts. | |

**User's choice:** In-app (signed in)
**Notes:** Primary repro/test path is the in-app page. Run-token mount uses the same writer + startGame, so it's covered by the server-side fix — sanity-check only.

---

## B1 — what "doesn't persist" means

### Q3: Does the unavailable edit survive a reload of the Availability screen?

| Option | Description | Selected |
|--------|-------------|----------|
| Yes — sticks on the screen | Pill flips to Unavailable and survives reload. Write reaches game_availability; bug is downstream — the GAME doesn't read latest status at kickoff. | ✓ |
| No — reverts on reload | Write itself isn't landing; bug is in the save path. | |
| Not sure — haven't reloaded | Cover the whole edit→reload→kickoff chain. | |

**User's choice:** Yes — sticks on the screen
**Notes:** Narrows the bug to the read/seed path. The write (optimistic flip + write-queue in AvailabilityRow) is correct and untouched.

### Q4: Do you set unavailable BEFORE or AFTER starting the game?

| Option | Description | Selected |
|--------|-------------|----------|
| Edit, THEN start the game | Mark unavailable first, then start — still shows available. Suggests the start-game read/snapshot doesn't see the just-saved status. | ✓ |
| Game already open, then edit | Editing after the live session started doesn't flow through. | |
| Varies / both happen | Always reflect latest persisted availability regardless of timing. | |

**User's choice:** Edit, THEN start the game
**Notes:** Confirms the stale-lineup-draft root cause: the draft (built earlier with the player in it) still seeds startGame, which commits the lineup without reconciling against game_availability.

### Q5: When a player is marked unavailable AFTER a lineup was built, what should happen at kickoff?

| Option | Description | Selected |
|--------|-------------|----------|
| Auto-remove from field | Pull them out of the starting lineup automatically; never start an unavailable player. Availability is source of truth. No prompt. | ✓ |
| Block start + warn | Warn and make the coach resolve before kickoff. | |
| Just exclude from rotation | Keep off the field, no prompt; functionally similar. | |

**User's choice:** Auto-remove from field
**Notes:** Silent auto-removal; normal rotation fills the gap. Drives the fix contract (reconcile lineup ∩ availableIds, server-side in startGame) and the red-first regression assertion.

---

## B2 — break-time actions & placement

### Q6: Which availability actions do you need at a period break? (multi-select)

| Option | Description | Selected |
|--------|-------------|----------|
| Add an arrived player | Mark available + bring into rotation mid-game via addLateArrival. | ✓ |
| Mark a present player out | Mark unavailable so they drop out of rotation. | ✓ |
| Mark a player injured | Existing markInjury stays alongside the new actions. | ✓ |

**User's choice:** All three (add arrived, mark out, mark injured)
**Notes:** —

### Q7: How should these actions be surfaced at the break?

| Option | Description | Selected |
|--------|-------------|----------|
| One "Manage availability" entry | Single button opens the SAME availability list/sheet used pre-game (reuse AvailabilityList). One consistent surface, identical across sports. | ✓ |
| Inline per-player controls | Each row gets its own add/out/injure affordance; more bespoke UI. | |
| Reuse the in-game menu | Wire the in-game LateArrivalMenu / LiveAdminUtilityRow into the break. | |

**User's choice:** One "Manage availability" entry
**Notes:** Reuse-before-fork; minimal new UI; same mental model as pre-game.

---

## B2 — "mark out" semantics + cross-sport

### Q8: When you mark a present player OUT at a break, what should happen?

| Option | Description | Selected |
|--------|-------------|----------|
| Drop from next period's rotation | Keep earned TOG; suggester stops placing them; no replacement prompt. | |
| Out + force a replacement now | Mirror the injury flow — prompt to pick who takes their spot (InjuryReplacementModal). | ✓ |
| Out for rest of game, hard | Drop + lock out from accidental re-add. | |

**User's choice:** Out + force a replacement now
**Notes:** "Out" mirrors injury mechanically (forced replacement for the upcoming period); differs only in the recorded reason. Reuse InjuryReplacementModal.

### Q9: Ship B2 to all three sports this phase, reusing the injury-replacement flow?

| Option | Description | Selected |
|--------|-------------|----------|
| All three, reuse injury flow | Wire the "Manage availability" entry + replacement prompt into AFL/netball/league, reusing InjuryReplacementModal. AFL is the reference. | ✓ |
| AFL first, others follow | Prove on AFL this phase; fast-follow the others (risks inconsistency). | |
| All three, bespoke replacement | Ship to all three but build a new out-replacement modal. | |

**User's choice:** All three, reuse injury flow
**Notes:** AFL QuarterBreak.tsx is the reference; netball + league mirror its rhythm.

---

## Claude's Discretion

- Exact label/placement of the "Manage availability" button per break surface (match AFL rhythm).
- Whether server-side auto-removal emits telemetry/an event.
- Client-side picker-hydration filter mechanism (filter at load vs. reactive recompute).
- Whether "mark out" records a distinct event type vs. a reason flag.

## Deferred Ideas

None raised outside phase scope. Adjacent work belongs to later phases: F4 + B4 (Phase 10), F1/F2 (Phase 11), F3 (Phase 12), B3 (Phase 13), WR-01 fairness mismatch (Phase 10 carry-forward).
