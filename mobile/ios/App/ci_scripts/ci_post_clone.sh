#!/bin/sh
# ci_post_clone.sh — Xcode Cloud post-clone hook.
#
# Why this exists:
#   Xcode Cloud clones the repo and runs xcodebuild straight away.
#   It does NOT run `npm install` anywhere. But the iOS project's
#   Swift Package Manager manifest (CapApp-SPM/Package.swift)
#   references the Capacitor packages via local file paths:
#
#     .package(name: "CapacitorApp",
#              path: "../../../node_modules/@capacitor/app")
#
#   i.e. it expects `mobile/node_modules/@capacitor/*` to exist on
#   disk. Without those files SPM resolution fails with the error
#   Steve saw:
#
#     xcodebuild: error: Could not resolve package dependencies:
#     the package at '.../mobile/node_modules/@capacitor/network'
#     cannot be accessed
#
#   This script installs Node + runs `npm ci` in `mobile/` so the
#   packages are on disk by the time xcodebuild starts.
#
# Location:
#   Xcode Cloud looks for `ci_scripts/ci_post_clone.sh` adjacent to
#   the Xcode project (here: mobile/ios/App/App.xcodeproj) OR at
#   the repository root. Adjacent is the convention Capacitor
#   recommends.

set -e

# Install Node via Homebrew. Xcode Cloud's macOS image ships with
# brew but not Node. Pinning to 20 matches the web CI (Node 22 is
# also fine; 20 is the LTS Capacitor 8 documents against).
echo "ci_post_clone: installing Node..."
brew install node@20
brew link --overwrite --force node@20

# Install Capacitor deps in `mobile/`. `npm ci` (not `npm install`)
# for a clean, package-lock.json-reproducible install. This is what
# populates mobile/node_modules/@capacitor/* which the SPM
# Package.swift references via "../../../node_modules/...".
echo "ci_post_clone: installing mobile deps..."
cd "$CI_PRIMARY_REPOSITORY_PATH/mobile"
npm ci

# `cap sync ios` regenerates capacitor.config.json + copies plugin
# native code into the iOS project. Safe to run on every build;
# idempotent if the project is already in sync.
echo "ci_post_clone: running cap sync ios..."
npx cap sync ios

echo "ci_post_clone: done."
