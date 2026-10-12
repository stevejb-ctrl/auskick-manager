import { describe, expect, it } from "vitest";
import { newRule } from "@/lib/playbook/rules";
import { checkRules, summariseCheck, whyMove } from "@/lib/playbook/ruleCheck";
import { gameReport } from "@/lib/playbook/gameReport";

describe("rule check (RuleCheckBar)", () => {
  const P = 12 * 60_000;
  const label = (k: string) => ({ back: "Back", mid: "Centre", fwd: "Forward" })[k] ?? k;
  const base = {
    lines: ["back", "mid", "fwd"],
    lineLabel: label,
    name: (id: string) => id.charAt(0).toUpperCase() + id.slice(1),
    periodMs: P,
    periodCount: 4,
    periodWord: "quarter",
    lineWord: "line",
    minGameTimePct: 50,
  };

  it("flags a kid who'd sit out twice in a row, and kids kept together who shouldn't be", () => {
    const items = checkRules({
      ...base,
      onField: { mia: "fwd", jack: "fwd", sam: "back" },
      bench: ["ava"],
      playedThisGame: { mia: { fwd: P }, jack: { mid: P }, sam: { back: P } },
      benchedLastPeriod: ["ava"],
      period: 2,
      rules: [
        { ...newRule("max-bench-in-row"), strength: "must" },
        { ...newRule("keep-apart"), params: { playerIds: ["mia", "jack"] } },
      ],
    });
    expect(items.map((i) => [i.status, i.text])).toEqual([
      ["ok", "Everyone can play at least 50%"],
      ["fail", "Ava would sit out twice in a row"],
      ["warn", "Mia and Jack are both in Forward"],
    ]);
    expect(summariseCheck(items)).toEqual({ status: "fail", text: "Ava would sit out twice in a row" });
  });

  it("knows when a kid can no longer reach the floor or every line", () => {
    const items = checkRules({
      ...base,
      onField: { mia: "back" },
      bench: ["ava"],
      playedThisGame: { mia: { back: P, mid: P }, ava: {} },
      benchedLastPeriod: [],
      period: 4,
      rules: [{ ...newRule("every-line-per-game"), strength: "must" }],
    });
    expect(items[0]).toMatchObject({ status: "fail", text: "Ava can't reach 50% now" });
    expect(items[1]).toMatchObject({ status: "fail", text: "Mia and Ava won't get to every line this game" });
  });

  it("nudges the biggest season gaps", () => {
    const items = checkRules({
      ...base,
      onField: { mia: "back" },
      bench: [],
      playedThisGame: {},
      benchedLastPeriod: [],
      period: 1,
      rules: [],
      season: {
        time: { mia: { back: 4 * P, mid: 2 * P } },
        units: ["back", "mid", "fwd"],
        unitLabel: (k) => label(k).toLowerCase(),
      },
    });
    expect(items[1]).toEqual({ id: "season-mia-fwd", status: "warn", text: "Mia hasn't played forward this season" });
  });

  it("explains a move in one line", () => {
    const why = (over: Partial<Parameters<typeof whyMove>[0]>) =>
      whyMove({
        playerId: "mia",
        to: "back",
        from: "fwd",
        lineLabel: label,
        periodWord: "quarter",
        playedThisGame: {},
        benchedLastPeriod: false,
        strategy: "suggested",
        ...over,
      });
    expect(why({ seasonOwed: { back: 1.5 } })).toBe("Owed Back time this season");
    expect(why({})).toBe("Hasn't played Back this game");
    expect(why({ strategy: "rotate" })).toBe("Everyone moves up a line");
    expect(why({ homeLine: "back", playedThisGame: { back: P } })).toBe("Home: Back");
    expect(why({ to: null })).toBe("Fair rest on the bench");
  });
});


describe("game report (How we played)", () => {
  const P = 12 * 60_000;
  const label = (k: string) => ({ back: "Back", mid: "Centre", fwd: "Forward" })[k] ?? k;
  const base = {
    lines: ["back", "mid", "fwd"],
    lineLabel: label,
    lineWord: "line",
    periodLabel: (n: number) => `Q${n}`,
    periodCount: 4,
    periodMs: P,
    minGameTimePct: 50,
    name: (id: string) => id.charAt(0).toUpperCase() + id.slice(1),
  };

  it("reports rules kept and missed over the whole game", () => {
    const report = gameReport({
      ...base,
      byPeriod: {
        mia: { 1: { fwd: P }, 2: { mid: P }, 3: { back: P } },
        jack: { 1: { fwd: P }, 4: { fwd: P } },
        ava: { 1: { back: P }, 2: { back: P }, 3: { mid: P }, 4: { fwd: P } },
      },
      rules: [
        { ...newRule("max-bench-in-row"), strength: "must" },
        { ...newRule("keep-apart"), params: { playerIds: ["mia", "jack"] } },
        { ...newRule("every-line-per-game"), strength: "prefer" },
      ],
    });
    expect(report.items.map((i) => [i.status, i.text])).toEqual([
      ["ok", "Everyone played at least 50%"],
      ["fail", "Jack sat out 2 in a row"],
      ["warn", "Mia and Jack shared Forward in Q1"],
      ["warn", "Jack didn't get every line"],
    ]);
    expect(report.seasonLine).toBeNull();
  });

  it("counts kids whose season got more even", () => {
    const report = gameReport({
      ...base,
      byPeriod: { mia: { 1: { fwd: P } }, ava: { 1: { back: P } } },
      rules: [],
      season: {
        before: { mia: { back: 2 * P, mid: 2 * P }, ava: { back: 2 * P, mid: 2 * P } },
        after: { mia: { back: 2 * P, mid: 2 * P, fwd: P }, ava: { back: 3 * P, mid: 2 * P } },
        units: ["back", "mid", "fwd"],
      },
    });
    // Judged on the one period the game reached.
    expect(report.items[0]).toMatchObject({ status: "ok", text: "Everyone played at least 50%" });
    expect(report.seasonLine).toBe("Season balance: improved for 1 kid");
  });

  it("counts kids who never got on, and says nothing about season balance on a first game", () => {
    const report = gameReport({
      ...base,
      byPeriod: { mia: { 1: { fwd: P }, 2: { mid: P } } },
      present: ["mia", "zoe"],
      rules: [{ ...newRule("max-bench-in-row"), strength: "must" }],
      season: { before: {}, after: { mia: { fwd: P, mid: P } }, units: ["back", "mid", "fwd"] },
    });
    expect(report.items.map((i) => i.text)).toEqual(["Zoe played under 50%", "Zoe sat out 2 in a row"]);
    expect(report.seasonLine).toBeNull();
  });
});
