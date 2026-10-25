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
import { heroSportsSentence } from "@/lib/marketing/homeContent";
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

  it("marks the six newest sports as beta, and only them", () => {
    expect(SIREN_SPORTS.filter((s) => s.beta).map((s) => s.id)).toEqual([
      "soccer",
      "basketball",
      "futsal",
      "hockey",
      "touch",
      "oztag",
    ]);
    expect(isBetaSport("soccer")).toBe(true);
    expect(isBetaSport("afl")).toBe(false);
  });

  it("says the sports in one sentence, beta ones last", () => {
    expect(sportsSentence()).toBe(
      "AFL, netball, rugby league and rugby union, plus football (soccer), basketball, futsal, hockey, touch football and Oztag in beta",
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

  it("opens the homepage hero with the facts' sports", () => {
    expect(heroSportsSentence()).toBe(`One app, ten sports: junior ${sportsSentence()}.`);
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
