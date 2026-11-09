import { describe, expect, it } from "vitest";
import {
  lastUndoable,
  standingFoulEvents,
  swapUndoLabel,
  undoableLabel,
  type OwnAction,
  type UndoEvent,
} from "@/lib/live/lastUndoable";

const AFL = new Set(["goal", "behind", "opponent_goal", "opponent_behind"]);
const NETBALL = new Set(["goal", "opponent_goal"]);
const BASKETBALL = new Set(["free_throw", "two_pointer", "three_pointer", "opponent_free_throw", "opponent_two_pointer", "opponent_three_pointer"]);
const RUGBY = new Set(["try", "opponent_try", "conversion_attempt", "opponent_conversion", "penalty_goal", "field_goal"]);
const SOCCER = new Set(["goal", "opponent_goal", "own_goal"]);
const OZTAG = new Set(["try", "opponent_try", "girls_try", "opponent_girls_try"]);

let t = 0;
function ev(type: string, opts: { id?: string; key?: string; player?: string | null; metadata?: Record<string, unknown> } = {}): UndoEvent {
  t += 1;
  return {
    id: opts.id ?? `e${t}`,
    type,
    player_id: opts.player ?? null,
    created_at: new Date(Date.UTC(2026, 10, 9, 10, 0, t)).toISOString(),
    idempotency_key: opts.key ?? `k${t}`,
    metadata: opts.metadata ?? {},
  };
}
const undo = (target: UndoEvent) => ev("score_undo", { metadata: { target_event_id: target.id } });

const KIDS: Record<string, string> = { mia: "Mia", sam: "Sam", ava: "Ava", leo: "Leo", zoe: "Zoe" };
const names = { teamName: "Roos", opponentName: "Hawks", firstName: (id: string) => KIDS[id] ?? "Player" };
const labelOf = (input: Parameters<typeof lastUndoable>[0]) => {
  const pick = lastUndoable(input);
  return pick ? undoableLabel(pick, names) : null;
};

describe("lastUndoable", () => {
  it("AFL: names the latest score, with the kid", () => {
    const g = ev("goal", { player: "mia" });
    const b = ev("opponent_behind");
    expect(labelOf({ events: [g, b], scoreTypes: AFL, own: [], period: 1 })).toBe("Hawks behind");
    expect(labelOf({ events: [g], scoreTypes: AFL, own: [], period: 1 })).toBe("Roos goal — Mia");
  });

  it("AFL: a swap after a goal is what Undo takes back, then the goal again", () => {
    const g = ev("goal", { player: "mia", key: "kg" });
    const own: OwnAction[] = [
      { kind: "score", seq: 1, key: "kg", text: "Roos goal — Mia" },
      { kind: "change", seq: 2, period: 1, label: "Ava on for Leo" },
    ];
    expect(labelOf({ events: [g], scoreTypes: AFL, own, period: 1 })).toBe("Ava on for Leo");
    // Put back: the goal is next.
    const after = own.map((a) => (a.kind === "change" ? { ...a, undone: true } : a));
    expect(labelOf({ events: [g], scoreTypes: AFL, own: after, period: 1 })).toBe("Roos goal — Mia");
  });

  it("a swap can't be put back once anything comes after it", () => {
    const g = ev("goal", { player: "mia", key: "kg" });
    const own: OwnAction[] = [
      { kind: "change", seq: 1, period: 1, label: "Ava on for Leo" },
      { kind: "score", seq: 2, key: "kg" },
    ];
    expect(lastUndoable({ events: [g], scoreTypes: AFL, own, period: 1 })?.kind).toBe("score");
    // The goal taken back: the swap before it still doesn't come back.
    expect(lastUndoable({ events: [g, undo(g)], scoreTypes: AFL, own, period: 1 })).toBeNull();
    // An injury after it.
    const hurt: OwnAction[] = [{ kind: "change", seq: 1, period: 1, label: "Ava on for Leo" }, { kind: "other", seq: 2 }];
    expect(lastUndoable({ events: [], scoreTypes: AFL, own: hurt, period: 1 })).toBeNull();
  });

  it("a swap from an earlier period can't be put back", () => {
    const own: OwnAction[] = [{ kind: "change", seq: 1, period: 1, label: "Ava on for Leo" }];
    expect(lastUndoable({ events: [], scoreTypes: AFL, own, period: 2 })).toBeNull();
    expect(lastUndoable({ events: [], scoreTypes: AFL, own, period: 1 })?.kind).toBe("change");
  });

  it("netball: the runner's Undo takes back its own goal, not the coach's later one", () => {
    const theirs = ev("opponent_goal", { key: "runner-1" });
    const coachGoal = ev("goal", { player: "zoe", key: "coach-1" });
    const own: OwnAction[] = [{ kind: "score", seq: 1, key: "runner-1" }];
    const pick = lastUndoable({ events: [theirs, coachGoal], scoreTypes: NETBALL, own, period: 1 });
    expect(pick).toMatchObject({ kind: "score", mine: true, event: { id: theirs.id } });
    // On the coach's phone (nothing of its own), the latest: the coach's goal.
    expect(lastUndoable({ events: [theirs, coachGoal], scoreTypes: NETBALL, own: [], period: 1 })).toMatchObject({
      event: { id: coachGoal.id },
      mine: false,
    });
  });

  it("once this phone's scores are all taken back, the next one down in the game", () => {
    const a = ev("goal", { player: "mia", key: "other-phone" });
    const b = ev("goal", { player: "sam", key: "mine" });
    const own: OwnAction[] = [{ kind: "score", seq: 1, key: "mine" }];
    expect(labelOf({ events: [a, b, undo(b)], scoreTypes: NETBALL, own, period: 1 })).toBe("Roos goal — Mia");
  });

  it("a score changed to another kid (Scores and fixes) names the new kid", () => {
    const wrong = ev("behind", { player: "mia", key: "mine" });
    const fixed = [undo(wrong), ev("behind", { player: "sam", key: "fix" })];
    const own: OwnAction[] = [{ kind: "score", seq: 1, key: "mine", text: "Roos behind — Mia" }];
    expect(labelOf({ events: [wrong, ...fixed], scoreTypes: AFL, own, period: 1 })).toBe("Roos behind — Sam");
  });

  it("basketball: a foul after a basket is what Undo takes back", () => {
    const basket = ev("two_pointer", { player: "mia", key: "kb" });
    const foul = ev("foul", { player: "sam", key: "kf", metadata: { kind: "personal" } });
    const own: OwnAction[] = [
      { kind: "score", seq: 1, key: "kb", text: "Roos 2 points — Mia" },
      { kind: "foul", seq: 2, key: "kf" },
    ];
    expect(labelOf({ events: [basket, foul], scoreTypes: BASKETBALL, own, period: 1 })).toBe("foul on Sam");
    // The foul taken back: the basket is next.
    const back = ev("foul", { player: "sam", metadata: { kind: "personal", undo: true } });
    expect(labelOf({ events: [basket, foul, back], scoreTypes: BASKETBALL, own, period: 1 })).toBe("Roos 2 points — Mia");
  });

  it("basketball: a foul from the other phone counts as the game's latest", () => {
    const basket = ev("opponent_three_pointer");
    const foul = ev("foul", { player: "leo" });
    expect(labelOf({ events: [basket, foul], scoreTypes: BASKETBALL, own: [], period: 2 })).toBe("foul on Leo");
  });

  it("basketball: a foul taken back takes off that kid's latest only", () => {
    const f1 = ev("foul", { player: "sam" });
    const f2 = ev("foul", { player: "leo" });
    const f3 = ev("foul", { player: "sam" });
    const back = ev("foul", { player: "sam", metadata: { undo: true } });
    expect(standingFoulEvents([f1, f2, f3, back]).map((e) => e.id)).toEqual([f1.id, f2.id]);
  });

  it("rugby: names a conversion in plain words, and the try after it's taken back", () => {
    const tr = ev("try", { player: "ava" });
    const conv = ev("conversion_attempt", { player: "leo", metadata: { made: true } });
    expect(labelOf({ events: [tr, conv], scoreTypes: RUGBY, own: [], period: 1 })).toBe("Roos conversion — Leo");
    expect(labelOf({ events: [tr, conv, undo(conv)], scoreTypes: RUGBY, own: [], period: 1 })).toBe("Roos try — Ava");
  });

  it("soccer: an opposition goal has no kid", () => {
    expect(labelOf({ events: [ev("opponent_goal")], scoreTypes: SOCCER, own: [], period: 1 })).toBe("Hawks goal");
  });

  it("Oztag: a girl's try", () => {
    expect(labelOf({ events: [ev("girls_try", { player: "zoe" })], scoreTypes: OZTAG, own: [], period: 1 })).toBe("Roos girl's try — Zoe");
  });

  it("a score that never saved isn't offered; nothing at all is null", () => {
    const own: OwnAction[] = [{ kind: "score", seq: 1, key: "lost" }];
    expect(lastUndoable({ events: [], scoreTypes: AFL, own, period: 1 })).toBeNull();
  });
});

describe("swapUndoLabel", () => {
  const first = (id: string) => KIDS[id] ?? "Player";
  it("says who came on for whom", () => {
    expect(swapUndoLabel([{ off: "leo", on: "ava" }], first)).toBe("Ava on for Leo");
    expect(swapUndoLabel([{ off: null, on: "ava" }], first)).toBe("Ava on");
    expect(swapUndoLabel([{ off: "leo", on: "ava" }, { off: "sam", on: "mia" }], first)).toBe("the 2 swaps");
  });
});
