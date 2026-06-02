// ─── hypeSongController ───────────────────────────────────────
// AUDIO-01 / B3 — the pure re-arm controller behind the hype-song fix.
//
// Background: on iOS the audio session is suspended when the app is
// backgrounded or at a period transition. The hype song plays in Q1
// then goes silent for the rest of the game because the hook never
// re-arms the suspended element/context — and the resulting play
// rejection is swallowed, so nothing surfaces.
//
// This module owns ONLY the decision "given the current arm state and
// a lifecycle event, what should the hook do?" — extracted out of the
// React effect so it can be unit-tested in the existing node Vitest
// env (the repo has no jsdom / @testing-library / renderHook). The
// hook (`useHypeSong`) is a thin adapter that wires real DOM / YT /
// Audio calls to the actions this reducer returns.
//
// Pure: no React, no DOM, no Supabase — same input always yields the
// same output, and it never mutates its arguments.

/** Where the audio session currently stands. */
export type SongArmState =
  /** Nothing has played yet / backend not confirmed ready. */
  | "idle"
  /** Armed and audible — a play should just work. */
  | "ready"
  /** The OS suspended the session — must re-arm before the next play. */
  | "suspended";

/** A lifecycle signal dispatched into the controller by the hook. */
export type SongArmEvent =
  /** The backend finished initialising (e.g. YT onReady). */
  | "ready"
  /** A goal fired — the caller wants the song to play. */
  | "play"
  /**
   * A user gesture (Start-Q1 tap) is available to UNLOCK playback —
   * wake the backend silently so the first goal-triggered play is
   * allowed by the browser's autoplay policy. Never makes noise.
   */
  | "prime"
  /** The page was backgrounded (document.hidden -> true). */
  | "hidden"
  /** The page returned to the foreground (document.hidden -> false). */
  | "visible"
  /** A play attempt resolved — the session is live. */
  | "playSucceeded"
  /** A play attempt rejected — the session is (likely) suspended. */
  | "playFailed";

/** What the hook should physically do as a result. */
export type SongArmAction =
  /** Do nothing. */
  | "none"
  /** Play the song as-is (session is live). */
  | "play"
  /** Re-arm the backend (wake YT / recreate the Audio element) then play. */
  | "rearm-then-play"
  /** Re-arm the backend eagerly without playing (foreground recovery). */
  | "rearm"
  /** Silently unlock the backend inside a user gesture (no audible play). */
  | "prime";

export interface SongArmResult {
  state: SongArmState;
  action: SongArmAction;
}

/**
 * Decide the next arm state + the action to perform for a (state, event)
 * pair. Total and pure — every combination returns a valid result and no
 * input is mutated.
 *
 * The core fix: a `play` while `suspended` returns `rearm-then-play` (re-arm
 * the backend, then play) rather than a silent no-op — this is the
 * post-Q1-on-iOS case. A rejected play (`playFailed`) flips the session to
 * `suspended` so the *following* play re-arms.
 */
export function reduceSongArm(
  state: SongArmState,
  event: SongArmEvent,
): SongArmResult {
  switch (event) {
    case "ready":
      // Backend init only matters from idle; never clears a suspension.
      return state === "idle"
        ? { state: "ready", action: "none" }
        : { state, action: "none" };

    case "play":
      // Suspended -> re-arm then play (the fix). Otherwise play as-is;
      // a first play from idle still attempts (the backend guards readiness).
      return state === "suspended"
        ? { state: "ready", action: "rearm-then-play" }
        : { state, action: "play" };

    case "prime":
      // A user gesture is unlocking playback. Wake the backend silently
      // from any state so the first goal-triggered play is allowed; mark
      // the session ready (a real play later still re-arms if it fails).
      return { state: "ready", action: "prime" };

    case "hidden":
      // The OS may suspend the audio session whenever we lose foreground.
      return { state: "suspended", action: "none" };

    case "visible":
      // Eager recovery: re-arm on the way back, but never auto-play.
      return state === "suspended"
        ? { state: "ready", action: "rearm" }
        : { state, action: "none" };

    case "playFailed":
      // A rejected play is our signal the session went suspended; the next
      // play must re-arm.
      return { state: "suspended", action: "none" };

    case "playSucceeded":
      // A successful play proves the session is live.
      return { state: "ready", action: "none" };

    default:
      // Unreachable for the typed union; a safe no-op keeps the reducer total.
      return { state, action: "none" };
  }
}
