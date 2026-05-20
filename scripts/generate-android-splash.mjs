// Renders Siren-branded splash PNGs for the Android Capacitor
// shell across every drawable density bucket (mdpi → xxxhdpi,
// portrait + landscape, plus the parallel -night variants).
//
// Why this exists: the auto-generated Capacitor splashes shipped
// with just the "S•" app icon on a warm background. The iOS
// splash uses the full "Siren•" wordmark via
// scripts/generate-ios-splash.mjs, but Android was never wired
// to the same generator — so the launch surfaces drifted apart.
// This script restores parity. Steve 2026-05-20.
//
// Run: `node scripts/generate-android-splash.mjs`
// Output: mobile/android/app/src/main/res/drawable*/splash.png
//
// Approach: one headless Chromium render per (width, height)
// pair, using the same HTML wordmark fragment as iOS so glyph
// shapes match within a system-font weight. Font size scales
// from `min(width, height)` so portrait + landscape buckets at
// the same density produce the same visual wordmark size.

import { chromium } from "playwright";
import { mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const androidResDir = join(
  __dirname,
  "..",
  "mobile",
  "android",
  "app",
  "src",
  "main",
  "res",
);

const WARM = "#F7F5F1";
const INK = "#141613";
const ALARM = "#D9442D";

// Every (folder, width, height) tuple Capacitor expects. Sizes
// match the existing PNGs (read via PNG header inspection) so
// nothing else in the Android shell needs touching.
const VARIANTS = [
  // Portrait
  { folder: "drawable",                   width: 320,  height: 480 },
  { folder: "drawable-port-ldpi",         width: 240,  height: 320 },
  { folder: "drawable-port-mdpi",         width: 320,  height: 480 },
  { folder: "drawable-port-hdpi",         width: 480,  height: 800 },
  { folder: "drawable-port-xhdpi",        width: 720,  height: 1280 },
  { folder: "drawable-port-xxhdpi",       width: 960,  height: 1600 },
  { folder: "drawable-port-xxxhdpi",      width: 1280, height: 1920 },
  // Landscape
  { folder: "drawable-land-ldpi",         width: 320,  height: 240 },
  { folder: "drawable-land-mdpi",         width: 480,  height: 320 },
  { folder: "drawable-land-hdpi",         width: 800,  height: 480 },
  { folder: "drawable-land-xhdpi",        width: 1280, height: 720 },
  { folder: "drawable-land-xxhdpi",       width: 1600, height: 960 },
  { folder: "drawable-land-xxxhdpi",      width: 1920, height: 1280 },
  // Night-mode parallels — same theme as day (warm bg + ink
  // wordmark) to match the original Capacitor template. If
  // Steve later wants a dark-mode splash, swap WARM↔INK for
  // these folders only.
  { folder: "drawable-night",             width: 320,  height: 240 },
  { folder: "drawable-port-night-ldpi",   width: 240,  height: 320 },
  { folder: "drawable-port-night-mdpi",   width: 320,  height: 480 },
  { folder: "drawable-port-night-hdpi",   width: 480,  height: 800 },
  { folder: "drawable-port-night-xhdpi",  width: 720,  height: 1280 },
  { folder: "drawable-port-night-xxhdpi", width: 960,  height: 1600 },
  { folder: "drawable-port-night-xxxhdpi",width: 1280, height: 1920 },
  { folder: "drawable-land-night-ldpi",   width: 320,  height: 240 },
  { folder: "drawable-land-night-mdpi",   width: 480,  height: 320 },
  { folder: "drawable-land-night-hdpi",   width: 800,  height: 480 },
  { folder: "drawable-land-night-xhdpi",  width: 1280, height: 720 },
  { folder: "drawable-land-night-xxhdpi", width: 1600, height: 960 },
  { folder: "drawable-land-night-xxxhdpi",width: 1920, height: 1280 },
];

// On the iOS splash, font-size=280 on a 2732 canvas, so the
// wordmark glyphs occupy about 10% of the canvas's shorter
// dimension. We mirror that ratio here so portrait + landscape
// buckets at the same density bucket print the wordmark at
// equivalent on-screen sizes once the device cropping is
// applied. Anchor on min(w,h) since the splash is centered
// and crop-to-fit lops off the long edge first.
function fontSizeFor(width, height) {
  const base = Math.min(width, height);
  // Slightly larger ratio than iOS (0.16 vs 0.10) because the
  // Android splash is shown at the canvas's native size (not
  // letterboxed inside a 2732×2732 frame), so the wordmark
  // needs to be proportionally bigger to read at the same
  // physical size on screen.
  return Math.round(base * 0.16);
}

function html(width, height) {
  const fontSize = fontSizeFor(width, height);
  // SirenWordmark.tsx-equivalent metrics: dot is ~9/36 of the
  // glyph height, gap is ~1/16, top offset is 0.32em (puts the
  // dot vertically just below the cap line so it reads as a
  // period dot).
  const dotRadius = Math.max(2, Math.round(fontSize * 0.125));
  const dotGap = Math.max(2, Math.round(fontSize * 0.05));
  const dotOffsetY = Math.round(fontSize * 0.32);
  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <style>
      html, body {
        margin: 0;
        width: ${width}px;
        height: ${height}px;
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
        font-size: ${fontSize}px;
        line-height: 0.9;
        letter-spacing: -0.05em;
        gap: ${dotGap}px;
      }
      .dot {
        display: inline-block;
        width: ${dotRadius * 2}px;
        height: ${dotRadius * 2}px;
        border-radius: 50%;
        background: ${ALARM};
        margin-top: ${dotOffsetY}px;
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

for (const { folder, width, height } of VARIANTS) {
  const folderPath = join(androidResDir, folder);
  await mkdir(folderPath, { recursive: true });
  const outPath = join(folderPath, "splash.png");

  const page = await browser.newPage({ viewport: { width, height } });
  await page.setContent(html(width, height), { waitUntil: "networkidle" });
  await page.screenshot({ path: outPath, omitBackground: false });
  await page.close();

  console.log(`✓ ${folder.padEnd(28)} ${width}×${height}  →  ${outPath}`);
}

await browser.close();
console.log(`\nWrote ${VARIANTS.length} Android splash PNGs.`);
