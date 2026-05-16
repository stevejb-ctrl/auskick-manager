# Siren Footy — privacy / data-safety form answers

Both Apple App Store Connect and Google Play Console ask a long
questionnaire about what user data your app touches. The categories
overlap but use different vocabularies. This file is the canonical
answer set for both, with rationale so a future submission can
defend each pick.

Consistent with `/privacy` (the policy users see). If you update
this file, also update the policy and bump its `LAST_UPDATED`.

Last reviewed: 16 May 2026

---

## TL;DR (for your own sanity)

Siren collects only what's needed to run the app. No advertising,
no third-party tracking, no location, no payment data, no contacts,
no photos. Account deletion is in-app and a hard wipe after a
30-day grace period. Data lives at Supabase (Sydney region) and
Vercel.

The single nuance is **Google Analytics 4** for aggregate web
traffic. That's pageview-level only, IP-truncated, no advertising
features. Both stores want you to declare it as "Analytics".

---

# Apple — App Privacy questionnaire

App Store Connect → your app → **App Privacy** → **Get Started**.
Apple groups data into 14 categories; you mark each as "Collected"
or "Not Collected", and for each Collected category you specify
the purposes and whether it's linked to user identity or used to
track.

For all of the below, **"Used to Track You" = NO**. Apple defines
tracking as "linking data collected from this app with data from
other companies' apps, websites, or offline properties for targeted
advertising or advertising measurement, or sharing with a data
broker". Siren doesn't do any of that.

## 1. Contact Info

**Collected: YES**

| Sub-type        | Collected | Linked to user | Purposes                                       |
| --------------- | --------- | -------------- | ---------------------------------------------- |
| Name            | YES       | YES            | App Functionality                              |
| Email Address   | YES       | YES            | App Functionality                              |
| Phone Number    | NO        | —              | —                                              |
| Physical Address| NO        | —              | —                                              |
| Other User Contact Info | NO | —             | —                                              |

Rationale: email + name are required for auth and for team
membership display ("Steve invited you to coach the Roos"). No
phone, no address — we don't have a form for either.

## 2. Health & Fitness

**Collected: NO** — no health data.

## 3. Financial Info

**Collected: NO** — app is free; no payment data, no in-app
purchases, no payment SDK.

## 4. Location

**Collected: NO** — no GPS, no IP-derived location stored, no
location SDK. Google Analytics infers country from IP at query
time (see §12 below) but no location data is stored on user.

## 5. Sensitive Info

**Collected: NO** — no race, religion, sexual orientation,
political opinion, etc.

## 6. Contacts

**Collected: NO** — we never access the device contacts API.

## 7. User Content

**Collected: YES**

| Sub-type              | Collected | Linked to user | Purposes          |
| --------------------- | --------- | -------------- | ----------------- |
| Emails or Text Messages | NO      | —              | —                 |
| Photos or Videos      | NO        | —              | —                 |
| Audio Data            | NO        | —              | —                 |
| Gameplay Content      | NO        | —              | —                 |
| Customer Support      | NO        | —              | —                 |
| Other User Content    | YES       | YES            | App Functionality |

Rationale: "Other User Content" covers the team-and-game data the
coach types in — player names, jersey numbers, fixtures, lineups,
scores, swap events. It's "user-generated" by Apple's definition.
Linked to user identity (admin/manager of the team that owns it).
We do not collect customer support transcripts as separate data;
that flows through email (hello@tribebikes.com.au) which Apple
already counts under §1.

## 8. Browsing History

**Collected: NO** — we don't log URLs the user visits outside
the app.

## 9. Search History

**Collected: NO** — there's no search feature that retains queries.

## 10. Identifiers

**Collected: YES**

| Sub-type     | Collected | Linked to user | Purposes                          |
| ------------ | --------- | -------------- | --------------------------------- |
| User ID      | YES       | YES            | App Functionality                 |
| Device ID    | YES       | YES            | App Functionality (Push tokens)   |

Rationale: User ID is the Supabase auth UUID; primary key for
everything in the database. Device ID is the FCM / APNs push
token stored in `device_tokens` so we can route notifications.
Both linked to user identity by definition.

## 11. Purchases

**Collected: NO** — free app, no IAP.

## 12. Usage Data

**Collected: YES**

| Sub-type             | Collected | Linked to user | Purposes                |
| -------------------- | --------- | -------------- | ----------------------- |
| Product Interaction  | YES       | NO             | Analytics               |
| Advertising Data     | NO        | —              | —                       |
| Other Usage Data     | NO        | —              | —                       |

Rationale: Google Analytics 4 on the web measures aggregate
pageviews + clicks. We do NOT pass `user_id` to GA4, so it can't
link a GA event to a Supabase identity — hence "Linked to user:
NO". IP addresses are truncated by GA4 before any storage.

## 13. Diagnostics

**Collected: YES**

| Sub-type            | Collected | Linked to user | Purposes               |
| ------------------- | --------- | -------------- | ---------------------- |
| Crash Data          | NO        | —              | —                      |
| Performance Data    | YES       | NO             | App Functionality      |
| Other Diagnostic Data | YES     | NO             | App Functionality      |

Rationale: Vercel Speed Insights captures Core Web Vitals (LCP,
INP, CLS) per page view, plus request logs (timestamp, route, IP,
user-agent) for security and debugging. Neither carries user_id
into the telemetry pipeline. Crash data — we don't currently ship
Sentry or any native crash reporter; if that changes in v1.x bump
the answer to YES here.

## 14. Other Data

**Collected: NO**

---

# Google — Data Safety form

Play Console → your app → **App content** → **Data safety** →
**Manage**. Google's structure is similar but adds two top-level
disclosures:

- **Is your app encrypting data in transit?** YES — every request
  is HTTPS-only (the WebView refuses HTTP, the Vercel domain
  redirects, Supabase is HTTPS-only).
- **Can users request that their data be deleted?** YES — and
  the in-app account-deletion flow at `/account` is the canonical
  path. Email fallback: `hello@tribebikes.com.au`. Documented at
  `/support` and `/privacy`.

## Data collected and shared

Google has three columns: "Collected", "Shared" (with third
parties), and "Optional/Required". Sirence shares nothing with
third parties beyond our infrastructure providers (Supabase,
Vercel, Google Analytics) which Google's form notes don't count
as "sharing" — that's "data processor" usage.

### Personal info

| Type            | Collected | Purpose                              | Required |
| --------------- | --------- | ------------------------------------ | -------- |
| Name            | YES       | Account management; App functionality | Required |
| Email address   | YES       | Account management; App functionality | Required |
| User IDs        | YES       | Account management; App functionality | Required |
| Address         | NO        | —                                    | —        |
| Phone number    | NO        | —                                    | —        |
| Race/ethnicity  | NO        | —                                    | —        |
| Political/religious beliefs | NO | —                              | —        |
| Sexual orientation | NO     | —                                    | —        |
| Other info      | NO        | —                                    | —        |

### Financial info

All **NO** — no financial data of any kind.

### Health and fitness

All **NO** — no health data.

### Messages

All **NO** — we don't access SMS/email contents.

### Photos and videos

All **NO** — no camera access in v1. (If you wire up player
avatars later, bump this.)

### Audio files

All **NO**.

### Files and docs

All **NO**.

### Calendar

All **NO**.

### Contacts

All **NO**.

### Location

All **NO** — approximate and precise both NO.

### Web browsing

All **NO**.

### App activity

| Type                             | Collected | Purpose            | Required  |
| -------------------------------- | --------- | ------------------ | --------- |
| App interactions                 | YES       | Analytics          | Optional* |
| In-app search history            | NO        | —                  | —         |
| Installed apps                   | NO        | —                  | —         |
| Other user-generated content     | YES       | App functionality  | Required  |
| Other actions                    | NO        | —                  | —         |

*Google Analytics is functionally optional — the app works fully
without it, but there's no UI to opt out per-user beyond browser-
level controls. Mark "Required" if Google's form treats absence
of a per-user opt-out as required-collection.

"Other user-generated content" = team/game/lineup/score data.

### App info and performance

| Type                | Collected | Purpose          | Required |
| ------------------- | --------- | ---------------- | -------- |
| Crash logs          | NO        | —                | —        |
| Diagnostics         | YES       | App functionality| Required |
| Other app perf data | YES       | App functionality| Required |

Rationale: Vercel logs request timing and Web Vitals (see Apple
§13). Same source data answered consistently across both stores.

### Device or other IDs

| Type           | Collected | Purpose                       | Required |
| -------------- | --------- | ----------------------------- | -------- |
| Device or other IDs | YES  | App functionality (Push tokens) | Required |

FCM tokens for Android push notifications.

## Other Data Safety questions Google asks

- **Is all data encrypted in transit?** YES.
- **Do you follow Google Play's Families Policy?** YES — the app
  is rated for general audiences (4+ equivalent), no targeted
  advertising, no user-generated public discoverability, COPPA-
  compliant data minimisation (we only collect coach identity;
  child names are stored as content typed by the coach, not as
  child PII linked to a child account).
- **Has your app been independently validated against a global
  security standard?** NO — small indie app; skip this section.
- **Can users request that their data be deleted?** YES.
  - In-app: Settings → My account → Delete my account.
  - Web: same path at `/account`.
  - Email fallback: hello@tribebikes.com.au

---

# Cross-store consistency checks

Both forms should be answered IDENTICALLY for overlapping
categories. If you ever change one answer, change both. Common
gotchas:

- Adding Sentry or Datadog later → flip Apple §13 Crash Data to
  YES, flip Google "Crash logs" to YES. Both linked to user (the
  user_id is usually attached for triage).
- Adding camera-based player avatars → flip Apple §7 Photos to
  YES, flip Google "Photos" to YES.
- Adding in-app purchases → §3 / Financial Info both flip.
- Adding location-based features (e.g. nearest oval finder) →
  §4 / Location both flip.

Keep this file in sync with `src/app/(marketing)/privacy/page.tsx`
— that's what users see, this is what reviewers see. They must
agree.
