// Renders the Siren pulse-mark at fixed sizes as PNGs, for use as the
// Google OAuth consent screen logo (120x120) and higher-res variants.
//
// Run: `node scripts/generate-logo.mjs`
// Output: public/siren-logo-120.png, public/siren-logo-512.png
//
// We render the mark via headless Chromium so antialiasing + halo
// blending match what the user sees in the app header.

import { chromium } from "playwright";
import { mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const outDir = join(__dirname, "..", "public");

const WARM = "#F7F5F1";
const ALARM = "#D63B2A";

// Mark takes ~68% of the canvas; halo sits inside that; solid dot is
// 48% of the halo's diameter. Matches PulseMark.tsx's ratio.
function svgFor(size) {
  const cx = size / 2;
  const cy = size / 2;
  const haloR = size * 0.34;         // 68% diameter / 2
  const dotR = haloR * 0.48;         // 48% of halo diameter

  return `
    <!doctype html>
    <html>
      <head>
        <meta charset="utf-8" />
        <style>
          html, body { margin: 0; padding: 0; background: ${WARM}; }
          body { width: ${size}px; height: ${size}px; }
          svg { display: block; }
        </style>
      </head>
      <body>
        <svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" xmlns="http://www.w3.org/2000/svg">
          <!-- Outer halo — 22% opacity, same colour as the dot -->
          <circle cx="${cx}" cy="${cy}" r="${haloR}" fill="${ALARM}" fill-opacity="0.22" />
          <!-- Solid centre dot -->
          <circle cx="${cx}" cy="${cy}" r="${dotR}" fill="${ALARM}" />
        </svg>
      </body>
    </html>
  `;
}

async function render(size, outPath) {
  const browser = await chromium.launch();
  const context = await browser.newContext({
    viewport: { width: size, height: size },
    deviceScaleFactor: 1,
  });
  const page = await context.newPage();
  await page.setContent(svgFor(size));
  await page.screenshot({ path: outPath, omitBackground: false, type: "png" });
  await browser.close();
  console.log(`wrote ${outPath} (${size}x${size})`);
}

await mkdir(outDir, { recursive: true });
await render(120, join(outDir, "siren-logo-120.png"));
await render(512, join(outDir, "siren-logo-512.png"));
