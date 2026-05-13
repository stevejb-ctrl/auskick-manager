// Renders a Siren-branded launch / splash image for the iOS
// Capacitor shell at the three filenames Apple's asset catalog
// expects: splash-2732x2732{,-1,-2}.png. All three are the same
// 2732×2732 pixels — Apple's "1x/2x/3x" tags in Contents.json are
// a Capacitor artifact; the physical pixel size doesn't change.
//
// Run: `node scripts/generate-ios-splash.mjs`
// Output: mobile/ios/App/App/Assets.xcassets/Splash.imageset/
//
// We render via headless Chromium so antialiasing on the dot's
// edge and the wordmark glyphs matches what the user sees in
// the loaded app's header. The bundled font choice is the same
// system stack (-apple-system) the loaded WebView falls back to
// when Geist hasn't loaded yet — the splash and the loaded
// header should visually match within one font weight.

import { chromium } from "playwright";
import { copyFile } from "node:fs/promises";
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

// Canvas is 2732×2732 — iPad Pro 12.9" launch image @ 1x. Capacitor
// scales down for smaller devices. The wordmark sits centered and
// takes ~32% of the canvas width; on a 393pt iPhone screen that
// shows as ~125pt-wide, matching the in-app header at size="lg".
const CANVAS = 2732;
const FONT_SIZE = 280; // ~10% of canvas height — reads at any iPhone size
const DOT_RADIUS = 35; // proportional to font; was 9/36 ratio in the React wordmark
const DOT_GAP = 16;
const DOT_OFFSET_Y = FONT_SIZE * 0.32; // matches the 0.32em margin-top in SirenWordmark.tsx

function html() {
  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <style>
      html, body {
        margin: 0;
        width: ${CANVAS}px;
        height: ${CANVAS}px;
        background: ${WARM};
        display: flex;
        align-items: center;
        justify-content: center;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI",
                     Roboto, Helvetica, Arial, sans-serif;
      }
      .wordmark {
        display: inline-flex;
        align-items: flex-start;
        color: ${INK};
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

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: CANVAS, height: CANVAS } });
await page.setContent(html(), { waitUntil: "networkidle" });

// Measure the dot's actual pixel position in the rendered canvas.
// Computed from the DOM (not our math) so it tracks any font-metric
// drift in the bold sans-serif used in headless Chromium. Mobile
// AppDelegate.swift reads these coordinates to place its halo
// animation directly behind the dot.
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

const primary = join(outDir, "splash-2732x2732.png");
await page.screenshot({ path: primary, omitBackground: false });
await copyFile(primary, join(outDir, "splash-2732x2732-1.png"));
await copyFile(primary, join(outDir, "splash-2732x2732-2.png"));

await browser.close();

console.log(`wrote ${primary} + two duplicates`);
console.log(
  `dot in image: center=(${dotRect.centerX}, ${dotRect.centerY}) radius=${dotRect.radius}`,
);
console.log(
  `  → update AppDelegate.swift dotImagePoint to (${dotRect.centerX}, ${dotRect.centerY})`,
);
console.log(
  `  → update AppDelegate.swift dotImageRadius to ${dotRect.radius}`,
);
