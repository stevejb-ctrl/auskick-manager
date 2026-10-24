// The write queue never loses a live write (round-3 edge testing, 24 Oct
// 2026, P0). It used to retry a failing op five times on a 1/2/4/8 s
// backoff and then drop it, without asking whether the phone had signal:
// anything tapped more than ~15 s into an outage was thrown away in tap
// order (AFL lost a goal, two opposition scores and an undo after 53 s
// offline), and a server that answered 500 for ~15 s lost a goal the same
// way. A reload left the queue on the phone but nothing sent it until the
// next tap.
//
// Now:
//   - a network failure, or a phone that says it's offline, spends no
//     attempt: the lane waits for the signal (and retries on a capped
//     backoff in case the phone never says so);
//   - a server error retries on a capped backoff and is never dropped;
//     a game write the server keeps refusing is kept, in order, marked
//     stuck, until the coach retries or discards it;
//   - only a rule refusal (`rejected`) drops at once, as before;
//   - a queue a reload left on the phone sends at once, and listeners
//     hear each save (a screen with no caller waiting can refresh);
//   - an op carries the event it stands for, so a reloaded screen draws
//     the taps still waiting.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  clearActionHandlers,
  isNetworkFailure,
  notifyOnline,
  onQueueSaved,
  registerActionHandler,
  useWriteQueue,
  type ActionResult,
} from "@/lib/live/writeQueue";
import { liveGameStorage } from "@/lib/live/persistStorage";
import { queuedOptimisticEvents } from "@/lib/live/optimisticEvents";

const MIN = 60_000;
const ok = async (): Promise<ActionResult> => ({ success: true });
const queue = () => useWriteQueue.getState().queue;

describe("a live write survives no signal", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    useWriteQueue.getState().clearQueue();
    clearActionHandlers();
  });

  afterEach(() => {
    useWriteQueue.getState().clearQueue();
    clearActionHandlers();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("knows a lost request from a server's answer", () => {
    expect(isNetworkFailure(new TypeError("Failed to fetch"))).toBe(true);
    expect(isNetworkFailure(new TypeError("Load failed"))).toBe(true);
    expect(isNetworkFailure(new Error("NetworkError when attempting to fetch resource."))).toBe(true);
    expect(isNetworkFailure(new Error("An unexpected response was received from the server."))).toBe(false);
  });

  it("a network failure spends no attempt, and the write saves once the signal is back, however long it took", async () => {
    let signal = false;
    const saved: string[] = [];
    registerActionHandler("recordGoal", async (...args: unknown[]): Promise<ActionResult> => {
      if (!signal) throw new TypeError("Failed to fetch");
      saved.push(args[0] as string);
      return { success: true };
    });
    let flushed = false;
    void useWriteQueue.getState().enqueue("recordGoal", ["goal"]).flushed.then(() => (flushed = true));

    // Two minutes with no signal: the goal used to be gone after ~15 s.
    await vi.advanceTimersByTimeAsync(2 * MIN);
    expect(queue()).toHaveLength(1);
    expect(queue()[0].attemptCount).toBe(0);
    expect(flushed).toBe(false);

    signal = true;
    await vi.advanceTimersByTimeAsync(31_000);
    expect(saved).toEqual(["goal"]);
    expect(flushed).toBe(true);
    expect(queue()).toEqual([]);
  });

  it("sends nothing while the phone says it's offline, then everything, in order, when it's back", async () => {
    vi.stubGlobal("navigator", { onLine: false });
    const sent: string[] = [];
    registerActionHandler("recordGoal", async (...args: unknown[]): Promise<ActionResult> => {
      sent.push(args[0] as string);
      return { success: true };
    });
    registerActionHandler("recordSwap", async (...args: unknown[]): Promise<ActionResult> => {
      sent.push(args[0] as string);
      return { success: true };
    });
    useWriteQueue.getState().enqueue("recordGoal", ["goal"]);
    useWriteQueue.getState().enqueue("recordSwap", ["swap"]);
    await vi.advanceTimersByTimeAsync(MIN);
    expect(sent).toEqual([]);

    vi.stubGlobal("navigator", { onLine: true });
    notifyOnline();
    await vi.advanceTimersByTimeAsync(0);
    expect(sent).toEqual(["goal", "swap"]);
    expect(queue()).toEqual([]);
  });

  it("retries a server error and never drops it", async () => {
    let failures = 12;
    registerActionHandler("recordGoal", async (): Promise<ActionResult> => {
      if (failures-- > 0) throw new Error("An unexpected response was received from the server.");
      return { success: true };
    });
    let flushed = false;
    void useWriteQueue.getState().enqueue("recordGoal", []).flushed.then(() => (flushed = true));
    await vi.advanceTimersByTimeAsync(10 * MIN);
    expect(flushed).toBe(true);
    expect(queue()).toEqual([]);
  });

  it("keeps a game write the server keeps refusing, holding the rest behind it, until it's retried", async () => {
    let refuse = true;
    registerActionHandler("recordGoal", async (): Promise<ActionResult> =>
      refuse ? { success: false, error: "Unauthenticated." } : { success: true },
    );
    const swap = vi.fn(ok);
    registerActionHandler("recordSwap", swap);
    let rejected = false;
    useWriteQueue.getState().enqueue("recordGoal", []).flushed.catch(() => (rejected = true));
    useWriteQueue.getState().enqueue("recordSwap", []);

    await vi.advanceTimersByTimeAsync(10 * MIN);
    expect(queue().map((o) => o.kind)).toEqual(["recordGoal", "recordSwap"]);
    expect(queue()[0].stuck).toBe(true);
    expect(queue()[0].lastError).toBe("Unauthenticated.");
    expect(rejected).toBe(false);
    expect(swap).not.toHaveBeenCalled();

    // Signed in again: Retry sends both, in order.
    refuse = false;
    useWriteQueue.getState().retryStuck();
    await vi.advanceTimersByTimeAsync(0);
    expect(queue()).toEqual([]);
    expect(swap).toHaveBeenCalledTimes(1);
  });

  it("a discarded write comes off, its caller hears why, and the rest go on", async () => {
    registerActionHandler("recordGoal", async (): Promise<ActionResult> => ({ success: false, error: "Not authorised." }));
    const swap = vi.fn(ok);
    registerActionHandler("recordSwap", swap);
    let why = "";
    const { id, flushed } = useWriteQueue.getState().enqueue("recordGoal", []);
    flushed.catch((e: Error) => (why = e.message));
    useWriteQueue.getState().enqueue("recordSwap", []);
    await vi.advanceTimersByTimeAsync(10 * MIN);
    expect(queue()[0].stuck).toBe(true);
    expect(swap).not.toHaveBeenCalled();

    useWriteQueue.getState().discard(id);
    await vi.advanceTimersByTimeAsync(0);
    expect(why).toContain("Not authorised.");
    expect(queue()).toEqual([]);
    expect(swap).toHaveBeenCalledTimes(1);
  });

  it("a rule refusal still drops at once", async () => {
    registerActionHandler("recordConversionAttempt", async (): Promise<ActionResult> => ({
      success: false,
      error: "There's no try to convert.",
      rejected: true,
    }));
    let rejected = false;
    useWriteQueue.getState().enqueue("recordConversionAttempt", []).flushed.catch(() => (rejected = true));
    await vi.advanceTimersByTimeAsync(0);
    expect(rejected).toBe(true);
    expect(queue()).toEqual([]);
  });

  it("sends what a reload left on the phone at once, and tells listeners each save", async () => {
    const heard: string[] = [];
    const off = onQueueSaved((op) => heard.push(op.id));
    const goal = vi.fn(ok);
    registerActionHandler("recordGoal", goal);
    await liveGameStorage.setItem(
      "siren-write-queue-v1",
      JSON.stringify({
        state: { queue: [{ id: "op-from-before", kind: "recordGoal", args: ["auth", "g1", {}], attemptCount: 2, queuedAt: 1 }] },
        version: 1,
      }),
    );
    await useWriteQueue.persist.rehydrate();
    await vi.advanceTimersByTimeAsync(0);
    expect(goal).toHaveBeenCalledTimes(1);
    expect(queue()).toEqual([]);
    expect(heard).toEqual(["op-from-before"]);
    off();
  });
});

describe("a queued write's event", () => {
  beforeEach(() => {
    useWriteQueue.getState().clearQueue();
    clearActionHandlers();
  });

  it("rides with the op, so a screen reloaded before it saved still draws it", () => {
    // No handler: the op waits in the queue, as with no signal.
    useWriteQueue.getState().enqueue("recordSoccerGoal", ["auth", "g1", { player_id: "p1" }], {
      gameId: "g1",
      createdAt: "2026-10-24T09:00:05.000Z",
      event: { type: "goal", player_id: "p1", metadata: { quarter: 1, elapsed_ms: 5_000 } },
    });
    useWriteQueue.getState().enqueue("recordSoccerGoal", ["auth", "g2", {}], {
      gameId: "g2",
      createdAt: "2026-10-24T09:00:06.000Z",
      event: { type: "goal", player_id: null, metadata: {} },
    });
    const [op] = useWriteQueue.getState().queue;
    const drawn = queuedOptimisticEvents(useWriteQueue.getState().queue, "g1");
    expect(drawn).toEqual([
      expect.objectContaining({
        id: `optimistic-${op.id}`,
        idempotency_key: op.id,
        type: "goal",
        player_id: "p1",
        created_at: "2026-10-24T09:00:05.000Z",
      }),
    ]);
  });
});
