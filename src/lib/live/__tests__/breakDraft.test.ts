// The lineup a coach stages at a period break is kept in the live store
// so it survives leaving the live screen (Stagehand round 5). On the way
// back it's restored only for the same game and break, and only kids who
// can still play may stay on the field.

import { beforeEach, describe, expect, it } from "vitest";
import { restoreBreakDraft, type StagedBreakDraft } from "@/lib/live/breakDraft";
import { useLiveGame } from "@/lib/stores/liveGameStore";

const draft: StagedBreakDraft = {
  gameId: "g1",
  period: 2,
  groups: { fwd: ["a", "b"], mid: ["c", "d"], back: ["e", "f"] },
  bench: ["g", "h"],
  mode: "keep",
};
const groupIds = ["back", "mid", "fwd"];
const everyone = ["a", "b", "c", "d", "e", "f", "g", "h"];

describe("restoreBreakDraft", () => {
  it("gives back the staged lineup and mode for the same game and break", () => {
    expect(
      restoreBreakDraft(draft, { gameId: "g1", period: 2, groupIds, availableIds: everyone }),
    ).toEqual({
      groups: { back: ["e", "f"], mid: ["c", "d"], fwd: ["a", "b"] },
      bench: ["g", "h"],
      mode: "keep",
    });
  });

  it("restores nothing for another game, another break, or no draft", () => {
    const input = { groupIds, availableIds: everyone };
    expect(restoreBreakDraft(draft, { ...input, gameId: "g2", period: 2 })).toBeNull();
    expect(restoreBreakDraft(draft, { ...input, gameId: "g1", period: 3 })).toBeNull();
    expect(restoreBreakDraft(null, { ...input, gameId: "g1", period: 2 })).toBeNull();
  });

  it("takes a kid hurt or lent since off the field, onto the bench", () => {
    const restored = restoreBreakDraft(draft, {
      gameId: "g1",
      period: 2,
      groupIds,
      availableIds: everyone.filter((id) => id !== "a" && id !== "g"),
      benchOnlyIds: ["a", "g"],
    });
    expect(restored?.groups.fwd).toEqual(["b"]);
    expect(restored?.bench).toEqual(["g", "h", "a"]);
  });

  it("drops a kid who is no longer in the game at all", () => {
    const restored = restoreBreakDraft(draft, {
      gameId: "g1",
      period: 2,
      groupIds,
      availableIds: everyone.filter((id) => id !== "c" && id !== "h"),
    });
    expect(restored?.groups.mid).toEqual(["d"]);
    expect(restored?.bench).toEqual(["g"]);
  });

  it("puts a kid who joined since on the bench, so nobody is lost", () => {
    const restored = restoreBreakDraft(draft, {
      gameId: "g1",
      period: 2,
      groupIds,
      availableIds: [...everyone, "late"],
      benchOnlyIds: ["hurt"],
    });
    expect(restored?.bench).toEqual(["g", "h", "late", "hurt"]);
  });

  it("never lists a kid twice", () => {
    const restored = restoreBreakDraft(
      { ...draft, groups: { fwd: ["a", "a"], mid: ["c"] }, bench: ["c", "g", "a"] },
      { gameId: "g1", period: 2, groupIds, availableIds: ["a", "c", "g"] },
    );
    expect(restored).toEqual({
      groups: { back: [], mid: ["c"], fwd: ["a"] },
      bench: ["g"],
      mode: "keep",
    });
  });
});

describe("liveGameStore: the staged break draft", () => {
  beforeEach(() => {
    useLiveGame.setState({ activeGameId: "g1", currentQuarter: 1, breakDraft: draft });
  });

  it("survives init for the same game at a break (a reload, or the team page and back)", () => {
    useLiveGame.getState().init({ activeGameId: "g1", currentQuarter: 1, quarterEnded: true });
    expect(useLiveGame.getState().breakDraft).toEqual(draft);
  });

  it("survives init after a reload, when the store only has the persisted fields", () => {
    useLiveGame.setState({ currentQuarter: 0 });
    useLiveGame.getState().init({ activeGameId: "g1", currentQuarter: 1, quarterEnded: true });
    expect(useLiveGame.getState().breakDraft).toEqual(draft);
  });

  it("is wiped by a restart, a pre-kickoff init, or another game", () => {
    useLiveGame.setState({ currentQuarter: 2 });
    useLiveGame.getState().init({ activeGameId: "g1", currentQuarter: 1 });
    expect(useLiveGame.getState().breakDraft).toBeNull();

    useLiveGame.setState({ currentQuarter: 0, breakDraft: draft });
    useLiveGame.getState().init({ activeGameId: "g1", currentQuarter: 0 });
    expect(useLiveGame.getState().breakDraft).toBeNull();

    useLiveGame.setState({ activeGameId: "g1", currentQuarter: 1, breakDraft: draft });
    useLiveGame.getState().init({ activeGameId: "g2", currentQuarter: 1 });
    expect(useLiveGame.getState().breakDraft).toBeNull();
  });

  it("is saved with the persisted fields", () => {
    const persisted = useLiveGame.persist.getOptions().partialize!(useLiveGame.getState()) as {
      breakDraft?: StagedBreakDraft | null;
    };
    expect(persisted.breakDraft).toEqual(draft);
  });

  it("is cleared with setBreakDraft(null)", () => {
    useLiveGame.getState().setBreakDraft(null);
    expect(useLiveGame.getState().breakDraft).toBeNull();
  });
});
