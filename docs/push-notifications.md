# Push notifications — Firebase + Supabase setup

Push notifications in Siren Footy are delivered to the native
Capacitor shell via FCM (Android) and APNs (iOS). The Next.js web
app never sees a push; web users get nothing. The wiring lives in
three places:

- `mobile/android/app/google-services.json` — Firebase config the
  Android app reads at runtime to get its FCM credentials.
- Supabase secret `FIREBASE_SERVICE_ACCOUNT_JSON` — service-account
  JSON the `send-push` Edge Function uses to authenticate FCM API
  calls.
- The `device_tokens` table — populated by
  `NativeNotificationsBridge` on the device and consumed by
  `send-push` when fanning out a notification.

## One-time Firebase setup (~20 minutes)

You only need to do this once per project. The end-state is:

1. A Firebase project that owns FCM for the `au.com.sirenfooty.app`
   Android app.
2. `google-services.json` checked into `mobile/android/app/`.
3. A service-account JSON pasted into the Supabase
   `FIREBASE_SERVICE_ACCOUNT_JSON` secret.

iOS APNs setup is **not** part of this — that lives in a future
phase once `npx cap add ios` lands on a Mac.

### 1. Create the Firebase project

- Go to [Firebase Console](https://console.firebase.google.com/).
- **Add project** → name it `Siren Footy` → continue → disable
  Google Analytics (you already have GA4 on the web side; layering
  Firebase Analytics on top adds complexity for marginal value) →
  **Create project**.

### 2. Add the Android app

- Project overview → click the **Android** icon to add an Android
  app.
- **Android package name**: `au.com.sirenfooty.app`
  (must match `mobile/android/app/build.gradle` `applicationId`).
- App nickname: `Siren Footy Android`.
- Debug signing certificate SHA-1: leave blank for now — required
  later for Google sign-in flows that go through Firebase Auth, not
  needed for FCM-only.
- **Register app**.
- **Download `google-services.json`** → drop it into
  `mobile/android/app/google-services.json`.
- Skip the rest of the setup wizard ("Add Firebase SDK", "Run your
  app to verify installation") — Capacitor's
  `@capacitor/push-notifications` plugin already wires everything.

### 3. Wire the Android Gradle plugin

`@capacitor/push-notifications` needs Firebase's Gradle plugin to
process `google-services.json` at build time. Capacitor 8 should
auto-add this — verify by checking that
`mobile/android/build.gradle` contains:

```gradle
buildscript {
    dependencies {
        classpath 'com.google.gms:google-services:4.4.2'
        // ... other Capacitor / AGP entries
    }
}
```

and that `mobile/android/app/build.gradle` ends with:

```gradle
apply plugin: 'com.google.gms.google-services'
```

If either is missing, add manually. Re-run `npx cap sync android`
after editing.

### 4. Generate a service-account JSON for the server side

This is what the `send-push` Edge Function uses to get an OAuth
access token from Google.

- Firebase Console → ⚙ Project settings → **Service accounts** tab
  → **Generate new private key** → confirm.
- A JSON file downloads (e.g. `siren-footy-firebase-adminsdk-xxxxx-yyyyyyyyyy.json`).
  Treat it as a credential — same handling as the Apple `.p8`.

### 5. Put the service-account JSON into Supabase

Two paths:

**Via the Supabase CLI (recommended):**

```bash
supabase login
supabase link --project-ref siopkhbyiqkkbkzvfoza
supabase secrets set FIREBASE_SERVICE_ACCOUNT_JSON="$(cat firebase-sa.json)"
```

**Via the dashboard:**

- Supabase Dashboard → **Project Settings** → **Edge Functions** →
  **Secrets** → **Add secret**
- Name: `FIREBASE_SERVICE_ACCOUNT_JSON`
- Value: paste the entire JSON contents (one line is fine; newlines
  are tolerated)
- Save

### 6. Deploy the send-push Edge Function

```bash
supabase functions deploy send-push --project-ref siopkhbyiqkkbkzvfoza
```

After this, the function URL is
`https://siopkhbyiqkkbkzvfoza.supabase.co/functions/v1/send-push`
— the same URL the existing
`src/lib/notifications/sendPushNotification.ts` already POSTs to.
Server actions that trigger pushes will start working immediately.

### 7. Smoke-test from the dashboard

While `mobile/android/app/google-services.json` is in place but
before you build the APK, you can verify the Edge Function half:

```bash
curl -X POST \
  -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
  -H "Content-Type: application/json" \
  -d '{"user_id":"<a-real-user-id>","title":"Test","body":"Hello"}' \
  https://siopkhbyiqkkbkzvfoza.supabase.co/functions/v1/send-push
```

A user with no rows in `device_tokens` returns
`{ ok: true, sent: 0, failed: 0 }` — that's healthy. After you
build the Android app and sign in on a device, `device_tokens`
populates and the same call returns `sent: 1`.

## Troubleshooting

| Symptom                                                | Fix                                                                     |
| ------------------------------------------------------ | ----------------------------------------------------------------------- |
| `missing_firebase_service_account` from `send-push`    | Set the `FIREBASE_SERVICE_ACCOUNT_JSON` secret per step 5.              |
| `fcm_token_exchange_failed`                            | The service-account JSON is malformed or its key was revoked.           |
| `unauthorized` when calling `send-push`                | You're hitting it with the anon key. Use the service-role key.          |
| Android build fails: "google-services plugin not found" | Step 3 — add the Gradle classpath + `apply plugin` lines.               |
| Notifications register but nothing arrives             | Check `device_tokens` has a row; check FCM Console → reports for sends. |

## What's next

- **iOS APNs**: when iOS scaffolds, add an iOS app to the same
  Firebase project, drop the APNs auth key (`.p8`) into Firebase
  → Cloud Messaging → Apple app configuration. The `send-push`
  function will then need an APNs branch to dispatch to iOS rows
  in `device_tokens`.
- **More triggers**: only invite-accepted is wired in slice 4.
  Quarter-break reminders (server-side hook on
  `quarter_start` event insert) and game-day reminder cron
  (Vercel cron + a new server action) are slice 4.5 work.
- **Token cleanup**: the migration's `last_seen_at` column gets
  bumped on every register. A periodic prune (delete rows where
  `last_seen_at < now() - interval '60 days'`) keeps the table
  honest. Implement as a Supabase cron when you have ≥1000 rows.
