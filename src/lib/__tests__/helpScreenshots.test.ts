// Help screenshots go through next/image, which needs each one's size,
// so src/lib/help/screenshots.ts lists them all with their sizes. This
// keeps that list in step with the folder (a re-captured screenshot at a
// new size fails here), and every page's HelpFigure on a listed file.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { HELP_SCREENSHOTS } from "@/lib/help/screenshots";

const ROOT = fileURLToPath(new URL("../../..", import.meta.url));
const HELP_APP = join(ROOT, "src/app/help");

function pages(dir = HELP_APP): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    return statSync(full).isDirectory() ? pages(full) : name === "page.tsx" ? [full] : [];
  });
}

describe("help screenshots", () => {
  it("lists every PNG in public/help-screenshots, and nothing else", () => {
    const onDisk = readdirSync(join(ROOT, "public/help-screenshots"))
      .filter((f) => f.endsWith(".png"))
      .map((f) => `/help-screenshots/${f}`)
      .sort();
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
    expect(used.length).toBeGreaterThan(20);
    expect(used.filter((src) => !(src in HELP_SCREENSHOTS))).toEqual([]);
  });

  it("has no debug captures", () => {
    expect(Object.keys(HELP_SCREENSHOTS).filter((p) => p.includes("/_"))).toEqual([]);
  });
});
