// ─── Mobile version bumper ────────────────────────────────────
// Bumps iOS + Android version numbers in lockstep so the next
// App Store / Play Store submission picks up a fresh version
// train. Mirrors the one-shot edit Steve did manually for the
// 1.0 → 1.0.1 cutover (2026-05-17) — first App Store submission
// after train 1.0 closed.
//
// What it touches:
//   - mobile/ios/App/App.xcodeproj/project.pbxproj
//       MARKETING_VERSION         (CFBundleShortVersionString)
//       CURRENT_PROJECT_VERSION   (CFBundleVersion / build #)
//   - mobile/android/app/build.gradle
//       versionName               (user-facing string)
//       versionCode               (integer, monotonic for Play)
//
// Usage:
//   node scripts/bump-mobile-version.mjs --version=1.0.2
//   node scripts/bump-mobile-version.mjs --version=1.1.0 --build=200
//   node scripts/bump-mobile-version.mjs --patch      # 1.0.1 → 1.0.2
//   node scripts/bump-mobile-version.mjs --minor      # 1.0.1 → 1.1.0
//   node scripts/bump-mobile-version.mjs --major      # 1.0.1 → 2.0.0
//
// If --build is omitted, the iOS CURRENT_PROJECT_VERSION + the
// Android versionCode are both auto-incremented by one from their
// current values. Both platforms get the SAME integer so the two
// builds can be referenced together ("build 174" means iOS 174
// AND Android 174).
//
// Reads the current values from the files so the script never
// drifts from source of truth. Prints a unified diff-ish summary
// + reminds you to commit + run `cap sync` before archiving.

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, "..");
const IOS_PBXPROJ = resolve(
  repoRoot,
  "mobile/ios/App/App.xcodeproj/project.pbxproj",
);
const ANDROID_GRADLE = resolve(repoRoot, "mobile/android/app/build.gradle");

function flag(name, defaultValue) {
  const arg = process.argv.find((a) => a.startsWith(`--${name}=`));
  if (arg) return arg.slice(name.length + 3);
  return process.argv.includes(`--${name}`) ? true : defaultValue;
}

function readCurrent() {
  const pbx = readFileSync(IOS_PBXPROJ, "utf8");
  const gradle = readFileSync(ANDROID_GRADLE, "utf8");
  const iosVersion = pbx.match(/MARKETING_VERSION = ([^;]+);/)?.[1]?.trim();
  const iosBuild = parseInt(
    pbx.match(/CURRENT_PROJECT_VERSION = (\d+);/)?.[1] ?? "0",
    10,
  );
  const androidName = gradle.match(/versionName "([^"]+)"/)?.[1];
  const androidCode = parseInt(
    gradle.match(/versionCode (\d+)/)?.[1] ?? "0",
    10,
  );
  return { iosVersion, iosBuild, androidName, androidCode, pbx, gradle };
}

function bumpSemver(current, kind) {
  const parts = current.split(".").map((p) => parseInt(p, 10));
  while (parts.length < 3) parts.push(0);
  if (kind === "major") return `${parts[0] + 1}.0.0`;
  if (kind === "minor") return `${parts[0]}.${parts[1] + 1}.0`;
  return `${parts[0]}.${parts[1]}.${parts[2] + 1}`;
}

function main() {
  if (!existsSync(IOS_PBXPROJ) || !existsSync(ANDROID_GRADLE)) {
    console.error("Could not find iOS pbxproj or Android build.gradle. Run from repo root?");
    process.exit(1);
  }

  const current = readCurrent();
  const explicitVersion = flag("version", null);
  const isPatch = flag("patch", false);
  const isMinor = flag("minor", false);
  const isMajor = flag("major", false);

  let nextVersion;
  if (explicitVersion) {
    nextVersion = explicitVersion;
  } else if (isMajor) {
    nextVersion = bumpSemver(current.iosVersion ?? "1.0.0", "major");
  } else if (isMinor) {
    nextVersion = bumpSemver(current.iosVersion ?? "1.0.0", "minor");
  } else if (isPatch) {
    nextVersion = bumpSemver(current.iosVersion ?? "1.0.0", "patch");
  } else {
    console.error(
      "Need --version=X.Y.Z OR one of --patch / --minor / --major",
    );
    console.error(`Current: iOS ${current.iosVersion} (build ${current.iosBuild}), Android ${current.androidName} (code ${current.androidCode})`);
    process.exit(1);
  }

  // Build number — both platforms get the SAME integer for easy
  // cross-referencing. Caller can override via --build=N; default
  // is "max of the two current values + 1".
  const explicitBuild = flag("build", null);
  const nextBuild = explicitBuild
    ? parseInt(explicitBuild, 10)
    : Math.max(current.iosBuild, current.androidCode) + 1;

  if (!/^\d+\.\d+(\.\d+)?$/.test(nextVersion)) {
    console.error(`Invalid version "${nextVersion}" — must be X.Y or X.Y.Z`);
    process.exit(1);
  }
  if (!Number.isFinite(nextBuild) || nextBuild <= 0) {
    console.error(`Invalid build number "${nextBuild}"`);
    process.exit(1);
  }

  // Apply iOS pbxproj changes — replaces ALL occurrences (Debug +
  // Release both have the same setting; if Xcode adds extra
  // configurations in future, they all bump together).
  let pbx = current.pbx;
  pbx = pbx.replace(
    /MARKETING_VERSION = [^;]+;/g,
    `MARKETING_VERSION = ${nextVersion};`,
  );
  pbx = pbx.replace(
    /CURRENT_PROJECT_VERSION = \d+;/g,
    `CURRENT_PROJECT_VERSION = ${nextBuild};`,
  );
  writeFileSync(IOS_PBXPROJ, pbx);

  let gradle = current.gradle;
  gradle = gradle.replace(
    /versionCode \d+/,
    `versionCode ${nextBuild}`,
  );
  gradle = gradle.replace(
    /versionName "[^"]+"/,
    `versionName "${nextVersion}"`,
  );
  writeFileSync(ANDROID_GRADLE, gradle);

  console.log("✓ Bumped mobile versions:");
  console.log(`  iOS     MARKETING_VERSION:       ${current.iosVersion} → ${nextVersion}`);
  console.log(`  iOS     CURRENT_PROJECT_VERSION: ${current.iosBuild} → ${nextBuild}`);
  console.log(`  Android versionName:             ${current.androidName} → ${nextVersion}`);
  console.log(`  Android versionCode:             ${current.androidCode} → ${nextBuild}`);
  console.log("");
  console.log("Next steps:");
  console.log(`  1. git add mobile && git commit -m "Bump mobile to ${nextVersion} (build ${nextBuild})"`);
  console.log(`  2. cd mobile && npx cap sync   # propagates www/ + plugin registry`);
  console.log(`  3. open ios / android in Xcode / Android Studio and archive / upload as usual`);
}

main();
