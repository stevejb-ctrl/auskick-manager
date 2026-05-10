// Slice 5 phase 5d coverage. The queue is the layer between
// optimistic local state (the zustand liveGameStore) and durable
// server-side events. These tests pin down the contract phase 5e
// will rely on when wrapping the 18 server-action call sites.
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

    const id = useWriteQueue.getState().enqueue("recordsKey", ["a", "b"]);
    await flushMicrotasks();

    expect(handler).toHaveBeenCalledWith("a", "b", id);
    // UUID v4 shape: 8-4-4-4-12 hex, version nibble = 4.
    expect(receivedKey).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
    expect(receivedKey).toBe(id);
  });

  it("leaves a failed op at the head with attemptCount bumped and lastError set", async () => {
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
    // draining flag is reset even on failure (otherwise next drain
    // would deadlock).
    expect(useWriteQueue.getState().draining).toBe(false);
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

  it("stops draining at the first failed op so order is preserved", async () => {
    const calls: string[] = [];
    registerActionHandler("first", async (): Promise<ActionResult> => {
      calls.push("first");
      return { success: false, error: "stop here" };
    });
    registerActionHandler("second", async (): Promise<ActionResult> => {
      calls.push("second");
      return { success: true };
    });

    useWriteQueue.getState().enqueue("first", []);
    useWriteQueue.getState().enqueue("second", []);
    await flushMicrotasks();

    // first failed → drain stops there; second is never attempted.
    expect(calls).toEqual(["first"]);
    expect(useWriteQueue.getState().queue).toHaveLength(2);
    expect(useWriteQueue.getState().queue[0].kind).toBe("first");
    expect(useWriteQueue.getState().queue[1].kind).toBe("second");
  });

  it("retrying after the head succeeds drains the rest in order", async () => {
    const calls: string[] = [];
    let firstShouldFail = true;
    registerActionHandler("first", async (): Promise<ActionResult> => {
      calls.push("first");
      if (firstShouldFail) return { success: false, error: "transient" };
      return { success: true };
    });
    registerActionHandler("second", async (): Promise<ActionResult> => {
      calls.push("second");
      return { success: true };
    });

    useWriteQueue.getState().enqueue("first", []);
    useWriteQueue.getState().enqueue("second", []);
    await flushMicrotasks();
    expect(calls).toEqual(["first"]);

    // Network "comes back" — first succeeds this time.
    firstShouldFail = false;
    await useWriteQueue.getState().drain();

    expect(calls).toEqual(["first", "first", "second"]);
    expect(useWriteQueue.getState().queue).toEqual([]);
  });

  it("drops ops with no registered handler instead of blocking the queue", async () => {
    const okHandler = vi.fn(async (): Promise<ActionResult> => ({ success: true }));
    registerActionHandler("ok", okHandler);

    // Silence the warn for the unknown kind.
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    useWriteQueue.getState().enqueue("nonexistent", []);
    useWriteQueue.getState().enqueue("ok", []);
    await flushMicrotasks();

    expect(warnSpy).toHaveBeenCalled();
    expect(okHandler).toHaveBeenCalledTimes(1);
    expect(useWriteQueue.getState().queue).toEqual([]);
    warnSpy.mockRestore();
  });

  it("is re-entrancy-safe — concurrent drain() calls don't double-fire handlers", async () => {
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

    // Fire extra drains concurrently. The draining flag should
    // make the second-and-onwards calls no-ops.
    await Promise.all([
      useWriteQueue.getState().drain(),
      useWriteQueue.getState().drain(),
      useWriteQueue.getState().drain(),
    ]);
    // The drain triggered by the first enqueue may still be in
    // flight after the explicit drain() promises resolve (those
    // short-circuit on draining=true). Wait for the queue to
    // actually empty before asserting.
    await waitForEmptyQueue();

    expect(maxInflight).toBe(1);
    expect(useWriteQueue.getState().queue).toEqual([]);
  });
});

// Helper: yield enough microtasks for a chain of awaits to settle.
// `await Promise.resolve()` once isn't always enough when an action
// has multiple internal awaits; do a few rounds.
async function flushMicrotasks(rounds = 5): Promise<void> {
  for (let i = 0; i < rounds; i++) {
    await Promise.resolve();
  }
}

// Polls until the queue is empty or the deadline passes. The test
// can't capture the drain promise triggered by enqueue() (it's
// fire-and-forget by design), so we wait for the side effect.
async function waitForEmptyQueue(deadlineMs = 200): Promise<void> {
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
