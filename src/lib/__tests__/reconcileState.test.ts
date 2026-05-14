// Pure-state-machine coverage for useReconciledOnline's reconcile
// detector. The React hook wraps this with the actual useOnline +
// useWriteQueue subscriptions; testing the reducer directly lets
// us pin the state-transition matrix without standing up RTL or
// fake timers.
//
// Contract under test (P1.5-2 in MICRO-INTERACTIONS-PLAN.md):
//   - Reconcile fires only AFTER the device was dirty at least
//     once. Page first-loads while online with an empty queue
//     should NOT fire a halo.
//   - Reconcile requires sustained-clean for ≥2s (enforced by
//     caller's setTimeout; here we just verify the "start" timer
//     action fires at the right moment).
//   - Any dirty observation during the debounce window cancels
//     the in-flight timer.
//   - Repeated dirty observations don't re-issue "start" — only
//     the first clean-after-dirty does.

import { describe, expect, test } from "vitest";
import {
  reconcileStep,
  reconcileFire,
  type ReconcileState,
} from "../live/useReconciledOnline";

const rest: ReconcileState = { wasDirty: false, debouncePending: false };

describe("reconcileStep — state transitions", () => {
  test("first-mount clean stays at rest (no halo on page load)", () => {
    const r = reconcileStep(rest, false);
    expect(r.next).toEqual(rest);
    expect(r.timerAction).toBe("noop");
  });

  test("dirty observation flips wasDirty true", () => {
    const r = reconcileStep(rest, true);
    expect(r.next).toEqual({ wasDirty: true, debouncePending: false });
    expect(r.timerAction).toBe("noop");
  });

  test("dirty → still-dirty doesn't re-trigger anything", () => {
    const after = reconcileStep(rest, true).next;
    const r = reconcileStep(after, true);
    expect(r.next).toEqual(after);
    expect(r.timerAction).toBe("noop");
  });

  test("first clean after dirty starts the debounce timer", () => {
    const dirty = reconcileStep(rest, true).next;
    const r = reconcileStep(dirty, false);
    expect(r.next).toEqual({ wasDirty: true, debouncePending: true });
    expect(r.timerAction).toBe("start");
  });

  test("clean while already debouncing is a noop", () => {
    const debouncing = reconcileStep(
      reconcileStep(rest, true).next,
      false,
    ).next;
    const r = reconcileStep(debouncing, false);
    expect(r.next).toEqual(debouncing);
    expect(r.timerAction).toBe("noop");
  });

  test("dirty observation DURING debounce cancels the timer", () => {
    const debouncing = reconcileStep(
      reconcileStep(rest, true).next,
      false,
    ).next;
    const r = reconcileStep(debouncing, true);
    // Back to dirty-without-pending — debounce must restart from
    // scratch when the next clean observation lands.
    expect(r.next).toEqual({ wasDirty: true, debouncePending: false });
    expect(r.timerAction).toBe("cancel");
  });

  test("flapping (dirty→clean→dirty→clean) restarts debounce twice", () => {
    let s = rest;
    s = reconcileStep(s, true).next;       // dirty
    let r = reconcileStep(s, false);       // clean → start
    expect(r.timerAction).toBe("start");
    s = r.next;
    r = reconcileStep(s, true);            // dirty → cancel
    expect(r.timerAction).toBe("cancel");
    s = r.next;
    r = reconcileStep(s, false);           // clean → start
    expect(r.timerAction).toBe("start");
    expect(r.next).toEqual({ wasDirty: true, debouncePending: true });
  });
});

describe("reconcileFire — debounce-elapsed reset", () => {
  test("returns to rest after a successful reconcile", () => {
    const debouncing: ReconcileState = {
      wasDirty: true,
      debouncePending: true,
    };
    expect(reconcileFire(debouncing)).toEqual(rest);
  });

  test("from rest, fire collapses to rest (defensive)", () => {
    expect(reconcileFire(rest)).toEqual(rest);
  });
});
