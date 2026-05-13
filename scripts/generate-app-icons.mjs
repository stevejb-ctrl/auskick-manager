// Generates the Siren Footy app icon for iOS + Android in one
// pass. Renders via headless Chromium so the halo's alpha falloff
// matches what the user sees in the live app and on the iOS
// splash; pure CSS + SVG, no design tool required.
//
// Run: `node scripts/generate-app-icons.mjs`
//
// Outputs:
//   iOS:
//     mobile/ios/App/App/Assets.xcassets/AppIcon.appiconset/
//       AppIcon-512@2x.png                              1024×1024
//
//   Android (mipmap buckets):
//     mobile/android/app/src/main/res/mipmap-{m,h,x,xx,xxx}hdpi/
//       ic_launcher.png             — opaque, fills frame
//       ic_launcher_round.png       — same (the launcher masks)
//       ic_launcher_foreground.png  — transparent bg, mark only,
//                                     scaled for adaptive icon
//                                     safe zone (66% inner area)
//
// Adaptive-icon background is a flat colour drawable defined in
// mobile/android/app/src/main/res/drawable/ic_launcher_background.xml
// — see that file for the matching #F7F5F1.

import { chromium } from "playwright";
import { mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const iosOut = join(
  __dirname,
  "..",
  "mobile",
  "ios",
  "App",
  "App",
  "Assets.xcassets",
  "AppIcon.appiconset",
);
const androidRes = join(
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
const ALARM = "#D9442D";

// Icon SVG. Three concentric circles: solid alarm-orange dot in the
// centre, a translucent mid halo, a faint outer halo — the in-app
// pulse animation "frozen" mid-flight. Reads as the Siren brand
// mark at every size.
//
// Proportions:
//   - `markPct` is the dot's DIAMETER as a fraction of the canvas.
//   - midR = 1.6× dotR, outerR = 2.4× dotR. The outer halo therefore
//     spans `markPct × 2.4` of the canvas. We size the dot so the
//     outer halo lands at ~78% of the canvas — leaves visible
//     breathing room inside the iOS rounded-rect mask + Android
//     adaptive-icon safe zone.
//
// Alphas:
//   - Dot: fully opaque alarm orange.
//   - Mid: 0.20 — clearly a halo, not the dot itself.
//   - Outer: 0.06 — barely a tint, just a soft glow.
//   Both tuned against the warm cream bg so the ring edges are
//   visible but not solid.
function iconHtml({ size, markPct, transparent }) {
  const dotR = Math.round((size * markPct) / 2);
  const midR = Math.round(dotR * 1.6);
  const outerR = Math.round(dotR * 2.4);
  const bg = transparent ? "transparent" : WARM;
  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <style>
      html, body {
        margin: 0;
        width: ${size}px;
        height: ${size}px;
        background: ${bg};
      }
      svg {
        display: block;
        width: 100%;
        height: 100%;
      }
    </style>
  </head>
  <body>
    <svg viewBox="0 0 ${size} ${size}" xmlns="http://www.w3.org/2000/svg">
      <circle cx="${size / 2}" cy="${size / 2}" r="${outerR}"
              fill="${ALARM}" opacity="0.06" />
      <circle cx="${size / 2}" cy="${size / 2}" r="${midR}"
              fill="${ALARM}" opacity="0.2" />
      <circle cx="${size / 2}" cy="${size / 2}" r="${dotR}"
              fill="${ALARM}" />
    </svg>
  </body>
</html>`;
}

async function render(page, { size, markPct, transparent }) {
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(iconHtml({ size, markPct, transparent }), {
    waitUntil: "networkidle",
  });
  return page.screenshot({ omitBackground: transparent });
}

const browser = await chromium.launch();
const page = await browser.newPage();

// ─── iOS ───────────────────────────────────────────────────────
// Apple's modern asset catalog format: one 1024×1024 PNG. Xcode
// generates all the down-scaled sizes (60pt @1x/2x/3x, marketing,
// notifications, settings, etc.) at build time.
// markPct 0.32 → dot 32% of canvas, outer halo 0.32×2.4 = 77% of
// canvas. Leaves ~12% breathing room each side inside the iOS
// rounded-rect mask. The dot is large enough to read at the smallest
// system contexts (Settings list 29pt @1x).
const ios = await render(page, {
  size: 1024,
  markPct: 0.32,
  transparent: false,
});
await writeFile(join(iosOut, "AppIcon-512@2x.png"), ios);
console.log("iOS: AppIcon-512@2x.png (1024×1024)");

// ─── Android per-density ──────────────────────────────────────
// Density buckets follow Material guidelines:
//   mdpi   = 1.0× → 48dp = 48px launcher, 108px adaptive fg
//   hdpi   = 1.5× → 72px / 162px
//   xhdpi  = 2.0× → 96px / 216px
//   xxhdpi = 3.0× → 144px / 324px
//   xxxhdpi = 4.0× → 192px / 432px
//
// `ic_launcher` and `ic_launcher_round` are the full opaque icon
// at the launcher size — used on Android <8 or when the launcher
// doesn't apply an adaptive mask. `ic_launcher_foreground` is the
// transparent mark-only layer composited with the XML background
// drawable to form an adaptive icon on Android 8+.
const densities = [
  { name: "mdpi", launcher: 48, foreground: 108 },
  { name: "hdpi", launcher: 72, foreground: 162 },
  { name: "xhdpi", launcher: 96, foreground: 216 },
  { name: "xxhdpi", launcher: 144, foreground: 324 },
  { name: "xxxhdpi", launcher: 192, foreground: 432 },
];

for (const { name, launcher, foreground } of densities) {
  const dir = join(androidRes, `mipmap-${name}`);
  await mkdir(dir, { recursive: true });

  // Opaque launcher icon (legacy + non-adaptive fallback). Same
  // proportions as the iOS icon.
  const flat = await render(page, {
    size: launcher,
    markPct: 0.32,
    transparent: false,
  });
  await writeFile(join(dir, "ic_launcher.png"), flat);
  await writeFile(join(dir, "ic_launcher_round.png"), flat);

  // Adaptive icon foreground. The Android launcher only renders the
  // central 66% of the foreground PNG inside its adaptive mask, so
  // the mark needs to fit inside that safe zone — markPct of 0.20
  // means dot diameter is 20% of the foreground canvas, outer halo
  // 48%, which lands well inside the visible 66%.
  const fg = await render(page, {
    size: foreground,
    markPct: 0.2,
    transparent: true,
  });
  await writeFile(join(dir, "ic_launcher_foreground.png"), fg);

  console.log(
    `Android: mipmap-${name}/ ic_launcher{,_round,_foreground}.png`,
  );
}

await browser.close();

console.log("done.");
