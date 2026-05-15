// Slice 5 phase 5d coverage, updated for perf phase 4b (per-kind
// lanes). The queue is the layer between optimistic local state
// (the zustand liveGameStore) and durable server-side events.
//
// New contract (phase 4b):
//   - Ops of the SAME kind drain serially in FIFO order. A failure
//     in that kind pauses just that lane.
//   - Ops of DIFFERENT kinds drain in parallel (1 lane per kind).
//     A failure in one kind does NOT block other kinds.
//   - resume() clears all paused lanes — called on network-online
//     and when a previously-missing handler is registered.
//
// Vitest runs in Node so window is undefined — that's fine; the
// queue's persist storage falls through to its in-memory Map and
// the network-listener init is skipped under typeof window
// !== "undefined".

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  clearActionHandlers,
  registerActionHandler,
  useWriteQueue,
  type ActionResult,
} from "@/lib/live/writeQueue";

describe("writeQueue", () => {
  beforeEach(() => {
    // Reset module-level state before each test. Zustand stores
    // are singletons that survive across tests in the same file.
    useWriteQueue.getState().clearQueue();
    clearActionHandlers();
  });

  afterEach(() => {
    useWriteQueue.getState().clearQueue();
    clearActionHandlers();
  });

  it("appends an op on enqueue and pops it after a successful drain", async () => {
    const handler = vi.fn(async (): Promise<ActionResult> => ({ success: true }));
    registerActionHandler("noop", handler);

    useWriteQueue.getState().enqueue("noop", ["arg1", 42]);
    // enqueue triggers a drain internally; wait for it to settle.
    await flushMicrotasks();

    expect(handler).toHaveBeenCalledTimes(1);
    expect(useWriteQueue.getState().queue).toEqual([]);
  });

  it("passes the idempotency key as the final argument to the handler", async () => {
    let receivedKey: string | undefined;
    const handler = vi.fn(async (...args: unknown[]): Promise<ActionResult> => {
      receivedKey = args[args.length - 1] as string;
      return { success: true };
    });
    registerActionHandler("recordsKey", handler);

    const { id } = useWriteQueue.getState().enqueue("recordsKey", ["a", "b"]);
    await flushMicrotasks();

    expect(handler).toHaveBeenCalledWith("a", "b", id);
    // UUID v4 shape: 8-4-4-4-12 hex, version nibble = 4.
    expect(receivedKey).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
    expect(receivedKey).toBe(id);
  });

  it("resolves the flushed promise after a successful drain", async () => {
    const handler = vi.fn(async (): Promise<ActionResult> => ({ success: true }));
    registerActionHandler("noop2", handler);

    const { flushed } = useWriteQueue.getState().enqueue("noop2", []);
    // Race a 500ms timeout against the flushed promise: if drain
    // doesn't resolve us we'd time out, not finish in <1ms.
    const winner = await Promise.race([
      flushed.then(() => "flushed"),
      new Promise<string>((r) => setTimeout(() => r("timeout"), 500)),
    ]);
    expect(winner).toBe("flushed");
    expect(useWriteQueue.getState().queue).toEqual([]);
  });

  it("flushed promise stays pending while the lane is paused, then resolves after resume() + drain()", async () => {
    let shouldFail = true;
    registerActionHandler("flaky", async (): Promise<ActionResult> => {
      if (shouldFail) return { success: false, error: "transient" };
      return { success: true };
    });

    const { flushed } = useWriteQueue.getState().enqueue("flaky", []);
    await flushMicrotasks();
    // After the failed drain the op is still in the queue and the
    // promise hasn't resolved. The "flaky" lane is paused.
    expect(useWriteQueue.getState().queue).toHaveLength(1);
    expect(useWriteQueue.getState().pausedKinds).toContain("flaky");
    let resolved = false;
    void flushed.then(() => {
      resolved = true;
    });
    await flushMicrotasks();
    expect(resolved).toBe(false);

    // Network "comes back" — resume + drain succeeds, promise resolves.
    shouldFail = false;
    useWriteQueue.getState().resume();
    await useWriteQueue.getState().drain();
    await flushMicrotasks();
    expect(resolved).toBe(true);
  });

  it("leaves a failed op at its position with attemptCount bumped and lastError set", async () => {
    const handler = vi.fn(
      async (): Promise<ActionResult> => ({ success: false, error: "boom" }),
    );
    registerActionHandler("alwaysFails", handler);

    useWriteQueue.getState().enqueue("alwaysFails", []);
    await flushMicrotasks();

    const queue = useWriteQueue.getState().queue;
    expect(queue).toHaveLength(1);
    expect(queue[0].attemptCount).toBe(1);
    expect(queue[0].lastError).toBe("boom");
    // The "alwaysFails" lane is paused so the next drain doesn't
    // tight-loop the same op. inFlightKinds is empty since the
    // dispatch completed (with a failure result).
    expect(useWriteQueue.getState().pausedKinds).toContain("alwaysFails");
    expect(useWriteQueue.getState().inFlightKinds).toEqual([]);
  });

  it("treats a thrown handler as a failed op (not a crash)", async () => {
    const handler = vi.fn(async (): Promise<ActionResult> => {
      throw new Error("network down");
    });
    registerActionHandler("throws", handler);

    useWriteQueue.getState().enqueue("throws", []);
    await flushMicrotasks();

    const queue = useWriteQueue.getState().queue;
    expect(queue).toHaveLength(1);
    expect(queue[0].lastError).toBe("network down");
  });

  // ─── Phase 4b: per-kind lane semantics ───────────────────────

  it("runs ops of DIFFERENT kinds in parallel (lane independence)", async () => {
    // Old behaviour serialized everything — a slow score-goal would
    // delay a set-availability flip behind it. New behaviour
    // dispatches eligible ops of different kinds in the same drain
    // pass.
    const calls: string[] = [];
    let aResolve!: () => void;
    const aGate = new Promise<void>((r) => (aResolve = r));

    registerActionHandler("kindA", async (): Promise<ActionResult> => {
      calls.push("A-start");
      await aGate; // hold lane A open
      calls.push("A-end");
      return { success: true };
    });
    registerActionHandler("kindB", async (): Promise<ActionResult> => {
      calls.push("B-start");
      // Yield once to give a chance to interleave.
      await Promise.resolve();
      calls.push("B-end");
      return { success: true };
    });

    useWriteQueue.getState().enqueue("kindA", []);
    useWriteQueue.getState().enqueue("kindB", []);
    // Let both lanes start.
    await flushMicrotasks();
    expect(calls).toContain("A-start");
    expect(calls).toContain("B-start");
    expect(calls).toContain("B-end");
    expect(calls).not.toContain("A-end"); // A still held

    // Release A.
    aResolve();
    await flushMicrotasks();
    expect(calls).toContain("A-end");
    expect(useWriteQueue.getState().queue).toEqual([]);
  });

  it("a failure in one kind does NOT block other kinds", async () => {
    // Previously: enqueue("first" fail) then enqueue("second") would
    // never run "second". With per-kind lanes, "first" pauses its
    // own lane only; "second" drains.
    const calls: string[] = [];
    registerActionHandler("first", async (): Promise<ActionResult> => {
      calls.push("first");
      return { success: false, error: "boom" };
    });
    registerActionHandler("second", async (): Promise<ActionResult> => {
      calls.push("second");
      return { success: true };
    });

    useWriteQueue.getState().enqueue("first", []);
    useWriteQueue.getState().enqueue("second", []);
    await flushMicrotasks();

    expect(calls).toEqual(expect.arrayContaining(["first", "second"]));
    // "first" stays parked (lane paused); "second" drained.
    const queue = useWriteQueue.getState().queue;
    expect(queue.map((q) => q.kind)).toEqual(["first"]);
    expect(useWriteQueue.getState().pausedKinds).toContain("first");
  });

  it("SAME-kind ops still serialize and preserve order across failures", async () => {
    // Two ops of the same kind. The first fails → the kind is
    // paused → the second never attempts. After resume() + drain,
    // both run in their original order.
    const calls: string[] = [];
    let firstShouldFail = true;
    registerActionHandler("same", async (...args): Promise<ActionResult> => {
      const tag = args[0] as string;
      calls.push(tag);
      if (tag === "first" && firstShouldFail) {
        return { success: false, error: "transient" };
      }
      return { success: true };
    });

    useWriteQueue.getState().enqueue("same", ["first"]);
    useWriteQueue.getState().enqueue("same", ["second"]);
    await flushMicrotasks();
    expect(calls).toEqual(["first"]); // second blocked behind paused lane

    firstShouldFail = false;
    useWriteQueue.getState().resume();
    await useWriteQueue.getState().drain();
    await flushMicrotasks();

    expect(calls).toEqual(["first", "first", "second"]);
    expect(useWriteQueue.getState().queue).toEqual([]);
  });

  it("registering a missing handler clears that kind's pause and drains automatically", async () => {
    // Cold-start race: persisted ops exist, network-online fires
    // drain before registerLiveActions runs. The kind is paused;
    // when its handler shows up, the pause is cleared and a drain
    // kicks automatically.
    const okHandler = vi.fn(async (): Promise<ActionResult> => ({ success: true }));
    registerActionHandler("ok", okHandler);

    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    useWriteQueue.getState().enqueue("nonexistent", []);
    useWriteQueue.getState().enqueue("ok", []);
    await flushMicrotasks();

    // "nonexistent" lane paused; "ok" drained on the same pass.
    expect(warnSpy).toHaveBeenCalled();
    expect(okHandler).toHaveBeenCalledTimes(1);
    expect(useWriteQueue.getState().pausedKinds).toContain("nonexistent");
    const queueAfterFirstPass = useWriteQueue.getState().queue;
    expect(queueAfterFirstPass).toHaveLength(1);
    expect(queueAfterFirstPass[0].kind).toBe("nonexistent");

    // The missing handler shows up — register clears the pause and
    // triggers a drain.
    const lateHandler = vi.fn(async (): Promise<ActionResult> => ({ success: true }));
    registerActionHandler("nonexistent", lateHandler);
    await flushMicrotasks();

    expect(lateHandler).toHaveBeenCalledTimes(1);
    expect(useWriteQueue.getState().queue).toEqual([]);
    expect(useWriteQueue.getState().pausedKinds).not.toContain("nonexistent");
    warnSpy.mockRestore();
  });

  it("is re-entrancy-safe — concurrent drain() calls don't double-fire same-kind handlers", async () => {
    let inflight = 0;
    let maxInflight = 0;
    registerActionHandler("count", async (): Promise<ActionResult> => {
      inflight++;
      maxInflight = Math.max(maxInflight, inflight);
      // Yield once so a concurrent drain has a chance to interleave.
      await Promise.resolve();
      inflight--;
      return { success: true };
    });

    useWriteQueue.getState().enqueue("count", []);
    useWriteQueue.getState().enqueue("count", []);
    useWriteQueue.getState().enqueue("count", []);

    // Fire extra drains concurrently. Lane gating must keep them
    // strictly serial for the SAME kind.
    await Promise.all([
      useWriteQueue.getState().drain(),
      useWriteQueue.getState().drain(),
      useWriteQueue.getState().drain(),
    ]);
    await waitForEmptyQueue();

    expect(maxInflight).toBe(1);
    expect(useWriteQueue.getState().queue).toEqual([]);
  });
});

// Helper: yield enough microtasks for a chain of awaits to settle.
// `await Promise.resolve()` once isn't always enough when an action
// has multiple internal awaits; do a few rounds.
async function flushMicrotasks(rounds = 10): Promise<void> {
  for (let i = 0; i < rounds; i++) {
    await Promise.resolve();
  }
}

// Polls until the queue is empty or the deadline passes. The test
// can't capture the drain promise triggered by enqueue() (it's
// fire-and-forget by design), so we wait for the side effect.
async function waitForEmptyQueue(deadlineMs = 500): Promise<void> {
  const start = Date.now();
  while (useWriteQueue.getState().queue.length > 0) {
    if (Date.now() - start > deadlineMs) {
      throw new Error(
        `queue did not drain within ${deadlineMs}ms; remaining=` +
          JSON.stringify(useWriteQueue.getState().queue.map((q) => q.kind)),
      );
    }
    await Promise.resolve();
  }
}
