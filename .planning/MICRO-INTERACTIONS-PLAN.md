# Micro-Interactions Plan — Siren Footy

A prioritized plan to take the app from "it does the job" to "this is
beautiful." Scoped to a multi-PR rollout — every item is sized to be
delivered, tested, and reviewed on its own.

The audit found a strong foundation (tokens, brand pulse system,
tap-highlight kills, tabular-nums, reduced-motion already wired) and a
small set of clear gaps (a broken `PulseRing` animation, missing
`active:` feedback on tap targets, no haptics primitive, ad-hoc modal
mount with no slide-in, score numerals that change without
acknowledgement). The plan addresses both: shore up the foundation,
then layer flourishes.

---

## 1. Current state audit

### What is already in place (and good)

- **Duration + easing tokens.** `tailwind.config.ts:127-131` exposes
  `duration-fast` (120ms), `duration-base` (200ms), `duration-slow`
  (320ms), and `ease-out-quart`
  (`cubic-bezier(0.2, 0.8, 0.2, 1)`). All three durations sit inside
  Apple's 100–500ms target band[^hig-motion].
- **Brand pulse system.** `siren-pulse` (infinite) +
  `siren-pulse-once` (one-shot) keyframes in
  `src/app/globals.css:168-198` drive `PulseDot`, `PulseMark`,
  `SirenPulseHalo`, and the iOS splash CALayer halo. Brand-aware
  via CSS variables — flips alarm-orange → court-blue on the netball
  domain automatically.
- **Reduced-motion respected** in every brand-pulse rule
  (`globals.css:175, 196`) and in `RevealOnScroll`
  (`src/components/marketing/RevealOnScroll.tsx:29-35`) which skips
  the IntersectionObserver dance and shows content instantly. Apple's
  reduced-motion criteria are met[^hig-reduced].
- **Native-feel resets** in `globals.css:117-150`:
  `-webkit-tap-highlight-color: transparent`,
  `touch-action: manipulation` on every interactive element (kills
  the 300ms double-tap-zoom delay), `overscroll-behavior-y: contain`
  on the root (stops pull-to-refresh from wiping live-game state).
- **Tabular numerals everywhere a digit is read in a glance** —
  `.nums` utility (`globals.css:154-157`) is used on the clock pill,
  PlayerTile time, ScoreBlock. Digits never jump width.
- **Button-local pending state pattern** is established:
  `ContinueToLineupButton.tsx` is the canonical example —
  `useTransition` + `router.push` + `loading={isPending}` swaps the
  `SFButton` leading icon to a `PulseDot` and swaps the text label
  ("Continue to lineup" → "Loading lineup…"). Same shape in
  `ResetGameButton`, the "Ready for Qx" kickoff buttons,
  `AvailabilityRow` toggle.
- **Brand "siren moment" wrapper.** `SirenPulseHalo` re-keys an inner
  `<span>` so the `siren-pulse-once` keyframe restarts cleanly on
  every `triggerKey` change. Already wired to the FT GameSummaryCard
  arrival (`live/GameSummaryCard.tsx:254-263`) and to the clock pill
  on quarter-end (`LiveGame.tsx:1131` sets `clockPulseKey`).
- **`navigator.vibrate` in 3 high-signal moments** in
  `LiveGame.tsx:695, 1075, 1133` — swap-applied toast, sub-due modal
  open, quarter-end hooter. Guarded by `matchMedia("(hover: none)")`
  so desktop is silent. Foundation for a proper haptics primitive.
- **Hover-lift treatment** on interactive cards via
  `SFCard interactive` (`sf/SFCard.tsx:31-33`):
  `hover:-translate-y-px hover:shadow-pop` with `duration-base`.

### Where it's ad-hoc or inconsistent

- **`PulseRing` animations don't exist in the Tailwind config.**
  `src/components/brand/PulseRing.tsx:53-57` references
  `animate-pulse-ripple-burst`, `animate-pulse-ripple-slow`,
  `animate-pulse-ripple` — none of these are defined in
  `tailwind.config.ts`. The component renders an invisible span.
  `KickoffPulseWrapper.tsx` is therefore a no-op in production.
  **This is a P0 bug, not a polish item.**
- **No `active:` state on most tap targets.** Audited against
  `UX-REVIEW.md:55-60` — confirmed: `SFButton`, `Button`,
  `PlayerTile`, list rows, modal Cancel buttons all only have
  `hover:`. Phones can't hover; the tap currently has zero visual
  acknowledgement during the 50-150ms before the action lands. On
  iOS this is the second-biggest tell that the app is web-wrapped
  (after the tap-highlight, which is already fixed).
- **Modals appear instantly, no slide-in.** `Modal.tsx` and
  `SlotFillSheet.tsx` paint at full opacity with no transform on
  mount. iOS users expect sheets to slide up from the bottom; the
  current behaviour reads as "jank" even though it's actually
  performant. Affects every modal in the live-game flow:
  StartQuarterModal, QuarterEndModal, SubDueModal,
  InjuryReplacementModal, SwapConfirmDialog, etc.
- **Score numerals tick without acknowledgement.** ScoreBlock /
  GameHeader / ScoreBug all change `5.3` → `6.3` in a single render
  with no flash, no pulse, no count-up. The "did my tap register?"
  feedback is gone the instant the digit changes. The clock pill
  *does* pulse on quarter-end (good), but the score itself never
  does on a goal — the most emotionally-charged moment in the app.
- **No haptics primitive.** Three call sites use `navigator.vibrate`
  inline; one is for swap-applied, two for siren moments. There's no
  Capacitor Haptics integration despite the iOS shell having access
  to the system's high-fidelity Taptic Engine. Web vibrate works on
  Android but Apple deliberately disabled `navigator.vibrate` in
  Safari/WebKit — so iOS users currently get **zero haptic feedback**
  on swap-applied. This is a near-invisible loss because the visual
  toast still fires.
- **List items appear/disappear with no transition.**
  `LineupPicker`, `Bench`, `AvailabilityList`, fill-ins list — every
  add/remove is a hard repaint. Reorder is a hard repaint. The
  ContinueToLineupButton experience is *button*-local but the list
  it leaves behind doesn't acknowledge the swap.
- **Input focus is correct but state-change is silent.** `Input.tsx`
  swaps to `border-danger` on error with no transition — the red
  border snaps in. Easy fix.
- **`SlotFillSheet` slides on its own backdrop colour change but the
  sheet itself drops in.** It correctly anchors `items-end` on
  mobile, so the geometry for a slide-up is already there — the
  transform is just missing.
- **Page transitions are entirely absent.** App-router soft-nav
  between Games tab → game-detail → availability → lineup → live is
  instant with no acknowledgement. The `ContinueToLineupButton`
  works around this by making the *button* show pending state, but
  every other internal navigation lacks the cue. The
  `app/(app)/loading.tsx` skeletons are great but only fire on full
  segment entries, not on sibling-route swaps under a shared
  parent — which is most of the in-app navigation
  (see `ContinueToLineupButton.tsx:21-23`).

### Ten concrete "this would feel elevated by a small interaction" moments

1. **Goal scored.** The score goes `0.0` → `1.0` instantly. Add a
   one-shot brand halo pulse on the team's `ScoreBlock` keyed off
   `teamScore.goals`, and a 200ms count-up of the digit. Already-
   present FT pulse pattern (`SirenPulseHalo` triggerKey) transfers
   directly.
2. **Player tap-to-select on the field.** The `PlayerTile`'s
   selected ring is `ring-2 ring-brand-500` with no transition —
   already on `transition-all duration-fast ease-out-quart` so the
   transition runs, but there's no `active:scale-[0.97]` to give
   pre-commit feedback during the 50-100ms tap travel.
3. **Tap on an empty slot in LineupPicker.** Currently opens
   `SlotFillSheet` instantly. A 220ms slide-up from the bottom edge
   makes it feel like a system sheet.
4. **Quarter-end siren.** Clock pill pulses (good!) but the
   QuarterEndModal also drops in instantly. Coordinate the modal
   slide-up so the pulse and the sheet read as one event.
5. **Swap applied** (`LiveGame.tsx:689-697`). The swap toast appears
   with `vibrate(40)`. Add: the two `PlayerTile`s involved (off-field
   and on-field) briefly halo with the same `SirenPulseHalo` keyed
   off `swapCount`, and the toast slides in instead of fade-in.
6. **Mark player unavailable / available.** `AvailabilityRow` does a
   `useTransition` for the button but the row itself doesn't move.
   Add a soft `bg-flash` (200ms `bg-ok/10` → `bg-surface`) on the
   row after a successful flip — confirms the write landed without
   needing to re-read the pill state.
7. **Kickoff window pulse** (`KickoffPulseWrapper`). **Currently
   broken** — the ring class doesn't resolve. Fix this and the
   inside-window CTA visibly breathes.
8. **Pull-to-refresh on Games list.** Currently disabled at the html
   level (correctly, to protect live-game state). On the Games tab
   we *do* want it. Either scope the `overscroll-behavior` exception
   to `/teams/*/games`, or add an explicit "Pull to refresh" affordance.
9. **Add late arrival.** `LateArrivalMenu` row springs into the
   bench when added. Currently appears instantly. A
   200ms slide-in-from-right + a brief brand-halo on the new row
   would make the addition feel acknowledged.
10. **Final siren — game finalised.** The GameSummaryCard does fire
    a halo via `SirenPulseHalo` (good), but the song that plays
    isn't visually acknowledged on the now-soft-disabled "Finalise"
    button. The button could pulse once with the halo at the moment
    of finalise.

---

## 2. Principles for Siren-specific micro-interactions

### Speed budget

- **Tap acknowledgement: ≤16ms.** Visual feedback (`active:` colour
  change or scale-down) MUST appear on the same paint as the
  pointer-down. Pure CSS, no JS round-trip.
- **State change inside the screen: 120-200ms** (`duration-fast` →
  `duration-base`). This covers button colour flips, toggle slides,
  PlayerTile selection ring, accent fades. Matches Material 3's
  "standard short" easing band[^m3-easing].
- **Modal / sheet open: 220-280ms.** Slightly longer because the
  geometric travel is bigger. Use `ease-out-quart` consistently —
  it's already the project default and matches Apple HIG's
  "decelerate" curve preference[^hig-motion].
- **Modal / sheet close: 160ms.** Closing is shorter than opening —
  Material 3 + iOS both halve durations on exit because the user has
  finished interacting and doesn't need to read the new state.
- **Page navigation acknowledgement: ≤80ms.** If the route is going
  to take >150ms to paint, the button that initiated nav MUST show
  pending state at frame 1 — `useTransition` + `router.push` is the
  established pattern (`ContinueToLineupButton.tsx`).
- **Hard ceiling during live play: 250ms.** Anything in the
  scorebug / field / bench / quarter break must finish inside this
  window or the coach perceives lag. Live game UI gets no
  decorative animation — only acknowledgement.

### When animation helps vs hurts on a sideline app

| Helps | Hurts |
|---|---|
| Confirming a tap landed | Delaying the result of a tap |
| Marking siren moments (goal, quarter end, FT) | Decorating non-events |
| Reassuring during a network round-trip | Pretending the network is faster than it is |
| Drawing the eye to a deadline (sub timer, kickoff) | Pulsing things "just because" |
| Making sheet/modal mount feel intentional | Slow modal exits when the coach is already moving on |

The test: *would the coach miss this animation if it weren't there?*
If "yes" → ship it. If "no" → it's decoration; cut it.

### Brand voice in motion

The **pulse** is the leitmotif. It's an alarm-orange (or court-blue on
netball) one-shot halo expanding from a rounded shape, fading from
`opacity 0.55` to `0`. Pattern is already coded in `siren-pulse-once`
+ `SirenPulseHalo`. Three uses for the pulse:

1. **Siren moments** — quarter-end hooter, full-time, goal scored.
   `SirenPulseHalo size="lg"` keyed off the event count.
2. **Pending action** — `PulseDot` in the leading slot of any button
   that's running a server action. Same hue, sized to fit.
3. **Approaching deadline** — slow infinite pulse on the
   "Start game" CTA inside the kickoff window. (Currently broken,
   see P0-1.)

Everywhere else, motion should be quiet: opacity + transform, 120-200ms,
`ease-out-quart`. No spring physics, no overshoot, no parallax, no
elastic snaps.

### Accessibility — reduced motion is non-negotiable

Every motion recommendation in this plan has an explicit fallback.
The rules:

- **`siren-pulse-once` / `siren-pulse` already disable themselves**
  under `prefers-reduced-motion: reduce` at the CSS level — every new
  pulse-based interaction inherits this automatically.
- **For new keyframes**, wrap in
  `@media (prefers-reduced-motion: no-preference)` or use Tailwind's
  `motion-safe:` / `motion-reduce:` modifiers, NOT a JS check —
  CSS-level guards are static and can't be bypassed by a slow render.
- **For transforms** (slide-up, scale, translate), the fallback is
  always "instant final state, no transition". Opacity-only fades
  are generally fine under reduced motion (they're not
  vestibular triggers) but should still respect the user's
  preference where they're decorative rather than informational.
- **For haptics**, no `prefers-reduced-motion` correlation is
  expected — but iOS users with "Reduce Motion" enabled also tend to
  have "Reduce Animation" / "Reduce Transparency" settings on, and
  Apple's Taptic intensity feels paired with their motion settings.
  Be quiet by default: haptics fire only on the seven actions
  listed in P1-10.

---

## 3. Best-practice survey

### Apple HIG — Motion[^hig-motion] [^hig-reduced]

- Animations should be **purposeful**, **brief**, and **realistic** —
  motion conveys status and instruction, never decoration.
- Target duration band is **100-500ms**. Siren's `duration-fast`
  (120ms), `duration-base` (200ms), and `duration-slow` (320ms) all
  sit inside this band.
- **Reduced Motion** users must still get the information conveyed by
  the motion — never use motion as the *only* signal. Pair every
  pulse with a static state change (colour, text, badge).
- **Sheets slide up** from the bottom of the screen with a soft
  deceleration curve. Dismissing slides back down with a slightly
  shorter duration.
- **Tap feedback** is expected within ~50ms — the system-level
  highlight on iOS native buttons appears on the pointer-down event,
  not on pointer-up.

### Material Design 3 — Motion[^m3-easing]

- **Standard easing** (`cubic-bezier(0.2, 0.0, 0, 1.0)`) for most
  in-screen transitions. Siren's `ease-out-quart` is a near-twin —
  fine to keep using it as the single curve.
- **Emphasized easing** (`cubic-bezier(0.05, 0.7, 0.1, 1.0)`) for
  hero / brand moments — we don't need a second curve unless the
  current one starts feeling samey across the app.
- **Durations scale with surface area**: small (75-150ms) for chips
  / toggles, medium (200-300ms) for sheets / cards, long
  (350-500ms) for full-screen transitions. Siren is mostly small
  /medium; the FT GameSummaryCard slide-up at 550ms is the only
  "long" and it earns it as a celebration moment.
- **Exit durations are roughly half of entry durations.** This is the
  most common gap in homegrown systems (and currently in Siren).
- **State layers** — pressed/hovered/focused — should be visible at
  ≥3% opacity over the base colour for AA contrast. Siren's
  `hover:bg-ink/5` and `active:bg-ink/10` (where they exist) meet
  this — but `active:` is missing in most places.

### Linear (web app, mobile-feel)

- Tap targets get an instant background shift + 1px translateY on
  press. Never scale (looks toy-ish on dense lists).
- Routing transitions are local-pending: the action that initiated
  the route swap gets a pending indicator inside it, not a global
  spinner. (Siren already does this — `ContinueToLineupButton`.)
- Keyboard shortcuts get a 60ms scale-down on the key glyph when
  fired. We don't have keyboard shortcuts in the in-game UI, so this
  doesn't apply, but the principle (the user's input gets echoed
  back instantly) is the same one driving the `active:` recommendations.

### Things 3 (Cultured Code) — the gold standard for list animations

- Items entering/leaving the list slide + fade in 220ms with a slight
  height-animate. The CSS technique is `grid-template-rows: 0fr → 1fr`
  + `overflow: hidden`.
- Reorder uses FLIP[^flip] — measure before, measure after, animate
  the delta. No library required.
- Long-press to drag pulses the row first, then lifts it (shadow +
  scale 1.02). Communicates "I've grabbed this" before motion starts.

### Stripe Dashboard mobile

- Numbers count up over ~250ms with `requestAnimationFrame`,
  `ease-out`. Used for revenue summaries — directly transferable to
  the score numerals.
- Confirmation states (✓) hold for 1.5s then fade. Siren's "Copied!"
  state on GameSummaryCard already does exactly this
  (`live/GameSummaryCard.tsx:213`).
- Error snackbars slide in from below, hold 4s, slide out — never
  cover the primary CTA.

### web.dev — perceived performance[^webdev-perf]

- **First feedback matters more than fast feedback.** A 50ms paint
  ack + a 2s server round-trip feels faster than 2050ms of nothing.
- **Optimistic UI** for low-stakes writes (availability toggle,
  swap apply) — paint the new state immediately, reconcile on
  return. Siren already does this in the live store (the score
  increments before the server event is durable).
- **Skeletons > spinners** when the content shape is known. Siren's
  `app/(app)/dashboard/loading.tsx` is a good example. Spinners are
  fine for unknown-shape loads (Continue-to-lineup, server-pending
  buttons).

### Cross-cutting principles

- **One curve, two-to-three durations.** Don't proliferate. The whole
  app should feel like it was animated by one person.
- **Animate the consequence, not the cause.** When a player is added
  to the lineup, animate the row arriving — not the button that
  triggered it.
- **Never animate something more than once per event.** The PulseRing
  is only ever needed for moments-that-just-happened. Looping
  animations are only for sustained states (LIVE indicator, kickoff
  window).

---

## 4. Prioritized implementation backlog

Priority key: **P0** = ship-changing or fixes broken behaviour; **P1**
= clear polish wins; **P2** = nice-to-have. Effort key: **XS** =
single class or single file 1-line change; **S** = one component edit;
**M** = small refactor + new primitive; **L** = cross-cutting sweep.

### P0 — ship-changing / fixing broken behaviour

| # | Item | Effort |
|---|---|---|
| P0-1 | Fix broken `PulseRing` animations | S |
| P0-2 | Add `active:` feedback to `SFButton` | XS |
| P0-3 | Add `active:` feedback to `Button` (legacy) | XS |
| P0-4 | Add modal slide-up to `Modal` | S |
| P0-5 | Add bottom-sheet slide-up to `SlotFillSheet` | S |
| P0-6 | Goal-scored halo + count-up on `ScoreBlock` | M |
| P0-7 | Haptics primitive `src/lib/haptics.ts` | M |

#### P0-1 — Fix broken `PulseRing` animations

- **Component:** `src/components/brand/PulseRing.tsx`,
  `tailwind.config.ts`
- **Interaction:** Add the missing `pulseRipple`,
  `pulseRippleBurst`, `pulseRippleSlow` keyframes and `animate-*`
  utilities to `tailwind.config.ts`. The component already
  references them via `motion-safe:animate-pulse-ripple-burst` etc.
  Without this, `KickoffPulseWrapper` is a no-op in production and
  the "alarm-orange pulse around Start Game during kickoff window"
  moment never fires.
- **Implementation sketch:** Append to the `keyframes` block in
  `tailwind.config.ts`:
  ```ts
  pulseRipple: {
    "0%":   { boxShadow: "0 0 0 0 var(--siren-pulse-from)", opacity: "1" },
    "100%": { boxShadow: "0 0 0 18px var(--siren-pulse-to)", opacity: "0" },
  },
  ```
  …and to `animation`:
  ```ts
  "pulse-ripple":       "pulseRipple 1.6s ease-out infinite",
  "pulse-ripple-slow":  "pulseRipple 2.6s ease-out infinite",
  "pulse-ripple-burst": "pulseRipple 1.4s ease-out 3 forwards",
  ```
- **Risk:** The component renders an absolutely-positioned ring
  inside a `relative` wrapper with `bg-current`. Box-shadow
  approach is simpler and matches `siren-pulse`; if box-shadow on
  the inner ring doesn't clip cleanly through the rounded child,
  fall back to a scaled `<span>` (transform: scale + opacity).
  Test with `radius="full"` (kickoff CTA) and `radius="md"`.
  **Add a Playwright spec that asserts the ring is visible during
  the kickoff window** — this regressed silently and a test would
  have caught it.

#### P0-2 — `active:` on `SFButton`

- **Component:** `src/components/sf/SFButton.tsx:53-61`
- **Interaction:** Tap-down darkens the surface by one step. No
  scale (looks toy-ish; Linear / Stripe both avoid it on buttons).
- **Implementation sketch:** Add `active:bg-ink/95` to `primary`,
  `active:bg-brand-800` to `accent`, `active:bg-alarm/85` to `alarm`,
  `active:bg-hairline` to `ghost`/`subtle`, `active:bg-danger/10` to
  `danger`. Already on `transition-colors duration-fast` so the
  release back to base is animated for free.
- **Effort:** XS — single map edit.
- **Risk:** None — `transition-colors` already in place; reduced-
  motion is moot for an instant colour swap.

#### P0-3 — `active:` on legacy `Button`

- **Component:** `src/components/ui/Button.tsx:13-22`
- **Interaction:** Same as P0-2 but on the legacy four-variant
  button used in auth forms + settings + a few stragglers.
- **Implementation sketch:** Add `active:bg-brand-800` to `primary`,
  `active:bg-hairline` to `secondary`, `active:bg-ink/5` to `ghost`,
  `active:bg-danger/80` to `danger`.
- **Risk:** None.

#### P0-4 — `Modal` slide-up

- **Component:** `src/components/ui/Modal.tsx`
- **Interaction:** On mount the inner card slides up + fades in
  over 220ms. On unmount, no transition (the caller unmounts the
  modal subtree directly; CSS unmount transitions in React are
  hard without a state-machine — accept the snap-out for now and
  revisit if the snap reads badly).
- **Implementation sketch:** Add a new keyframe to
  `tailwind.config.ts`:
  ```ts
  sheetUp: {
    from: { transform: "translateY(8px)", opacity: "0" },
    to:   { transform: "translateY(0)",   opacity: "1" },
  },
  ```
  …and `"sheet-up": "sheetUp 220ms cubic-bezier(0.2, 0.8, 0.2, 1) both"`.
  Then on the inner card:
  ```tsx
  className="… motion-safe:animate-sheet-up"
  ```
  Backdrop also gets `motion-safe:animate-fade-in` (keyframe already
  exists, `tailwind.config.ts:141-144`).
- **Risk:** The Modal is used by both centered-on-desktop and
  bottom-sheet-feeling QuarterEndModal contents — the slide-up
  works in both. Reduced-motion users see the modal appear
  instantly via `motion-reduce` falling through. **Test
  StartQuarterModal, QuarterEndModal, SubDueModal, LockModal,
  WalkthroughModal, SwapConfirmDialog, InjuryReplacementModal,
  QuarterScoreModal.**

#### P0-5 — `SlotFillSheet` slide-up

- **Component:** `src/components/ui/SlotFillSheet.tsx:108-111`
- **Interaction:** On mobile (`items-end`), sheet slides up from
  the bottom edge. On desktop (`items-center`), it fades + scales
  in over 200ms (Stripe pattern).
- **Implementation sketch:**
  ```ts
  // tailwind.config.ts — new keyframes
  sheetUpMobile: {
    from: { transform: "translateY(100%)" },
    to:   { transform: "translateY(0)" },
  },
  popIn: {
    from: { transform: "scale(0.96)", opacity: "0" },
    to:   { transform: "scale(1)",    opacity: "1" },
  },
  ```
  ```tsx
  // SlotFillSheet.tsx — inner div
  <div className="… motion-safe:animate-[sheetUpMobile_240ms_cubic-bezier(0.2,0.8,0.2,1)_both] sm:motion-safe:animate-[popIn_200ms_cubic-bezier(0.2,0.8,0.2,1)_both]" />
  ```
- **Risk:** The picker is used inside `QuarterEndModal` (z-60
  picker over z-50 modal). The slide-up must not animate the
  outer backdrop — only the inner card. Already correctly
  scoped to `.stopPropagation()` so structurally fine.

#### P0-6 — Goal-scored halo on `ScoreBlock`

- **Component:** New `live/ScoreBlockPulse.tsx`, used by
  `GameHeader.tsx` and `netball/NetballLiveGame.tsx`'s scorebug
- **Interaction:** When the team's `teamScore.goals` increments,
  the goals digit briefly halos with `SirenPulseHalo size="md"`,
  and the digit animates from old → new via a 200ms count-up.
  Opponent score behaves the same when ticked manually.
- **Implementation sketch:** Wrap `<ScoreBlock />` in
  `<SirenPulseHalo triggerKey={teamScore.goals + teamScore.behinds}>`.
  For the count-up, a tiny helper:
  ```tsx
  function useCountUp(target: number, ms = 200): number {
    const [v, setV] = useState(target);
    const startRef = useRef<number | null>(null);
    const fromRef = useRef(target);
    useEffect(() => {
      if (v === target) return;
      fromRef.current = v;
      startRef.current = null;
      let raf = 0;
      const tick = (t: number) => {
        if (startRef.current === null) startRef.current = t;
        const k = Math.min(1, (t - startRef.current) / ms);
        const eased = 1 - Math.pow(1 - k, 3); // cubic-out
        setV(Math.round(fromRef.current + (target - fromRef.current) * eased));
        if (k < 1) raf = requestAnimationFrame(tick);
      };
      raf = requestAnimationFrame(tick);
      return () => cancelAnimationFrame(raf);
    }, [target, ms]); // eslint-disable-line react-hooks/exhaustive-deps
    if (typeof window !== "undefined" &&
        window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      return target;
    }
    return v;
  }
  ```
- **Risk:** Reduced-motion path returns `target` directly so the
  number snaps. The halo wrapper already disables under reduced
  motion. **The score must remain correct even mid-animation** —
  the displayed value lags by ≤200ms behind the source of truth, but
  the source of truth (the live store) is the only thing read by
  any sharing/snapshotting code, so this is fine. Keep an eye on
  rapid scoring (two goals within 250ms) — the count-up should
  retarget cleanly; the implementation above does this by
  re-reading `target` on every effect run.
- **Bonus:** A 1-frame `text-alarm` flash on the digit at the
  start of the count-up reinforces the brand moment. Wire as
  `style={{ color: flashOn ? "#D9442D" : undefined }}` with a 120ms
  timeout reset.

#### P0-7 — Haptics primitive

- **Component:** New `src/lib/haptics.ts`. Refactor
  `LiveGame.tsx:695, 1075, 1133` to use it.
- **Interaction:** Web + native unified haptics. On Capacitor iOS,
  uses the Taptic Engine via `@capacitor/haptics`. On web/Android
  with vibration API, falls through to `navigator.vibrate`. On
  iOS Safari (no Taptic, no vibration), silently no-ops.
- **Implementation sketch:**
  ```ts
  // src/lib/haptics.ts
  import { isNative } from "@/lib/platform";

  type Style = "light" | "medium" | "heavy";

  // Lazy import — only paid for if we're native AND user fires haptic.
  let hapticsModule: typeof import("@capacitor/haptics") | null = null;

  async function getHaptics() {
    if (!isNative()) return null;
    if (hapticsModule) return hapticsModule;
    try {
      hapticsModule = await import("@capacitor/haptics");
      return hapticsModule;
    } catch {
      return null;
    }
  }

  function isTouchDevice(): boolean {
    if (typeof window === "undefined") return false;
    return window.matchMedia("(hover: none)").matches;
  }

  export async function hapticTap(style: Style = "light") {
    if (!isTouchDevice()) return;
    const hap = await getHaptics();
    if (hap) {
      const map = {
        light:  hap.ImpactStyle.Light,
        medium: hap.ImpactStyle.Medium,
        heavy:  hap.ImpactStyle.Heavy,
      } as const;
      await hap.Haptics.impact({ style: map[style] });
      return;
    }
    // Web fallback — Android Chrome supports this; iOS Safari does not.
    navigator.vibrate?.(style === "heavy" ? 60 : style === "medium" ? 30 : 15);
  }

  export async function hapticSiren() {
    if (!isTouchDevice()) return;
    const hap = await getHaptics();
    if (hap) {
      await hap.Haptics.notification({ type: hap.NotificationType.Warning });
      return;
    }
    navigator.vibrate?.([200, 100, 200]);
  }
  ```
- **Add dependency:** `"@capacitor/haptics": "^8.0.1"` in
  `package.json`. The cost is ~6KB gzipped on native; the lazy
  dynamic import means web users pay zero (the file isn't bundled
  on web).
- **Risk:** Dynamic import inside a Capacitor WebView must resolve
  against the bundled `node_modules` copy — confirm
  `copy-capacitor-bridge.mjs` (project's postinstall) covers
  `@capacitor/haptics`. If not, ship the import statically guarded
  by `if (isNative())` instead.
- **Use exactly these seven actions (and no others):**
  swap-applied (`light`), sub-due-modal-open (`heavy`),
  quarter-end-hooter (`siren`), full-time (`siren`),
  start-quarter-confirmed (`medium`), score-recorded (`light`),
  long-press-pickup (`light`). Overuse = annoyance.

---

### P1 — clear polish wins

| # | Item | Effort |
|---|---|---|
| P1-1 | `active:scale-[0.97]` on `PlayerTile` | XS |
| P1-2 | Row-flash on `AvailabilityRow` after toggle | S |
| P1-3 | List-add slide-in for `LateArrivalMenu` | S |
| P1-4 | List-remove fade-out on `FillInRow` delete | S |
| P1-5 | `Input` error-border transition | XS |
| P1-6 | Toast slide-in for swap-applied | S |
| P1-7 | Quarter-end pulse on player tiles involved in pending swaps | S |
| P1-8 | Page-transition acknowledgement on `TeamTabBar` | M |
| P1-9 | `PlayerTile` long-press visual pre-cue | S |
| P1-10 | Haptics wired to seven actions | S |
| P1-11 | Score `+G`/`+B` chip ripple | XS |
| P1-12 | `SubDueModal` arrival timing tuned to clock-pulse halo | S |
| P1-13 | "Copied!" success state on share buttons | XS |
| P1-14 | Sticky-bottom-bar fade-in when score panel opens | S |
| P1-15 | Form-submit pending state on auth forms | S |

#### P1-1 — `active:scale-[0.97]` on `PlayerTile`

- **Component:** `src/components/live/PlayerTile.tsx:143-150`
- **Interaction:** Tap-down briefly shrinks the tile to 97%. Released
  state springs back via the existing
  `transition-all duration-fast ease-out-quart`.
- **Implementation sketch:** Add `active:scale-[0.97]` to the
  className. Already has `transition-all`, so release is animated.
- **Risk:** Scale on grid items can cause neighbouring tile
  layout-shifts if the transform origin is wrong. Default
  `transform-origin: center` is correct here — verified by visual
  inspection of the field grid (5×4 tiles, fixed cell size).
  Reduced-motion users skip via `motion-safe:` modifier — wrap as
  `motion-safe:active:scale-[0.97]`.

#### P1-2 — Row-flash on `AvailabilityRow`

- **Component:** `src/components/games/AvailabilityRow.tsx:79-117`
- **Interaction:** After `setAvailability` resolves, briefly flash
  the row's background `bg-ok/10` (going-available) or
  `bg-surface-alt` (going-unavailable) for 400ms, then fade back.
- **Implementation sketch:** Maintain a `flashKey` state that
  increments on completed transitions; render an absolute
  `motion-safe:animate-[bgFlash_400ms_ease-out_both]` overlay
  keyed off `flashKey` so it remounts and reruns each time.
  Add `bgFlash` keyframe:
  ```ts
  bgFlash: {
    "0%":   { opacity: "0.15" },
    "100%": { opacity: "0" },
  },
  ```
- **Risk:** `useTransition` resolves on the action return, but the
  pill's visual state changes via revalidation. If the revalidation
  lags the flash will fire before the pill updates; the row would
  briefly show "Available" + green flash + still-old "Unavailable"
  pill. Solution: render the flash inside an `useEffect` that
  watches `status` change, NOT the `isPending` transition end.

#### P1-3 — List-add slide-in for `LateArrivalMenu`

- **Component:** `src/components/live/LateArrivalMenu.tsx` (and any
  list that gains rows mid-game)
- **Interaction:** New row slides in from the right (50px) +
  fades in (220ms `ease-out-quart`). Brief brand halo on the row
  via `SirenPulseHalo` keyed off the player id.
- **Implementation sketch:** Each row gets
  `motion-safe:animate-[slideInRight_220ms_cubic-bezier(0.2,0.8,0.2,1)_both]`
  with `slideInRight` keyframe `{ from: { transform: translateX(50px), opacity: 0 }, to: { transform: translateX(0), opacity: 1 } }`.
  To make it fire only on *new* rows (not on initial mount), use a
  `useRef<Set<string>>` of "seen" ids and only attach the animation
  class when the id is new. Or simpler: animate every row, then
  on mount of the list set a flag that strips the animation class.
- **Risk:** First-render animation looks chaotic when 4 fill-ins
  appear at once. Use the "seen" set approach.

#### P1-4 — List-remove fade-out on `FillInRow` delete

- **Component:** `src/components/games/FillInRow.tsx`
- **Interaction:** On delete confirmation, the row fades + collapses
  height to 0 over 200ms before unmounting. CSS-only via the
  `grid-template-rows: 0fr → 1fr` trick.
- **Implementation sketch:** Wrap the row content in
  `<div className="grid transition-[grid-template-rows] duration-base ease-out-quart" style={{ gridTemplateRows: removing ? "0fr" : "1fr" }}>`,
  inner `<div className="overflow-hidden">`. Maintain
  `removing` state, set true → wait 200ms → call the actual
  deletion. Reduced-motion: call deletion immediately.
- **Risk:** Server action might fail mid-animation; reset
  `removing` on error.

#### P1-5 — `Input` error-border transition

- **Component:** `src/components/ui/Input.tsx:11-23`
- **Interaction:** Border colour transition from hairline → danger
  takes 200ms instead of being instant. Error text below fades in.
- **Implementation sketch:** Add `transition-[border-color,box-shadow] duration-base ease-out-quart`
  to the input className. Error `<p>` gets
  `motion-safe:animate-fade-in` (keyframe already in config at
  `tailwind.config.ts:141-144`).
- **Risk:** None.

#### P1-6 — Toast slide-in for swap-applied

- **Component:** Wherever `swapToast` is rendered (search for the
  consumer of `LiveGame.tsx:689-697`)
- **Interaction:** Toast appears with `slideInBottom` (40px → 0,
  220ms). After 2.5s, exits with the reverse over 160ms.
- **Implementation sketch:** Same pattern as the FT GameSummaryCard
  uses `animate-slide-up`. Add a shorter variant:
  `slideInBottom: { from: { transform: translateY(40px), opacity: 0 }, to: { transform: translateY(0), opacity: 1 } }`.
  Toast renders with `motion-safe:animate-[slideInBottom_220ms_cubic-bezier(0.2,0.8,0.2,1)_both]`.
- **Risk:** Exit animation needs the toast to stay mounted during
  the exit — easiest via a `closing` state that fires the exit
  animation, then unmounts after 160ms. If skipping the exit is
  acceptable (toast just blinks out), this is XS instead of S.

#### P1-7 — Quarter-end pulse on pending-swap player tiles

- **Component:** `src/components/live/PlayerTile.tsx`
  (pass a new `pulseKey` prop), driven by `LiveGame.tsx`
- **Interaction:** When the quarter-end modal opens with a swap
  plan, the OFF and ON tiles each pulse once with the brand halo.
  Communicates "these are the people who will move".
- **Implementation sketch:** Wrap the tile in `<SirenPulseHalo>`
  when `swap` is set. `triggerKey={swap?.pair ?? null}`.
  `display="inline-block"` so the halo follows the tile's rounded
  rectangle.
- **Risk:** Layout shifts if the wrapper introduces inline-block
  geometry mismatched with the tile's flex behaviour. `SirenPulseHalo`'s
  `display="inline-block"` is documented to wrap the child without
  introducing its own box — verify against the field grid which
  uses `grid` not `flex` for tile placement.

#### P1-8 — Page-transition acknowledgement on `TeamTabBar`

- **Component:** `src/components/sf/SegTabs.tsx` (parent of
  TeamTabBar)
- **Interaction:** Tapping a tab puts that tab into a 120ms pending
  pulse (the segment background tints briefly) before the route
  resolves. Pure visual — doesn't depend on actual navigation
  completing.
- **Implementation sketch:** Wrap the Link in a `useTransition`
  pattern: intercept the click, `startTransition` + `router.push`,
  pulse `isPending`. Same pattern as `ContinueToLineupButton`.
- **Risk:** Effort is M not S because the tab bar's selection logic
  is parent-driven via `usePathname` — adding a pending state needs
  a tap-state superimposed on the path-derived state. Defer if it
  conflicts with the existing SF treatment of the active tab.

#### P1-9 — `PlayerTile` long-press visual pre-cue

- **Component:** `src/components/live/PlayerTile.tsx:61-89`
- **Interaction:** At 300ms into a long-press (the 500ms total is
  too long to wait with no feedback), the tile starts a soft brand
  ring pulse so the user knows the long-press is registering.
  At 500ms the `onLongPress` fires — they can release.
- **Implementation sketch:** Add a second timer at 300ms that sets
  a state `longPressArming = true`. Tile className includes
  `${longPressArming ? 'ring-2 ring-brand-300 ring-offset-1' : ''}`.
  Reset on release/cancel.
- **Risk:** Already a complex pointer handler — adding a second
  timer needs a matching clearTimeout in every cancel path. Audit
  the existing handler carefully.

#### P1-10 — Haptics wired to seven actions

- **Component:** `LiveGame.tsx`, `NetballLiveGame.tsx`,
  `QuarterBreak.tsx`, `LineupPicker.tsx`, `PlayerTile.tsx`
- **Interaction:** Replace the 3 `navigator.vibrate` call sites with
  `hapticTap("light")` / `hapticSiren()`. Add:
  - score recorded → `hapticTap("light")` in `recordPlayerScore`
  - start-quarter confirmed → `hapticTap("medium")` on the modal's
    primary action
  - long-press pickup (after the 300ms pre-cue fires) →
    `hapticTap("light")`
  - full-time → `hapticSiren()` when `finalised` flips true
- **Risk:** Adding haptics to score-recorded means a tap-tap-tap
  scoring burst gives three quick haptics. Test on-device — if too
  busy, gate the score haptic to goals only (not behinds).

#### P1-11 — Score `+G`/`+B` chip ripple

- **Component:** `src/components/live/GameHeader.tsx` (the team /
  opponent score chips)
- **Interaction:** Tapping `+G` or `+B` plays a one-frame
  `bg-warm/30` overlay flash on the chip — confirms the tap reached
  the player-picker even before the picker opens.
- **Implementation sketch:** `relative` on chip, `<span absolute inset-0 bg-warm/30 opacity-0 active:opacity-100 transition-opacity duration-75>`.
- **Risk:** None.

#### P1-12 — `SubDueModal` arrival aligned to clock pulse

- **Component:** `src/components/live/LiveGame.tsx:1060-1082`,
  `SubDueModal.tsx`
- **Interaction:** Currently `playBeep()` + `setSubModalOpen(true)`
  + `navigator.vibrate` happen on the same tick. The clock pill
  also pulses. Reorder so the pulse + beep land first (frame 0)
  and the modal slides in at frame 8 (~130ms later) so the user's
  attention is drawn to the clock first, then the modal arrives.
- **Implementation sketch:** Wrap `setSubModalOpen(true)` in
  `setTimeout(() => setSubModalOpen(true), 130)`. Add cancellation
  on cleanup. Net latency to user action is unchanged because the
  modal still opens within their reaction time.
- **Risk:** Already complex picker-race guards in this effect —
  the 130ms delay must not introduce a new race. The cleanup
  path needs to clear the new timer.

#### P1-13 — "Copied!" success on share buttons

- **Component:** `src/components/live/GameSummaryCard.tsx:213` —
  already does this. Extend to `ShareRunnerLink.tsx`.
- **Interaction:** Same "✓ Copied!" → fade back to label after
  2.5s. Already a proven pattern.
- **Implementation sketch:** Lift the `copied` state +
  `setTimeout(() => setCopied(false), 2500)` pattern into a tiny
  `useCopyState` hook for reuse.
- **Risk:** None.

#### P1-14 — Sticky-bottom-bar fade-in when score panel opens

- **Component:** `LiveGame.tsx` score-record panel (sticky bottom)
- **Interaction:** Panel currently snap-mounts. Slide up 16px + fade
  in over 180ms.
- **Implementation sketch:**
  `motion-safe:animate-[slideInBottom_180ms_cubic-bezier(0.2,0.8,0.2,1)_both]`
  on the panel root.
- **Risk:** Coach is *time-pressured* — make sure the slide-in
  doesn't delay the panel's interactivity. CSS animations
  don't block input, so the buttons inside the panel respond
  from frame 1 even while the panel is mid-slide.

#### P1-15 — Form-submit pending state on auth forms

- **Component:** `src/components/auth/LoginForm.tsx`,
  `SignupForm.tsx`, `ForgotPasswordForm.tsx`
- **Interaction:** Submit button shows `PulseDot` + text swap during
  the server round-trip. Already the pattern for in-game buttons;
  needs to be applied to auth.
- **Implementation sketch:** Wrap the submit in `useTransition` or
  `useFormStatus` (Next 14 supports both). Show
  `loading={isPending}` on the existing `Button` (which already
  supports it — `Button.tsx:32-49`). Text swap:
  "Sign in" → "Signing in…".
- **Risk:** Auth errors need to clear pending — already handled by
  the form action's catch path.

---

### P2 — nice-to-have

| # | Item | Effort |
|---|---|---|
| P2-1 | Number count-up on `ScoreBlock` for opponent score too | XS |
| P2-2 | Subtle parallax on the marketing Hero (already exists, audit only) | XS |
| P2-3 | Pull-to-refresh on Games list (scoped exception to overscroll-contain) | M |
| P2-4 | `Guernsey` number rotate-flip when jersey changes (Stats edit) | S |
| P2-5 | LineupPicker FLIP reorder when zones reshuffle | M |
| P2-6 | Confetti / micro-celebration on Win at FT (no, see anti-patterns) | — |
| P2-7 | Walkthrough modal slide-from-side instead of fade | XS |
| P2-8 | `StatusPill` LIVE chip — slow steady pulse | XS |
| P2-9 | "Save plan & exit" rotate-out arrow icon on pending | XS |
| P2-10 | Reduced-motion preference exposed in Settings (override at app level) | M |

#### P2-1 — Count-up for opponent score

- Already covered by P0-6 if applied symmetrically. Effort: XS to
  extend.

#### P2-3 — Pull-to-refresh on Games list

- **Component:** `src/app/(app)/teams/[teamId]/games/page.tsx`
- **Interaction:** Pull from top → release → list refreshes. iOS
  spinner pattern.
- **Implementation sketch:** Scope the `html { overscroll-behavior-y: contain }`
  to NOT apply on the Games list route, OR — better — implement a
  custom pull-to-refresh component that captures the gesture
  itself and triggers `router.refresh()`. Pure CSS + pointer
  events. Lib not needed.
- **Risk:** Conflicts with the site-wide overscroll guard. The
  guard exists because PTR on a live game wipes work — so the
  exception must be **per-route**, not global. Use a layout-level
  toggle.

#### P2-5 — LineupPicker FLIP reorder

- **Component:** `src/components/live/LineupPicker.tsx`,
  `netball/LineupPicker.tsx`
- **Interaction:** When the fairness suggester re-runs and players
  move zones, the tiles animate to their new positions instead of
  snapping.
- **Implementation sketch:** FLIP[^flip] — before the data update,
  `getBoundingClientRect()` of each player tile, keyed by id; after
  the data update, measure again, set `transform: translate(dx, dy)`
  on each, then on the next frame remove the transform and let the
  `transition-transform duration-base ease-out-quart` carry it home.
  No library needed (~40 lines of code in a custom hook
  `useFlip<HTMLLIElement>(items, getKey)`).
- **Risk:** Tile contents change too (zone label, accent colour) —
  the animation should cover only position, not content. The
  re-rendered tile must keep the same React `key` for `useFlip` to
  match them up.
- **Effort:** M because it touches two pickers and needs a shared
  hook.

#### P2-7 — Walkthrough modal slide-from-side

- WalkthroughModal in `live/WalkthroughModal.tsx` could slide from
  the right on Next, left on Back — communicates direction.
  XS once the Modal slide primitive (P0-4) lands.

#### P2-8 — LIVE chip pulse

- **Component:** `src/components/sf/StatusPill.tsx` — the `live`
  variant
- **Interaction:** Slow steady pulse on the dot inside the chip.
- **Implementation sketch:** The dot inside the LIVE pill gets the
  existing `.siren-dot--pulsing` class. Pulse already brand-aware.
- **Risk:** Two LIVE pills on screen at once (Games list + sticky
  header) would visually compete. Render at most one — the design
  already does this since the Games list hides its row pill when
  the user is inside a live game.

#### P2-10 — In-app reduced-motion override

- Most users don't know iOS has a Reduce Motion setting. Add a
  toggle in `/teams/[teamId]/settings` that writes to localStorage
  and sets a `data-motion="reduce"` attribute on `<html>`. Every
  motion rule that respects `prefers-reduced-motion` also respects
  this attribute via a CSS selector.

---

## 5. Anti-patterns to avoid

Given the time-pressured sideline context:

- **No spring physics on the live game's score.** The number must
  read at a glance — a bouncy ease-out-elastic is unreadable for
  the 150ms it's mid-bounce.
- **No celebration animations >800ms on win.** A confetti burst,
  a flag wave, a "victory" sound — all read as gloating and the
  coach doesn't have time for them. The FT halo + slide-up
  GameSummaryCard is enough. Save big celebrations for the post-
  game review screen, never the live screen.
- **No decorative parallax.** The Hero parallax on the marketing
  surface is fine. Inside the app, parallax = visual noise.
- **No animation on the clock numerals.** The clock is read in
  0.2s; a count-up makes it unreadable. (Tabular-nums + instant
  text swap is correct, and already shipped.)
- **No looping spinners during normal operation.** Brand pulse is
  reserved for pending states. A looping spinner reads as "stuck".
- **No `>300ms` transitions inside the live game.** Hard ceiling.
- **No haptics on every tap.** Haptics are for moments-that-matter:
  the seven actions in P0-7 / P1-10. Tapping a player tile is not
  one of them — too many haptics per second feels broken.
- **No carousel transitions** on quarter-by-quarter score modal
  (already a list — keep it a list).
- **No skeleton on the live game.** The store hydrates from
  localStorage in <16ms. Skeletons would flash on every paint.
- **No animation on draw-and-drop** *unless* there's a drag-and-drop
  affordance — there isn't, the LineupPicker uses tap-to-place. Don't
  add drag-and-drop for animation's sake.
- **Don't replace `useTransition` button-local pending with a
  global loading bar.** The button-local pattern is the
  codebase's established signal; introducing a top-of-screen
  progress bar competes with it and makes the button feel passive.
- **No animation that hides server latency past 2s.** If the round-
  trip takes >2s, the user should see *what* is slow, not just a
  prettier wait. Pulse + text-swap is correct; a slow shimmer over
  the whole screen is wrong.

---

## 6. Suggested rollout sequence

### Week 1 — Foundation

Goal: lock in the missing primitives and `active:` everywhere so
the rest of the work can layer on top.

- **PR 1 (P0-1):** Fix `PulseRing` keyframes + add a Playwright
  spec asserting the kickoff ring is visible inside the window.
  Standalone — no other changes depend on it.
- **PR 2 (P0-2 + P0-3 + P1-1 + P1-11):** All the `active:` states
  in one sweep. Affects `SFButton`, `Button`, `PlayerTile`, score
  chips. Visual-regression risk is low; one big PR + one Playwright
  smoke test is enough.
- **PR 3 (P0-7):** Haptics primitive. Lands `src/lib/haptics.ts` +
  the `@capacitor/haptics` dependency. Refactor the 3 existing
  `navigator.vibrate` call sites to use it. Ship behind no flag —
  the web path is byte-identical to current behaviour.

### Week 2 — Sheets & moments

Goal: every modal slides in, every siren moment pulses.

- **PR 4 (P0-4):** `Modal` slide-up keyframe + className. Test all
  7 modals that use it.
- **PR 5 (P0-5):** `SlotFillSheet` slide-up. Test inside
  QuarterEndModal (the z-60 nested case).
- **PR 6 (P0-6):** `ScoreBlockPulse` — halo + count-up + flash. New
  component, used by AFL `GameHeader` and netball ScoreBug. Add a
  Playwright spec that records a goal and asserts the score halo
  renders.
- **PR 7 (P1-10):** Wire haptics into the seven actions. Manual
  test on iOS device required.

### Week 3 — List & list-row polish

Goal: every list acknowledges arrivals + departures; every form
behaves on its own.

- **PR 8 (P1-2):** Row-flash on AvailabilityRow.
- **PR 9 (P1-3 + P1-4):** Add/remove list animations on
  LateArrivalMenu + FillInRow.
- **PR 10 (P1-5 + P1-15):** Input transition + auth form pending
  states. Both touch the auth flow — single PR is reasonable.
- **PR 11 (P1-6 + P1-14):** Toast slide-in + sticky-bottom-bar
  slide-in. Both wire the same `slideInBottom` keyframe; ship
  together so they share the primitive.
- **PR 12 (P1-7 + P1-9 + P1-12):** Quarter-end tile pulse +
  long-press pre-cue + SubDueModal staggered open. All concentrated
  in `LiveGame.tsx` + `PlayerTile.tsx`, so single PR.

### Backlog (P2)

P2-3 (pull-to-refresh) is the only P2 worth scheduling — it's a
recurring small request and unlocks a "feels like a real app"
moment. The rest are pure polish; pick them up as the team has
appetite. P2-5 (FLIP reorder in LineupPicker) is high effort but
also high impact — if the team has a quiet sprint, this is the
single biggest "wow" moment available on the table.

---

## Quick reference — token glossary

| Token | Value | Use |
|---|---|---|
| `duration-fast` | 120ms | colour swaps, small state changes |
| `duration-base` | 200ms | sheet/modal entries, list adds, toasts |
| `duration-slow` | 320ms | hero entries, full-screen reveals |
| `ease-out-quart` | `cubic-bezier(0.2, 0.8, 0.2, 1)` | every motion in the app |
| `siren-pulse-once` | 1.4s `ease-out` `forwards` | one-shot halo on siren moments |
| `siren-pulse` | 1.5s `ease-out` infinite | wordmark dot + pending pulse |
| `PulseDot` | size sm/md/lg | inside buttons + suspense fallbacks |
| `SirenPulseHalo` | wrap, triggerKey | one-shot moments on any boxed element |

---

[^hig-motion]: [Motion — Apple Human Interface Guidelines](https://developer.apple.com/design/human-interface-guidelines/motion). Apple specifies 100-500ms as the typical duration band, and explicitly advises "prefer quick, precise animations" and "add motion purposefully".
[^hig-reduced]: [Reduced Motion evaluation criteria — Apple Developer](https://developer.apple.com/help/app-store-connect/manage-app-accessibility/reduced-motion-evaluation-criteria/). Required: motion must be minimised or eliminated when Reduce Motion is on.
[^m3-easing]: [Easing and duration — Material Design 3](https://m3.material.io/styles/motion/easing-and-duration/tokens-specs). Standard curve, deceleration curve, acceleration curve, sharp curve; durations scale with surface area and travel distance.
[^webdev-perf]: [Perceived performance — web.dev](https://web.dev/articles/rail). Tap feedback must appear within 100ms or users perceive lag; first paint matters more than total time.
[^flip]: [FLIP technique — Paul Lewis](https://aerotwist.com/blog/flip-your-animations/). First, Last, Invert, Play — measure before and after, animate the delta. Used here for the LineupPicker reorder; ~40 lines of vanilla JS, no library.
