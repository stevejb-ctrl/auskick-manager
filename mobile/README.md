# Siren Footy — native shell

Capacitor 8 wrapper that ships [https://www.sirenfooty.com.au](https://www.sirenfooty.com.au)
to the App Store and Play Store as a native app. The web codebase at
the repo root is unchanged — this directory is purely the iOS +
Android shell.

## What lives here

| Path                          | Purpose                                              |
| ----------------------------- | ---------------------------------------------------- |
| `package.json`                | Capacitor deps + cap CLI scripts                     |
| `capacitor.config.ts`         | App ID, name, server URL, allowlist, platform flags  |
| `www/index.html`              | Tiny offline splash shown briefly on cold start      |
| `android/`                    | Generated Android Studio project (committed)         |
| `ios/`                        | Generated Xcode project — *not* committed yet (Mac required to add) |

## Prerequisites

- **Node 18+** (matches the web app)
- **Android**: Android Studio Hedgehog or newer + Android SDK 35 + JDK 21 (Capacitor 8 requirement)
- **iOS**: macOS + Xcode 16+ + CocoaPods

## First-time setup

```bash
cd mobile
npm install
```

Re-run `npm install` whenever the Capacitor versions in
`package.json` change.

### Adding the Android project

If `android/` is missing (e.g. on a fresh clone where it was
ever git-removed), regenerate it:

```bash
npx cap add android
npx cap sync android
```

### Adding the iOS project (macOS only)

This step **cannot run on Windows or Linux** — Capacitor needs
Xcode's command-line tools to generate the project. On a Mac:

```bash
npx cap add ios
npx cap sync ios
cd ios/App && pod install
```

After `cap add ios`, edit `ios/App/App/Info.plist` to register the
`siren://` URL scheme so OAuth deep links route back to the app
(matches the Android intent-filter in
`android/app/src/main/AndroidManifest.xml`):

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

Then commit `ios/` (excluding the paths in `.gitignore`).

## OAuth provider setup

Native Google + Apple sign-in goes via the **system browser**, not
the app's WebView (Google rejects WebView user-agents and the
NativeAuthBridge needs cookies to land on the app's origin, not on
the system browser's separate cookie jar). Configure these once:

### Supabase dashboard

**Authentication → URL Configuration → Redirect URLs**

Add (alongside the existing web entries):

```
siren://auth/callback
```

Without this, Supabase will refuse to redirect to the deep link and
the OAuth flow will dead-end on the provider's "redirect URL not
allowed" error page.

**Authentication → Providers → Apple**

Required for iOS App Review (guideline 4.8): if the app offers
Google sign-in, it must also offer Sign in with Apple. Configure:

| Field            | Where to get it                                           |
| ---------------- | --------------------------------------------------------- |
| Services ID      | Apple Developer → Identifiers → Services IDs (e.g. `au.com.sirenfooty.app.signin`) |
| Team ID          | Apple Developer → Membership                              |
| Key ID + Private | Apple Developer → Keys → "+" → enable Sign in with Apple. Download the .p8 once; paste contents into Supabase |

The Services ID's **Return URLs** must include
`https://<your-project>.supabase.co/auth/v1/callback`.

### Google Cloud Console

**APIs & Services → Credentials → OAuth 2.0 Client IDs → Web**

Add `https://<your-project>.supabase.co/auth/v1/callback` to
**Authorised redirect URIs**. Same client ID is reused for the
native flow because the redirect lives on Supabase's host, not the
app's.

### Verifying

After config, on a real device or emulator:

1. Install the app and tap **Continue with Google** on `/login`.
2. System browser opens; sign in with a Google account.
3. Browser bounces to `siren://auth/callback?code=…`.
4. App comes to front; WebView navigates to `/dashboard`.

If step 3 dead-ends in the browser with "redirect URL not allowed",
Supabase didn't get the `siren://` URL added (see above). If step 4
lands the user back on `/login`, the cookie didn't transfer —
inspect Chrome DevTools → Network on the WebView (Android: `chrome://inspect`,
iOS: Safari → Develop) for the failed `/auth/callback` response.

## Daily workflow

The native shell loads the live production site. Updates ship via
Vercel deploys; you only rebuild the native app when:

- Native dependencies change (Capacitor version bump, new plugin)
- The deep-link URL scheme or splash screen changes
- App-store assets are updated (icons, name, version)

```bash
# Pick up changes from capacitor.config.ts into the native projects
npx cap sync

# Open in Android Studio / Xcode for a debug build + run on
# emulator/simulator
npx cap open android
npx cap open ios   # macOS only
```

### Pointing the app at local dev

For a sideline-style debugging session against `next dev`,
temporarily edit `capacitor.config.ts`:

```ts
server: {
  // Android emulator: 10.0.2.2 maps to the host's localhost.
  // iOS simulator: use your machine's LAN IP, e.g. 192.168.1.20.
  url: "http://10.0.2.2:3000",
  cleartext: true,
}
```

Re-run `npx cap sync` after editing. Don't commit the dev URL.

## Path-with-spaces / OneDrive warning (Windows)

The repo currently lives at:

```
C:\Users\steve\OneDrive\Documents\Auskick manager\...
```

Two known Gradle pain points apply:

1. **Spaces in the path** — modern Gradle handles them, but legacy
   Android plugins occasionally don't. If `./gradlew assembleDebug`
   fails with a path-tokenisation error, that's the cause.
2. **OneDrive sync mid-build** — file-syncing during a Gradle build
   can corrupt `android/build/` outputs. OneDrive will sometimes
   hold a file open while Gradle is trying to write it.

If either bites, the cleanest fix is a `git clone` to a
space-free, non-synced path, e.g. `C:\dev\siren-footy`, and develop
the native shell from there. Web dev can stay in OneDrive — only
Android builds care.

## App-store prerequisites (you, not Claude)

These are external dependencies the code can't provide:

- **Apple Developer Program** enrolment (\$US99 / yr, 24–48 hr lead)
- **Google Play Console** account (\$US25 once)
- **APNs auth key** (Apple) and **FCM project** (Google) — needed
  only when push notifications land in slice 4
- **Sign in with Apple** Services ID + private key — needed only
  when slice 3 (auth) lands

Document them under `mobile/store/` once acquired (don't commit
the `.p8` / `.p12` files themselves — paths are gitignored).

## Slice status

This README ships as part of slice 2 of the
[mobile-app plan](../../.claude/plans/i-want-to-turn-flickering-milner.md).
Future slices: native auth + Sign in with Apple (slice 3),
push notifications (slice 4), offline live game (slice 5).
