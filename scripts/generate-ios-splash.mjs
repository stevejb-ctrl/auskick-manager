// Renders Siren-branded launch / splash images for the iOS
// Capacitor shell at the SIX filenames the asset catalog's
// Contents.json actually references:
//
//   Default@{1,2,3}x~universal~anyany.png        (light mode)
//   Default@{1,2,3}x~universal~anyany-dark.png   (dark mode)
//
// Steve 2026-05-20: earlier rev of this script wrote to
// `splash-2732x2732{,-1,-2}.png` — filenames that aren't
// referenced by the imageset Contents.json. iOS happily
// shipped the orphan PNGs in the bundle while loading the
// Default*.png S-icon stubs left over from an earlier asset
// pass. End-to-end visible bug: cold-start splash showed the
// "S•" app icon at thumb size in the middle of the screen,
// not the full "Siren•" wordmark. This rewrite targets the
// correct filenames and also produces a proper dark variant
// (INK background, WARM glyphs) instead of duplicating the
// light asset.
//
// Run: `node scripts/generate-ios-splash.mjs`
// Output: mobile/ios/App/App/Assets.xcassets/Splash.imageset/
//
// Headless Chromium so glyph antialiasing matches what the
// WebView shows once the app has loaded. The bundled font
// choice is the system stack (-apple-system) the loaded
// WebView falls back to before Geist is downloaded — splash
// and the loaded header read within one font weight.

import { chromium } from "playwright";
import { unlink } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const outDir = join(
  __dirname,
  "..",
  "mobile",
  "ios",
  "App",
  "App",
  "Assets.xcassets",
  "Splash.imageset",
);

const WARM = "#F7F5F1";
const INK = "#141613";
const ALARM = "#D9442D";

// Canvas is 2732×2732 — iPad Pro 12.9" launch image @ 1x.
// Capacitor scales down for smaller devices via scaleAspectFill.
// The wordmark sits centered and takes ~32% of the canvas width;
// on a 393pt iPhone screen that shows as ~125pt-wide, matching
// the in-app header at size="lg".
const CANVAS = 2732;
const FONT_SIZE = 280; // ~10% of canvas height — reads at any iPhone size
const DOT_RADIUS = 35; // proportional to font; was 9/36 ratio in the React wordmark
const DOT_GAP = 16;
const DOT_OFFSET_Y = FONT_SIZE * 0.32; // matches the 0.32em margin-top in SirenWordmark.tsx

function html({ bg, fg }) {
  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <style>
      html, body {
        margin: 0;
        width: ${CANVAS}px;
        height: ${CANVAS}px;
        background: ${bg};
        display: flex;
        align-items: center;
        justify-content: center;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI",
                     Roboto, Helvetica, Arial, sans-serif;
      }
      .wordmark {
        display: inline-flex;
        align-items: flex-start;
        color: ${fg};
        font-weight: 900;
        font-size: ${FONT_SIZE}px;
        line-height: 0.9;
        letter-spacing: -0.05em;
        gap: ${DOT_GAP}px;
      }
      .dot {
        display: inline-block;
        width: ${DOT_RADIUS * 2}px;
        height: ${DOT_RADIUS * 2}px;
        border-radius: 50%;
        background: ${ALARM};
        margin-top: ${DOT_OFFSET_Y}px;
        flex-shrink: 0;
      }
    </style>
  </head>
  <body>
    <span class="wordmark">
      <span>Siren</span>
      <span class="dot"></span>
    </span>
  </body>
</html>`;
}

// Filenames referenced by Splash.imageset/Contents.json. iOS
// resolves the correct one based on device density (1x/2x/3x)
// and current appearance (light/dark).
const LIGHT_FILES = [
  "Default@1x~universal~anyany.png",
  "Default@2x~universal~anyany.png",
  "Default@3x~universal~anyany.png",
];
const DARK_FILES = [
  "Default@1x~universal~anyany-dark.png",
  "Default@2x~universal~anyany-dark.png",
  "Default@3x~universal~anyany-dark.png",
];

// Orphan PNGs from the previous version of this script. They're
// not referenced by Contents.json and don't ship in the bundle
// (Xcode's asset compiler only packages files matched in the
// imageset manifest), but they bloat git history every time we
// regenerate. Delete on each run.
const ORPHANS = [
  "splash-2732x2732.png",
  "splash-2732x2732-1.png",
  "splash-2732x2732-2.png",
];

const browser = await chromium.launch();

async function renderTo(filenames, { bg, fg }, label) {
  const page = await browser.newPage({ viewport: { width: CANVAS, height: CANVAS } });
  await page.setContent(html({ bg, fg }), { waitUntil: "networkidle" });

  // Measure the dot's actual pixel position in the rendered
  // canvas. Computed from the DOM (not our math) so it tracks
  // any font-metric drift in the bold sans-serif used in
  // headless Chromium. Mobile AppDelegate.swift reads these
  // coordinates to place its halo animation directly behind
  // the dot.
  const dotRect = await page.evaluate(() => {
    const dot = document.querySelector(".dot");
    if (!dot) return null;
    const r = dot.getBoundingClientRect();
    return {
      centerX: Math.round(r.x + r.width / 2),
      centerY: Math.round(r.y + r.height / 2),
      radius: Math.round(r.width / 2),
    };
  });

  // Write the primary file, then copy via re-screenshot to the
  // other two density tiers. The 1x/2x/3x distinction is purely
  // an Xcode asset-catalog hint — the physical PNG pixel size
  // doesn't differ between them. We write three identical files
  // because Contents.json lists three separate entries.
  for (const name of filenames) {
    const path = join(outDir, name);
    await page.screenshot({ path, omitBackground: false });
    console.log(`✓ ${label.padEnd(5)} ${name}`);
  }

  await page.close();
  return dotRect;
}

const lightDotRect = await renderTo(LIGHT_FILES, { bg: WARM, fg: INK }, "LIGHT");
await renderTo(DARK_FILES, { bg: INK, fg: WARM }, "DARK");

// Best-effort cleanup of the orphan files from the old generator
// output. If they don't exist (already cleaned up, or a fresh
// imageset), unlink silently no-ops via the catch.
for (const orphan of ORPHANS) {
  try {
    await unlink(join(outDir, orphan));
    console.log(`✗ orphan removed: ${orphan}`);
  } catch {
    /* not present — fine */
  }
}

await browser.close();

console.log("");
console.log(
  `Light wordmark dot center=(${lightDotRect.centerX}, ${lightDotRect.centerY}) radius=${lightDotRect.radius}`,
);
console.log(
  `  → AppDelegate.swift dotImagePoint should be (${lightDotRect.centerX}, ${lightDotRect.centerY})`,
);
console.log(
  `  → AppDelegate.swift dotImageRadius should be ${lightDotRect.radius}`,
);
