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
    // The break screen prints the rule under it and its Fix moves the
    // kids it names first.
    expect(items[1]).toMatchObject({ rule: "Nobody sits out two quarters in a row", playerIds: ["ava"] });
    expect(items[2]).toMatchObject({ rule: "Keep Mia and Jack apart", playerIds: ["mia", "jack"] });
  });

  it("doesn't claim 'All rules kept' when it only checked the floor, and says where season balance stands", () => {
    // Usability run: a new Preferred lines team saw "All rules kept" with
    // only the 50% line behind it, and read that as fairness unchecked.
    const lineup = {
      ...base,
      onField: { mia: "fwd", sam: "back" },
      bench: ["ava"],
      playedThisGame: {},
      benchedLastPeriod: [],
      period: 1,
      rules: [],
    };
    expect(summariseCheck(checkRules(lineup))).toEqual({ status: "ok", text: "Everyone can play at least 50%" });

    const units = { time: {}, units: ["back", "mid", "fwd"], unitLabel: label };
    const fresh = checkRules({ ...lineup, season: units });
    expect(fresh.map((i) => i.text)).toContain("Season balance starts after your first game");
    expect(summariseCheck(fresh).text).toBe("All rules kept");

    const even = { mia: { back: P, mid: P, fwd: P }, sam: { back: P, mid: P, fwd: P }, ava: { back: P, mid: P, fwd: P } };
    expect(checkRules({ ...lineup, season: { ...units, time: even } }).map((i) => i.text)).toContain(
      "Season balance: nobody is short this season",
    );
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

  it("counts the time rolling subs can still give a kid who starts on the bench", () => {
    // Two halves. Ava and Sam sat out the first. On the bench for the
    // second they can still play all of it on flying subs: 50%.
    const H = 20 * 60_000;
    const halves = {
      ...base,
      periodMs: H,
      periodCount: 2,
      periodWord: "half",
      onField: { mia: "back" },
      bench: ["ava", "sam"],
      playedThisGame: { mia: { back: H }, ava: {}, sam: {} },
      benchedLastPeriod: [],
      period: 2,
      rules: [],
    };
    // Subs only at the break: neither can get there from the bench.
    expect(checkRules(halves)[0]).toMatchObject({ status: "fail", text: "Ava and Sam can't reach 50% now" });
    // Rolling subs: the whole half is still there.
    const rolling = checkRules({ ...halves, benchReachMs: H });
    expect(rolling[0]).toMatchObject({ status: "ok", text: "Everyone can play at least 50%" });
    // Sub windows from 5 minutes in leave 15 of the 40: short of 60%.
    const short = checkRules({ ...halves, minGameTimePct: 60, benchReachMs: H * 0.75 });
    expect(short[0]).toMatchObject({ status: "fail", text: "Ava and Sam can't reach 60% now" });
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
    expect(items[1]).toEqual({
      id: "season-mia-fwd",
      status: "warn",
      text: "Mia hasn't played forward this season",
      playerIds: ["mia"],
    });
  });

  it("says a season gap this lineup closes is being closed, not short (UX round 2, 24 Oct 2026)", () => {
    // "Hugo hasn't played back this season" in amber, with Hugo at BCK in
    // the very lineup on screen.
    const items = checkRules({
      ...base,
      onField: { hugo: "back", mia: "back" },
      bench: [],
      playedThisGame: {},
      benchedLastPeriod: [],
      period: 1,
      rules: [],
      season: {
        time: { hugo: { mid: 4 * P, fwd: 4 * P }, mia: { back: 4 * P, mid: 4 * P } },
        units: ["back", "mid", "fwd"],
        unitLabel: (k) => label(k).toLowerCase(),
      },
    });
    const season = items.filter((i) => i.id.startsWith("season-"));
    expect(season).toContainEqual({ id: "season-hugo-back", status: "ok", text: "Hugo plays back this quarter" });
    // A gap the lineup leaves open still nudges.
    expect(season).toContainEqual({
      id: "season-mia-fwd",
      status: "warn",
      text: "Mia hasn't played forward this season",
      playerIds: ["mia"],
    });
    expect(summariseCheck(items)).toEqual({ status: "warn", text: "Mia hasn't played forward this season" });
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

  it("judges game time against how long each period ran, not its nominal length", () => {
    // Stagehand round 2: quarters ended at 8 of 12 minutes, and a kid
    // who played exactly half the time played was flagged under 50%.
    const ran = 8 * 60_000;
    const report = gameReport({
      ...base,
      byPeriod: {
        mia: { 1: { fwd: ran }, 2: { mid: ran }, 3: { back: ran }, 4: { fwd: ran } },
        zoe: { 1: { back: ran }, 3: { mid: ran } },
      },
      periodPlayedMs: { 1: ran, 2: ran, 3: ran, 4: ran },
      rules: [],
    });
    expect(report.items[0]).toMatchObject({ status: "ok", text: "Everyone played at least 50%" });
  });
});
