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
#   disk. Without those files SPM resolution fails. This script
#   installs Node deps in `mobile/` so the packages are on disk
#   by the time xcodebuild starts.
#
# Location:
#   Xcode Cloud looks for `ci_scripts/ci_post_clone.sh` adjacent to
#   the Xcode project (mobile/ios/App/App.xcodeproj) or at the
#   repo root. Adjacent is the Capacitor-recommended convention.

set -e

# Node 22 is required — Capacitor CLI 8.3+ enforces
# `engines.node >= 22.0.0` and aborts hard when invoked under
# Node 20. The Xcode Cloud image still ships Node 20 by default,
# so we install 22 alongside and force-link it onto PATH so
# `node` and `npm` resolve to it.
echo "ci_post_clone: installing Node 22..."
brew install node@22
brew link --overwrite --force node@22

echo "ci_post_clone: node=$(node --version) npm=$(npm --version)"

# Install Capacitor deps in `mobile/`. `npm ci` is reproducible
# from package-lock.json — populates mobile/node_modules/@capacitor/*
# which CapApp-SPM/Package.swift references.
echo "ci_post_clone: installing mobile deps..."
cd "$CI_PRIMARY_REPOSITORY_PATH/mobile"
npm ci

# `cap sync ios` regenerates capacitor.config.json + copies plugin
# native code into the iOS project. Idempotent on re-runs.
echo "ci_post_clone: running cap sync ios..."
npx cap sync ios

echo "ci_post_clone: done."
