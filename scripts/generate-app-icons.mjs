// Generates the Siren Footy app icon for iOS + Android in one
// pass. Renders the brand lockup — a bold Geist Black "S" next to
// the alarm-orange pulse dot — via headless Chromium, so the
// glyph and dot proportions match the in-app SirenWordmark
// component exactly.
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
import { mkdir, readFile, writeFile } from "node:fs/promises";
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
const INK = "#141613";
const ALARM = "#D9442D";

// Load Geist Black (weight 900) and inline as base64 inside the
// page CSS. Going through a data: URL means the headless page is
// self-contained — no file:// base URL gymnastics — and we know
// the glyph rendered matches what the user sees in the app
// header (which also uses GeistSans).
const geistBlackPath = join(
  __dirname,
  "..",
  "node_modules",
  "geist",
  "dist",
  "fonts",
  "geist-sans",
  "Geist-Black.woff2",
);
const geistBlackBase64 = (await readFile(geistBlackPath)).toString("base64");
const fontFaceCss = `
  @font-face {
    font-family: "Geist";
    font-weight: 900;
    font-style: normal;
    font-display: block;
    src: url(data:font/woff2;base64,${geistBlackBase64}) format("woff2");
  }
`;

// Icon lockup: a bold "S" + the alarm-orange pulse dot — the same
// horizontal lockup the SirenWordmark renders, cropped to the
// initial letter so it reads at app-icon sizes. The dot's vertical
// offset (margin-top 0.32em) and gap (0.04em) mirror the brand
// component exactly.
//
// Sizing:
//   `scale` is the font-size as a fraction of the canvas. The "S"
//   cap height is ~0.72em, and line-height 0.9 makes the lockup
//   bounding box ~0.9em tall × ~(glyph + gap + dot) wide. At
//   scale 0.72, the lockup fills ~65% of canvas height — leaving
//   ample breathing room inside the iOS rounded-rect mask and
//   the Android adaptive-icon safe zone.
//
// `transparent` swaps the warm cream background for transparent
// (used for the Android adaptive foreground layer, which sits on
// top of the flat-cream drawable background).
function iconHtml({ size, scale, transparent }) {
  const fontSize = Math.round(size * scale);
  const dotSize = Math.round(fontSize * 0.25); // diameter — matches SirenWordmark ratio
  const gap = Math.round(fontSize * 0.04);
  const bg = transparent ? "transparent" : WARM;
  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <style>
      ${fontFaceCss}
      html, body {
        margin: 0;
        width: ${size}px;
        height: ${size}px;
        background: ${bg};
        display: flex;
        align-items: center;
        justify-content: center;
        font-family: "Geist", -apple-system, BlinkMacSystemFont, "Segoe UI",
                     Roboto, Helvetica, Arial, sans-serif;
      }
      .lockup {
        display: inline-flex;
        align-items: flex-start;
        color: ${INK};
        font-weight: 900;
        font-size: ${fontSize}px;
        line-height: 0.9;
        letter-spacing: -0.05em;
        gap: ${gap}px;
      }
      .dot {
        display: inline-block;
        width: ${dotSize}px;
        height: ${dotSize}px;
        border-radius: 50%;
        background: ${ALARM};
        margin-top: 0.32em;
        flex-shrink: 0;
      }
    </style>
  </head>
  <body>
    <span class="lockup">
      <span>S</span>
      <span class="dot"></span>
    </span>
  </body>
</html>`;
}

async function render(page, { size, scale, transparent }) {
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(iconHtml({ size, scale, transparent }), {
    waitUntil: "networkidle",
  });
  // Belt-and-braces: even with networkidle the inlined font can
  // race the screenshot. document.fonts.ready resolves once the
  // browser has finished decoding every @font-face referenced by
  // the document — guarantees "S" renders in Geist Black, not the
  // fallback.
  await page.evaluate(() => document.fonts.ready);
  return page.screenshot({ omitBackground: transparent });
}

const browser = await chromium.launch();
const page = await browser.newPage();

// ─── iOS ───────────────────────────────────────────────────────
// Apple's modern asset catalog format: one 1024×1024 PNG. Xcode
// generates all the down-scaled sizes (60pt @1x/2x/3x, marketing,
// notifications, settings, etc.) at build time.
// scale 0.72 → "S" cap height ~52% of canvas; full lockup
// (S + dot) fills ~65% canvas height × ~60% width. Plenty of
// breathing room inside the iOS rounded-rect mask while still
// reading at the smallest system contexts (Settings list 29pt).
const ios = await render(page, {
  size: 1024,
  scale: 0.72,
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
    scale: 0.72,
    transparent: false,
  });
  await writeFile(join(dir, "ic_launcher.png"), flat);
  await writeFile(join(dir, "ic_launcher_round.png"), flat);

  // Adaptive icon foreground. The Android launcher only renders
  // the central 66% of the foreground PNG inside its adaptive
  // mask, so the lockup needs to fit inside that safe zone. scale
  // 0.45 puts the lockup at ~40% of the foreground canvas —
  // visible and centred when masked.
  const fg = await render(page, {
    size: foreground,
    scale: 0.45,
    transparent: true,
  });
  await writeFile(join(dir, "ic_launcher_foreground.png"), fg);

  console.log(
    `Android: mipmap-${name}/ ic_launcher{,_round,_foreground}.png`,
  );
}

await browser.close();

console.log("done.");
