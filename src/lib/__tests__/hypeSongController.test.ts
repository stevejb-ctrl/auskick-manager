// AUDIO-01 / B3 (plan 13-01) — RED-FIRST.
//
// `reduceSongArm` is the SHARED, framework-free re-arm controller behind the
// hype-song fix. The hype song goes silent after Q1 on iOS because the audio
// session is suspended at a period transition / backgrounding and the hook
// never re-arms it. This pure reducer decides, given the current arm state
// and a lifecycle event, whether the hook should just play, re-arm first then
// play, eagerly re-arm, or do nothing — so the decision is unit-testable in
// the existing node Vitest env (the repo has no jsdom / renderHook).
//
// Locked contract (13-CONTEXT.md):
//   D-02 states idle | ready | suspended; events ready | play | hidden |
//        visible | playSucceeded | playFailed; actions none | play |
//        rearm-then-play | rearm.
//   D-06 the post-Q1 silence is: a `play` while `suspended` must re-arm
//        (rearm-then-play), NOT no-op. A rejected play (`playFailed`) marks
//        the session suspended so the NEXT play re-arms.
//
// These tests are RED until Task 2 implements `reduceSongArm`.

import { describe, expect, it } from "vitest";
import {
  reduceSongArm,
  type SongArmState,
  type SongArmEvent,
} from "@/lib/live/hypeSongController";

describe("reduceSongArm — re-arm controller (AUDIO-01)", () => {
  describe("the post-Q1-on-iOS silence fix", () => {
    it("re-arms instead of no-op'ing when a goal fires while suspended", () => {
      // This is the bug: after iOS suspends the session, a later-period goal
      // must RE-ARM the backend and play — not silently no-op.
      const next = reduceSongArm("suspended", "play");
      expect(next.action).toBe("rearm-then-play");
      expect(next.state).toBe("ready");
    });
  });

  describe("happy path", () => {
    it("idle + ready -> ready / none (backend finished init)", () => {
      expect(reduceSongArm("idle", "ready")).toEqual({
        state: "ready",
        action: "none",
      });
    });

    it("ready + play -> ready / play (normal goal, session live)", () => {
      expect(reduceSongArm("ready", "play")).toEqual({
        state: "ready",
        action: "play",
      });
    });

    it("idle + play -> idle / play (first goal before a ready signal still attempts)", () => {
      // The direct-audio fallback has no onReady; a first play from idle still
      // attempts (the backend guards), and stays idle until it succeeds.
      expect(reduceSongArm("idle", "play")).toEqual({
        state: "idle",
        action: "play",
      });
    });
  });

  describe("suspension + re-arm transitions", () => {
    it("ready + hidden -> suspended / none (OS suspends on backgrounding)", () => {
      expect(reduceSongArm("ready", "hidden")).toEqual({
        state: "suspended",
        action: "none",
      });
    });

    it("suspended + visible -> ready / rearm (eager re-arm on foreground, no play)", () => {
      const next = reduceSongArm("suspended", "visible");
      expect(next.action).toBe("rearm");
      expect(next.state).toBe("ready");
    });

    it("ready + playFailed -> suspended / none (a rejected play means the session went suspended)", () => {
      expect(reduceSongArm("ready", "playFailed")).toEqual({
        state: "suspended",
        action: "none",
      });
    });

    it("any state + playSucceeded -> ready / none (a successful play proves the session is live)", () => {
      for (const s of ["idle", "ready", "suspended"] as SongArmState[]) {
        expect(reduceSongArm(s, "playSucceeded")).toEqual({
          state: "ready",
          action: "none",
        });
      }
    });

    it("eager re-arm on foreground never auto-plays (action is rearm, never play)", () => {
      expect(reduceSongArm("suspended", "visible").action).not.toBe("play");
      expect(reduceSongArm("suspended", "visible").action).not.toBe(
        "rearm-then-play",
      );
    });
  });

  describe("full lifecycle cycles", () => {
    // Helper: fold a sequence of events through the reducer.
    function run(
      start: SongArmState,
      events: SongArmEvent[],
    ): Array<{ state: SongArmState; action: string }> {
      let state = start;
      const steps: Array<{ state: SongArmState; action: string }> = [];
      for (const ev of events) {
        const next = reduceSongArm(state, ev);
        state = next.state;
        steps.push(next);
      }
      return steps;
    }

    it("Q1 plays, session suspends on background, Q2 goal re-arms-then-plays", () => {
      // ready -> play(play) -> playSucceeded -> hidden(suspend) -> play(rearm-then-play)
      const steps = run("ready", [
        "play",
        "playSucceeded",
        "hidden",
        "play",
      ]);
      expect(steps[0].action).toBe("play"); // Q1 goal
      expect(steps[2].state).toBe("suspended"); // backgrounded
      expect(steps[3].action).toBe("rearm-then-play"); // Q2 goal — the fix
      expect(steps[3].state).toBe("ready");
    });

    it("returning to foreground re-arms eagerly, then the next goal just plays", () => {
      // ready -> hidden(suspend) -> visible(rearm) -> play(play)
      const steps = run("ready", ["hidden", "visible", "play"]);
      expect(steps[0].state).toBe("suspended");
      expect(steps[1].action).toBe("rearm");
      expect(steps[1].state).toBe("ready");
      expect(steps[2].action).toBe("play"); // already re-armed -> plain play
    });

    it("a failed play flags suspension so the following goal re-arms", () => {
      // ready -> play(play) -> playFailed(suspend) -> play(rearm-then-play)
      const steps = run("ready", ["play", "playFailed", "play"]);
      expect(steps[1].state).toBe("suspended");
      expect(steps[2].action).toBe("rearm-then-play");
    });
  });

  describe("purity / determinism", () => {
    it("is deterministic — same inputs yield deep-equal outputs", () => {
      const states: SongArmState[] = ["idle", "ready", "suspended"];
      const events: SongArmEvent[] = [
        "ready",
        "play",
        "hidden",
        "visible",
        "playSucceeded",
        "playFailed",
      ];
      for (const s of states) {
        for (const e of events) {
          expect(reduceSongArm(s, e)).toEqual(reduceSongArm(s, e));
        }
      }
    });

    it("always returns a valid state + action for every (state, event) pair (total function)", () => {
      const states: SongArmState[] = ["idle", "ready", "suspended"];
      const events: SongArmEvent[] = [
        "ready",
        "play",
        "hidden",
        "visible",
        "playSucceeded",
        "playFailed",
      ];
      const validStates = new Set(states);
      const validActions = new Set(["none", "play", "rearm-then-play", "rearm"]);
      for (const s of states) {
        for (const e of events) {
          const next = reduceSongArm(s, e);
          expect(validStates.has(next.state)).toBe(true);
          expect(validActions.has(next.action)).toBe(true);
        }
      }
    });
  });
});
