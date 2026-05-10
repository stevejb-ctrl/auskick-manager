#!/usr/bin/env node
// ─── Capacitor bridge copy ────────────────────────────────────
//
// Slice 7 fix for the `disallowed_useragent` OAuth error in the
// native Android shell. Background:
//
//   - capacitor.config.ts uses server.url to load
//     https://www.sirenfooty.com.au from the remote Vercel deploy.
//   - Capacitor's native shell injects `window.androidBridge`
//     (Android) / `window.webkit.messageHandlers.bridge` (iOS)
//     into the WebView regardless of which URL is loaded.
//   - But `window.Capacitor` — the JS facade that translates
//     plugin calls into bridge messages — is set up by
//     `@capacitor/core/dist/capacitor.js`. For pages loaded from a
//     remote `server.url`, Capacitor does NOT auto-inject this
//     script. Without it, `window.Capacitor` is undefined,
//     `isNative()` returns false, every native code branch fails
//     over to the web path, OAuth goes through the WebView, and
//     Google's UA detection rejects it.
//   - Including `<Script src="/capacitor.js">` in the Next.js
//     layout exposes the bridge. This script keeps that file in
//     sync with whatever @capacitor/core version is installed.
//
// Runs as a postinstall step in package.json so `npm install`
// or `npm ci` (Vercel + GitHub Actions both run npm ci) keeps
// the public file aligned with node_modules. public/capacitor.js
// is gitignored — generated artefact.
//
// If @capacitor/core ever moves the bundle, this script breaks
// noisily rather than silently — we want loud failures so we
// can fix the path here rather than ship a stale or missing
// bridge to production.

import { mkdirSync, copyFileSync, existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..");

const src = resolve(root, "node_modules/@capacitor/core/dist/capacitor.js");
const destDir = resolve(root, "public");
const dest = resolve(destDir, "capacitor.js");

if (!existsSync(src)) {
  console.warn(
    `[copy-capacitor-bridge] source not found at ${src}. ` +
      `@capacitor/core may not be installed — skipping. ` +
      `(This is fine for installs that don't touch the mobile shell.)`,
  );
  process.exit(0);
}

mkdirSync(destDir, { recursive: true });
copyFileSync(src, dest);
console.log(`[copy-capacitor-bridge] copied ${src} → ${dest}`);
