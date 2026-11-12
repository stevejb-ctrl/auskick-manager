// Help screenshots go through next/image, which needs each one's size,
// so src/lib/help/screenshots.ts lists them all with their sizes. This
// keeps that list in step with the folder (a re-captured screenshot at a
// new size fails here), and every page's HelpFigure on a listed file.
// Each listed file is shown on a page, captured once and kept small.
// The sport hubs' words (and figures) live in src/components/help/sport/,
// their screenshots in public/help-screenshots/<sport>/.
import { createHash } from "node:crypto";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { HELP_SCREENSHOTS } from "@/lib/help/screenshots";
import { SPORT_HELP } from "@/lib/help/sports";

const ROOT = fileURLToPath(new URL("../../..", import.meta.url));
const HELP_APP = join(ROOT, "src/app/help");
const HELP_SPORTS = join(ROOT, "src/components/help/sport");
const SHOTS = join(ROOT, "public/help-screenshots");
const MAX_BYTES = 120 * 1024;

/** The help pages and the sport hubs' content: every file that can show a figure. */
function sources(dir: string, match: (name: string) => boolean): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    return statSync(full).isDirectory() ? sources(full, match) : match(name) ? [full] : [];
  });
}
function pages(): string[] {
  return [...sources(HELP_APP, (n) => n === "page.tsx"), ...sources(HELP_SPORTS, (n) => n.endsWith(".tsx"))];
}

/** Every PNG under public/help-screenshots, sport folders included. */
function pngs(dir = SHOTS, prefix = "/help-screenshots"): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) return pngs(full, `${prefix}/${name}`);
    return name.endsWith(".png") ? [`${prefix}/${name}`] : [];
  });
}

describe("help screenshots", () => {
  it("lists every PNG in public/help-screenshots, and nothing else", () => {
    const onDisk = pngs().sort();
    expect(Object.keys(HELP_SCREENSHOTS).sort()).toEqual(onDisk);
  });

  it("gives each its real size, from the PNG header", () => {
    for (const [path, size] of Object.entries(HELP_SCREENSHOTS)) {
      const png = readFileSync(join(ROOT, "public", path));
      expect({ width: png.readUInt32BE(16), height: png.readUInt32BE(20) }, path).toEqual(size);
    }
  });

  it("is what the help pages show", () => {
    const used = pages().flatMap((file) =>
      Array.from(readFileSync(file, "utf8").matchAll(/src="(\/help-screenshots\/[^"]+)"/g), (m) => m[1]),
    );
    expect(used.length).toBeGreaterThan(70);
    expect(used.filter((src) => !(src in HELP_SCREENSHOTS))).toEqual([]);
  });

  it("shows each one on a help page", () => {
    const used = new Set(
      pages().flatMap((file) =>
        Array.from(readFileSync(file, "utf8").matchAll(/src="(\/help-screenshots\/[^"]+)"/g), (m) => m[1]),
      ),
    );
    expect(Object.keys(HELP_SCREENSHOTS).filter((p) => !used.has(p))).toEqual([]);
  });

  it("captures each screen once", () => {
    const byHash = new Map<string, string[]>();
    for (const path of Object.keys(HELP_SCREENSHOTS)) {
      const hash = createHash("sha1").update(readFileSync(join(ROOT, "public", path))).digest("hex");
      byHash.set(hash, [...(byHash.get(hash) ?? []), path]);
    }
    expect(Array.from(byHash.values()).filter((group) => group.length > 1)).toEqual([]);
  });

  it(`keeps each one under ${MAX_BYTES / 1024} KB`, () => {
    expect(Object.keys(HELP_SCREENSHOTS).filter((p) => statSync(join(ROOT, "public", p)).size > MAX_BYTES)).toEqual([]);
  });

  it("gives every sport hub its live, pairs, scoring, break and full-time shots", () => {
    for (const hub of SPORT_HELP) {
      for (const shot of ["live", "pairs", "scoring", "break", "fulltime"]) {
        expect(Object.keys(HELP_SCREENSHOTS), hub.href).toContain(`/help-screenshots/${hub.sport.slug}/${shot}.png`);
      }
    }
  });

  it("has no debug captures", () => {
    expect(Object.keys(HELP_SCREENSHOTS).filter((p) => p.includes("/_"))).toEqual([]);
  });
});
