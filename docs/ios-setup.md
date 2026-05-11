# iOS first-time setup

Click-by-click walkthrough for scaffolding the Capacitor iOS project
on a Mac (cloud Mac or local) and running it in the iOS Simulator.
End state: working iOS build, committed `mobile/ios/` directory, and
confidence that slices 1-7 work on iOS the same way they do on
Android.

> Push notifications + TestFlight are separate docs. Don't try to do
> everything in one session — get the simulator working first, then
> branch out.

## Prereqs

Verify before you start. All from a Mac Terminal.

```bash
xcrun --version           # Should print something like "xcrun version 64.x"
xcodebuild -version       # Should print Xcode 16.x or higher
gem --version             # Ruby is preinstalled on macOS; needed for CocoaPods
```

If `xcrun` says it can't find tools, run `xcode-select --install` or
launch Xcode once from the Applications folder to accept the licence.

If `xcodebuild` is older than 16, update Xcode from the App Store —
Capacitor 8 needs the iOS 18 SDK that ships with Xcode 16+.

## Step 1 — Clone the repo

```bash
git clone https://github.com/stevejb-ctrl/auskick-manager.git ~/siren
cd ~/siren
git config user.email "hello@tribebikes.com.au"
git config user.name "Steve"
```

Your GitHub credentials will be prompted on first push — for the
cloud Mac, generate a Personal Access Token at
https://github.com/settings/tokens (scopes: `repo`, `workflow`), use
it as the "password" when git prompts.

## Step 2 — Install JS dependencies

```bash
cd ~/siren
npm ci                    # root deps; postinstall copies Capacitor bridge to public/
cd mobile
npm ci                    # native shell deps
```

Use `npm ci` (not `npm install`) — clean install from the lockfile,
matches CI exactly. Total time ~2 min.

## Step 3 — Add the iOS platform

```bash
cd ~/siren/mobile
npx cap add ios
```

Generates `mobile/ios/` with the Xcode project skeleton. Expected
output ends with **"ios platform added!"**. Takes ~10 seconds.

## Step 4 — Install CocoaPods + sync

```bash
sudo gem install cocoapods    # if you don't already have it; ~2 min
cd ~/siren/mobile
npx cap sync ios
cd ios/App
pod install
cd ~/siren/mobile
```

`cap sync ios` copies `www/` + `capacitor.config.ts` + plugin
metadata into the Xcode project. `pod install` pulls Capacitor's
native plugin dependencies. Expect a warning that
`google-services.json` is missing — that's the Android-only Firebase
config, ignore on iOS.

## Step 5 — Add the `siren://` URL scheme to Info.plist

The Android shell already has this (slice 3); iOS needs the
equivalent for OAuth deep links to route back to the app.

Open `mobile/ios/App/App/Info.plist` in any text editor (or
`open mobile/ios/App/App/Info.plist` to open in Xcode).

Inside the top-level `<dict>`, near the closing `</dict>`, add this
block:

```xml
<key>CFBundleURLTypes</key>
<array>
  <dict>
    <key>CFBundleURLName</key>
    <string>au.com.sirenfooty.app</string>
    <key>CFBundleURLSchemes</key>
    <array>
      <string>siren</string>
    </array>
  </dict>
</array>
```

Save the file. (Xcode will pick up the change automatically; no need
to re-sync.)

## Step 6 — Open in Xcode

```bash
cd ~/siren/mobile
npx cap open ios
```

Xcode launches with `App.xcworkspace`. First open takes a minute to
index. **Always use `.xcworkspace`, never `.xcodeproj`** — only the
workspace knows about the CocoaPods.

### Configure signing

In Xcode's left sidebar:

1. Click the top-level **App** project.
2. In the editor pane, select the **App** target.
3. Open the **Signing & Capabilities** tab.
4. **Team**: pick your Apple Developer team (Team ID `5XHSRMFBTZ`).
   If your Mac isn't signed in to your Apple ID, do that first via
   Xcode → Settings → Accounts → **+** → Apple ID.
5. **Bundle Identifier** should already show `au.com.sirenfooty.app`.
   If not, type it exactly.
6. Xcode auto-generates a Provisioning Profile. You'll see a green
   tick once it's ready (~5-10 sec).

### Pick a simulator

Top of the Xcode window, next to the Play button, click the device
dropdown and pick **iPhone 16 Pro** (or any current-generation
iPhone simulator).

### Run

Click the ▶ Play button (or press **⌘+R**).

Expected sequence:
1. Xcode builds the app (~30-60 sec first time)
2. iOS Simulator boots (~30 sec)
3. App launches
4. WebView loads `https://www.sirenfooty.com.au`
5. You see the login page

## Step 7 — Smoke-test slices 1-7 in the simulator

Sign in with **email + password** (skip OAuth for now — system
browser handling in the simulator is finicky and not a great test of
the slice 3 flow; that gets validated on a physical device).

Walk through:

1. **Dashboard loads.** Sees your teams.
2. **Open a game.** Game detail page loads, scores card, etc.
3. **Start a live game.** Q1 modal appears, single tap dismisses,
   clock starts. (Validates slice 5e's writeQueue + slice 7's bridge
   injection.)
4. **Score a goal.** Score-bug updates immediately. After ~1 second,
   query the database to confirm the `goal` event landed
   server-side. (Validates the queue's drain path.)
5. **Toggle airplane mode**: Simulator → Features → Network → Off.
6. **Score 2 more goals + swap a player.** UI keeps working
   (slice 5d's queue catches the writes).
7. **Toggle network back on**: Simulator → Features → Network → On.
8. **Wait ~5 sec.** Queue drains. Refresh — all events present.
9. **Navigate around offline**: toggle network off, navigate
   dashboard ↔ game. SW cache should serve. (Validates slice 6.)

If any step fails, screenshot from the simulator window
(⌘+Shift+4 then space then click the simulator) and paste it in
the chat.

## Step 8 — Commit `mobile/ios/`

```bash
cd ~/siren
git checkout -b ios-scaffold
git add mobile/ios mobile/package*.json
git status                  # double-check nothing weird's staged
git commit -m "Scaffold iOS Capacitor project"
git push -u origin ios-scaffold
```

`.gitignore` (in `mobile/.gitignore`) already excludes Pods,
DerivedData, and signing assets, so this commit is just the
source-of-truth iOS project files.

Open a PR from `ios-scaffold` → `main` on GitHub. Once merged, any
future Mac session can `cap sync ios` against the committed
project — no re-scaffold needed.

## Step 9 — Done for the day? Stop the meter.

⚠️ **MacinCloud Pay-As-You-Go bills for as long as your Mac
account is logged in, not just connected.**

From the Mac:
- Apple menu (top-left) → **Log Out user293344...**

OR from MacinCloud's web portal:
- portal.macincloud.com → Action menu on your server → Disconnect.

Don't just close the RDP window — the meter keeps running.

## What's NOT in this doc

- **APNs push notifications** — needs an Apple Developer APNs key +
  adding the iOS app to your Firebase project. Separate doc when
  you're ready.
- **TestFlight upload** — needs an Archive build, an App Store
  Connect listing, screenshots, privacy nutrition labels. Separate
  doc.
- **App icons + splash** — `npx @capacitor/assets generate` once
  you have a 1024×1024 master icon.
- **Native "Sign in with Apple" sheet** — the system-browser OAuth
  flow already works on iOS via slice 3. Switching to the native
  sheet via `@capacitor-community/apple-sign-in` is a v2 polish
  item; the current flow passes Apple's guideline 4.8.

## If something goes wrong

| Symptom                                                          | Fix                                                                 |
| ---------------------------------------------------------------- | ------------------------------------------------------------------- |
| `pod install` fails with "could not find compatible versions"   | `cd ios/App && pod repo update && pod install`                       |
| Xcode build error: "No such module 'Capacitor'"                  | You opened `.xcodeproj` instead of `.xcworkspace`. Close + reopen.   |
| `cap sync` warns about Android — fine on iOS                    | Expected. The shared config touches both platforms.                  |
| Simulator stuck on splash screen                                | Cmd+Shift+H to go home; long-press the app icon; delete; re-run.    |
| App opens to a white screen                                     | Network issue. Check the simulator can browse to sirenfooty.com.au in Safari.   |
| `siren://` deep link doesn't open the app                        | Step 5's `Info.plist` edit didn't save / wasn't synced. Re-run `cap sync ios`. |
