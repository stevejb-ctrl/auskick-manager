// The facts the public site states about Siren come from one file
// (src/lib/siren-facts.ts). Before it, the homepage said five sports,
// /why-siren, privacy and terms said "football and netball", and the
// help overview said "AFL, netball or rugby league". This checks the
// facts against the sport registry, and the CMS-edited marketing JSON
// (which can't import them) against the facts.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { HOME_CONTENT } from "@/lib/marketing/homeContent";
import { sportPageCopy } from "@/lib/marketing/sportPages";
import { effectivePolicy, getSportPlaybook } from "@/lib/playbook";
import { MARKETING_SPORTS } from "@/lib/sports/marketing-sports";
import { ALL_SPORT_IDS, getSportConfig } from "@/lib/sports/registry";
import {
  PRICE,
  SIREN_SPORTS,
  SPORT_COUNT_WORD,
  isBetaSport,
  sirenOneLiner,
  sportsSentence,
} from "@/lib/siren-facts";

const ROOT = fileURLToPath(new URL("../../..", import.meta.url));

function filesUnder(dir: string, ext: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) return filesUnder(full, ext);
    return full.endsWith(ext) ? [full] : [];
  });
}

/** Every string value in a parsed JSON document. */
function stringsIn(value: unknown): string[] {
  if (typeof value === "string") return [value];
  if (Array.isArray(value)) return value.flatMap(stringsIn);
  if (value && typeof value === "object") return Object.values(value).flatMap(stringsIn);
  return [];
}

const rel = (file: string) => file.slice(ROOT.length).replace(/\\/g, "/");

const MARKETING_STRINGS = filesUnder(join(ROOT, "content/marketing"), ".json").flatMap((file) =>
  stringsIn(JSON.parse(readFileSync(file, "utf8"))).map((text) => ({ file: rel(file), text })),
);

// The public pages' own copy, comments stripped.
const PAGE_SOURCE = [
  "src/app/(marketing)",
  "src/app/help",
  "src/components/marketing",
  "src/components/help",
].flatMap((dir) =>
  filesUnder(join(ROOT, dir), ".tsx").map((file) => ({
    file: rel(file),
    text: readFileSync(file, "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/^\s*\/\/.*$/gm, ""),
  })),
);

const ALL_COPY = [...MARKETING_STRINGS, ...PAGE_SOURCE];

// How copy names each sport.
const MENTIONS: Record<string, RegExp> = {
  afl: /\bAFL\b|aussie rules|australian rules/i,
  netball: /netball/i,
  rugby_league: /rugby league/i,
  rugby_union: /rugby union/i,
  soccer: /soccer|\bfootball \(/i,
  basketball: /basketball/i,
  futsal: /futsal/i,
  hockey: /hockey/i,
  touch: /touch football/i,
  oztag: /oztag/i,
};

const COUNT_WORDS = ["one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten"];
const SPORT_COUNT = /\b(\d+|one|two|three|four|five|six|seven|eight|nine|ten) (?:sports|codes)\b/gi;

describe("Siren facts", () => {
  it("lists every sport in the registry, in its order", () => {
    expect(SIREN_SPORTS.map((s) => s.id)).toEqual(ALL_SPORT_IDS);
  });

  it("names each sport as the registry does", () => {
    for (const sport of SIREN_SPORTS) {
      const cfg = getSportConfig(sport.id);
      expect([cfg.name.toLowerCase(), cfg.shortName.toLowerCase()], sport.id).toContain(
        sport.name.toLowerCase(),
      );
    }
  });

  it("has no sport in beta (they all left it with the ten-sport homepage)", () => {
    expect(SIREN_SPORTS.filter((s) => s.beta).map((s) => s.id)).toEqual([]);
    expect(isBetaSport("soccer")).toBe(false);
    expect(isBetaSport("afl")).toBe(false);
  });

  it("says the sports in one sentence", () => {
    expect(sportsSentence()).toBe(
      "AFL, netball, rugby league, rugby union, football (soccer), basketball, futsal, hockey, touch football and Oztag",
    );
    expect(SPORT_COUNT_WORD).toBe("ten");
    expect(sirenOneLiner()).toContain(sportsSentence());
  });
});

describe("marketing copy agrees with the facts", () => {
  it("found the marketing JSON and the public pages", () => {
    expect(MARKETING_STRINGS.length).toBeGreaterThan(50);
    expect(PAGE_SOURCE.map((p) => p.file)).toContain("src/app/(marketing)/why-siren/page.tsx");
    expect(PAGE_SOURCE.map((p) => p.file)).toContain("src/app/help/faq/page.tsx");
  });

  it("counts the sports in the homepage's facts strip", () => {
    const sports = HOME_CONTENT.trustBand.find((entry) => entry.label.toLowerCase() === "junior sports");
    expect(sports?.stat).toBe(String(SIREN_SPORTS.length));
  });

  // Steve, 10 Nov 2026: where a coach can run lines only or name their
  // own positions, the sport's page says so; where they can't, it doesn't.
  it("says you can set your own positions exactly where a coach can", () => {
    for (const { sport } of MARKETING_SPORTS) {
      const playbook = getSportPlaybook(sport);
      const canSetOwn = getSportConfig(sport).ageGroups.some((ag) => {
        // AFL's zones are on by default to U10 but a coach can turn them off.
        const policy = { ...effectivePolicy(sport, ag.id), zonesEnforced: false };
        return playbook.positionModel(policy, 12).kind === "custom";
      });
      const copy = sportPageCopy(sport);
      const words = [copy.heroSubtitle, ...copy.knows.flatMap((k) => [k.title, k.body])].join(" ");
      expect(/your own positions/i.test(words), `${sport}: copy says own positions`).toBe(canSetOwn);
    }
  });

  it("gives every sport on the public site its own page copy", () => {
    expect(MARKETING_SPORTS.map((s) => s.sport).sort()).toEqual([...ALL_SPORT_IDS].sort());
    for (const { sport } of MARKETING_SPORTS) {
      expect(sportPageCopy(sport).knows, sport).toHaveLength(3);
    }
  });

  it("counts the sports right", () => {
    const wrong = ALL_COPY.flatMap(({ file, text }) =>
      Array.from(text.matchAll(SPORT_COUNT))
        .filter(([, n]) => {
          const count = /^\d+$/.test(n) ? Number(n) : COUNT_WORDS.indexOf(n.toLowerCase()) + 1;
          return count !== SIREN_SPORTS.length;
        })
        .map(([match]) => `${file}: "${match}"`),
    );
    expect(wrong).toEqual([]);
  });

  it("lists every sport whenever it lists several", () => {
    // Naming three or more sports is a list of what Siren covers, so it
    // has to name them all; one or two is a sport's own copy.
    const partial = MARKETING_STRINGS.flatMap(({ file, text }) => {
      const named = Object.keys(MENTIONS).filter((id) => MENTIONS[id].test(text));
      return named.length >= 3 && named.length < SIREN_SPORTS.length
        ? [`${file}: names ${named.join(", ")}: "${text.slice(0, 80)}…"`]
        : [];
    });
    expect(partial).toEqual([]);
  });

  it("never says Siren is for football and netball alone", () => {
    const old = ALL_COPY.filter(({ text }) => /football and netball|AFL, netball or rugby league/i.test(text));
    expect(old.map((c) => c.file)).toEqual([]);
  });

  it("quotes the price's season", () => {
    const stale = ALL_COPY.flatMap(({ file, text }) =>
      Array.from(text.matchAll(/\bfree\b[^.·]*?\b(20\d\d)\b/gi))
        .filter(([, year]) => Number(year) !== PRICE.season)
        .map(([match]) => `${file}: "${match}"`),
    );
    expect(stale).toEqual([]);
    expect(PRICE.line).toContain(String(PRICE.season));
  });

  // Steve, 12 Nov 2026 (Stagehand round 11): the Terms said "free during
  // the current early-access period" while the site said free for the
  // 2026 season. "Make it free for the 2026 season", everywhere.
  it("never calls the price early access, anywhere in the app or its content", () => {
    const everything = [
      ...filesUnder(join(ROOT, "src"), ".tsx"),
      ...filesUnder(join(ROOT, "src"), ".ts").filter((f) => !/[\\/]__tests__[\\/]/.test(f)),
      ...filesUnder(join(ROOT, "content"), ".json"),
      ...filesUnder(join(ROOT, "content"), ".md"),
    ];
    const said = everything.filter((file) => /early[\s-]access/i.test(readFileSync(file, "utf8"))).map(rel);
    expect(said).toEqual([]);
  });

  it("has the Terms give the price as the season's, from the facts", () => {
    const terms = PAGE_SOURCE.find((p) => p.file === "src/app/(marketing)/terms/page.tsx")!.text;
    const price = terms.match(/7\. Price[\s\S]*?<\/Section>/)?.[0] ?? "";
    expect(price).toMatch(/PRICE\.(season|line)/);
    expect(price).not.toMatch(/early|beta|trial/i);
  });
});

// Features the marketing copy described that the app doesn't have,
// found by a copy audit against the code (21 Oct 2026). Each check names
// what the code does instead.
describe("marketing copy only claims what the app does", () => {
  const claims = (pattern: RegExp) =>
    MARKETING_STRINGS.filter(({ text }) => pattern.test(text)).map(({ file, text }) => `${file}: "${text}"`);

  it("shows no fairness score (fairnessScore() feeds tests only; breaks show the rule check)", () => {
    expect(claims(/fairness score/i)).toEqual([]);
  });

  it("imports PlayHQ fixtures, not results (src/lib/playhq.ts reads no scores)", () => {
    expect(claims(/results?\b[^.]*\bsync|sync[^.]*\bresults?\b/i)).toEqual([]);
  });

  it("swaps by tapping two players, not by dragging", () => {
    expect(claims(/\bdrag/i)).toEqual([]);
  });

  it("doesn't badge rugby league with the NRL's trade mark", () => {
    expect(MARKETING_SPORTS.map((s) => s.code)).not.toContain("NRL");
  });
});
