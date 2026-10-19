# Analytics, heatmaps and SEO — plan

_Drafted 18 Oct 2026. Phase 0's code shipped in PR #158 on 19 Oct, and item 4 (Search Console, GA4, Bing) was done the same day. Item 5 is still to do. Phase 4a (share images, structured data) was built on 19 Oct on branch `feat/seo-phase-4a`._

## Goal

Know three things we can't see today:

1. **Where coaches come from** and which pages turn visitors into sign-ups.
2. **What coaches actually do** in the app, especially game day, and where they get stuck.
3. **How Siren shows up in Google**, and which searches we could win.

Don't trade away the trust that clubs and parents give us to get there. Squads are lists of children's names, so privacy is a design constraint, not a footnote.

---

## Where we are today

| Area | What exists | Gap |
|---|---|---|
| Web analytics | GA4 (`G-ZBTGMZPTD0`), page views only, prod only, in `src/app/layout.tsx` | No custom events, no funnels, and no user or team context. GA4 also loads on **every** route, app routes included. |
| Performance | Vercel Speed Insights | Fine as is. |
| Product metrics | `/admin` reads straight from the DB: sign-ups, teams, most active teams, completed games | Good source of truth for the business. It can't show behaviour: what was tapped, ignored, abandoned or retried. |
| Heatmaps / replay | None | — |
| Error tracking | None (no Sentry etc.) | We find crashes when a coach tells us. |
| SEO technical | `robots.ts` and `sitemap.ts` per brand host, per-page `canonical`, metadata on marketing and help pages | Sitemap is hand-kept: it's missing `/why-siren` and `/support`, and `lastModified` is stuck at 22 Apr. No OG images. No structured data. `lang="en"` rather than `en-AU`. |
| SEO multi-domain | The code has brand hosts for sirenfooty, sirennetball and sirenleague, but only **sirenfooty.com.au is registered**. The other two don't resolve in DNS (checked 19 Oct). | No duplicate-content problem today. It starts the day a second brand domain goes live, unless shared pages canonicalise to one host (4a). Soccer and basketball have no domain or landing page. |
| Search Console | **Done 19 Oct:** `sirenfooty.com.au` is a Domain property in hello@sirenfooty's account, verified by a DNS TXT record at VentraIP. The sitemap is submitted, and Google had already read it on 13 Oct (17 pages). GA4 is linked. Bing Webmaster Tools imported the site and has the sitemap. | — |

### Found while looking: run-tokens are being sent to Google

`/run/<token>` gives a parent live-scoring control of a real game with no login. The token is a bearer secret. GA4 is in the root layout, so on prod every `/run/<token>` page view sends the full URL, token included, to Google Analytics. The same happens to `/join/<token>` invite links and the `?code=` on `/auth/callback`.

Only our own GA account can see it, so the risk is low, but a secret shouldn't sit with a third party. **Fixing this is Phase 0, item 1.**

---

## Tooling decision

**Recommended: PostHog Cloud for product analytics, heatmaps, session replay and error tracking. Keep GA4 only on the public site. Use Google Search Console and Bing Webmaster Tools for search.**

| Need | Tool | Why |
|---|---|---|
| Product analytics (funnels, retention, paths) | **PostHog** | A single SDK also covers heatmaps, replay, error tracking, feature flags and surveys. We tag the code once, not four times. |
| Heatmaps (clicks, rage clicks, scroll depth) | **PostHog** | Built in. It can filter by viewport width, which matters because game day is a phone screen. |
| Session replay | **PostHog** | Has proper masking controls; the "Privacy" section below shows why we need them. |
| Error tracking | **PostHog** (exception autocapture) | Free tier is plenty. We can move to Sentry later if we outgrow it. |
| Marketing traffic | **GA4** (keep, but only on public pages) | It already has history, it's free, and it links to Search Console for organic queries → landing pages. |
| Search visibility | **Google Search Console + Bing Webmaster Tools** | Bing's index also feeds ChatGPT search and Copilot. |

**Cost:** PostHog's free tier currently covers 1M events, 5,000 replays and 100k exceptions a month ([pricing](https://posthog.com/pricing)). Rough estimate: 200 active teams × 1 game a week × ~300 events comes to about 260k events a month, so we should sit inside it. **Set a $0 billing cap on every product on day one** so a spike pauses collection instead of sending a bill.

**Considered and rejected:**
- **Microsoft Clarity:** free heatmaps and replay, but there's less control over masking, the data goes to Microsoft, and it means a second SDK. Not worth it with children's names on screen.
- **Hotjar:** paid, and heatmaps only.
- **Self-hosted PostHog:** we don't want to run that infrastructure.

### Platform note

The iOS and Android apps are a Capacitor WebView that loads the live site (`mobile/capacitor.config.ts` → `server.url`). The web SDK therefore runs inside the native apps too, and no native SDK is needed. What we do need:
- a `platform` property: `web` / `pwa` / `ios` / `android`;
- updated **App Store privacy labels** and **Play Data safety** forms: Usage data → Product interaction, linked to the user, **not** used for tracking. No ATT prompt is needed because we don't track people across other apps.

---

## Privacy design (applies to every phase)

Hard rules, enforced in code and covered by tests:

1. **No children's data ever leaves the app.** That means no player names, jersey numbers or team names.
   - Autocapture: `mask_all_text: true` and `mask_all_element_attributes: true`. Without these, tapping a `PlayerTile` would send the kid's name as `$el_text`.
   - Session replay on authed routes: mask all text (`maskTextSelector: "*"`) and all inputs. Heatmaps and replay still show *where* people tap, just not *what the screen says*.
   - Marketing and help pages stay unmasked; there's nothing personal on them.
2. **No secrets in URLs.** A single `sanitizeUrl()` in `src/lib/analytics/sanitize.ts` rewrites `/run/<token>` → `/run/:token`, `/join/<token>` → `/join/:token`, and strips `code`, `token`, `access_token` and `type` query params. Both GA4 and PostHog (`before_send`) go through it.
3. **Identify by Supabase user id only.** No email or name goes to PostHog. Person properties are limited to role, sports, team count, signup date and signup brand.
4. **No recording on `/run/*`.** Parent runners aren't account holders and never agreed to our terms. They get anonymous events only.
5. **Off outside prod.** Dev, preview and e2e send nothing. E2E uses a debug transport (below).
6. **An opt-out.** Add an "Share anonymous usage data" toggle on `/account`, on by default; it calls `posthog.opt_out_capturing()`. It costs little and builds trust with parents.
7. **Update the privacy policy** (`src/app/(marketing)/privacy/page.tsx` §2, §5, §9). Name PostHog, say what's recorded and what's masked, give the retention period, and say where the data is stored (EU or US). Australian privacy law requires disclosing overseas storage.
8. **Watch the Children's Online Privacy Code.** The OAIC's exposure draft (Mar 2026) must be registered by **10 Dec 2026**, and it limits collection to what is "strictly necessary". The rules above should already fit it. Re-check the final text when it lands, and get advice on whether it applies to Siren at all.

---

## Phase 0: Fix and baseline (small; about one PR)

1. **Stop leaking tokens to GA4.** GA4 runs only on the pages in the sitemap (marketing, help, login), and only when the URL has no query params other than campaign tags. App, `/run`, `/join`, `/auth` and `/reset` get no GA. PostHog covers those routes from Phase 1.
   - Built as `GoogleAnalyticsGate` in the root layout, not as a component in each public layout. Once gtag.js has loaded, it stays loaded for the life of the tab. So a client-side move from help into the app, or from login into an invite, would still report the app URL. The gate sees every navigation and sets GA's own opt-out flag, `window['ga-disable-<id>']`, before the new URL is pushed.
   - Regression test first: `e2e/tests/google-analytics-routes.spec.ts`. GA is prod-only, so the spec turns it on with a dummy ID through an e2e cookie that production ignores.
2. **Sitemap.**
   - Add `/why-siren` and `/support`.
   - Build it from one list, `src/lib/public-routes.ts`, which `robots.ts` and the GA gate also read, so the three can't drift apart. A unit test walks `src/app` and fails when a page is in none of the lists.
   - Set `lastModified` from a per-page date rather than one global date.
3. **`lang="en-AU"`** on `<html>`.
4. **Search Console and Bing setup.** Google's half was done on 19 Oct, in hello@sirenfooty's account:
   - ✅ `sirenfooty.com.au` added as a **Domain property**. It covers www, the bare domain and http/https. It's verified by the TXT record `google-site-verification=vGwGXSJgA05Q1jbEtgcmouEtG7wSMB19ZBhQNKnS5Fc` in VentraIP's DNS for the domain. **Don't delete that record**, or the property loses verification.
   - ✅ `https://www.sirenfooty.com.au/sitemap.xml` submitted.
   - ✅ Search Console linked to GA4 (property 534093249, stream "Siren Footy Site").
   - ✅ GA4 event-data retention raised from 2 to 14 months.
   - ✅ GA4 redaction of URL query parameters turned on for `next`, `code`, `token`, `access_token`, `refresh_token`, `token_hash` and `email`. Until PR #158 is live, this backstops GA tokens in query strings. It can't redact path segments, so `/run/<token>` needs the code fix.
   - Checked and left as is: Google signals is off, which matches the privacy policy.
   - ✅ **Bing Webmaster Tools.** Steve signed in on 19 Oct. `sirenfooty.com.au` was imported from Search Console, which lets Bing check verification with read-only Search Console access, and the sitemap was submitted by hand because the import brought none across.
   - When a second brand domain (sirennetball / sirenleague) is registered, add it as another Domain property the same way.
5. **Write down our five numbers** (see "What we'll measure"), so Phase 2 is built to answer them.

---

## Phase 1: Analytics foundation (PostHog)

**Setup (you):**
- Create the PostHog project (EU or US region; see Decisions).
- Set the $0 billing caps.
- Create a separate dev project, so local debugging never pollutes prod.

**Code (`src/lib/analytics/`):**
- `client.ts` initialises posthog-js with the privacy config above:
  - `person_profiles: "identified_only"`;
  - App Router page views via `capture_pageview: "history_change"`;
  - `before_send` → `sanitizeUrl`;
  - disabled unless `VERCEL_ENV === "production"`.
- `events.ts` is a **typed event catalogue**: a TS union of event names, each with its props. `track()` only accepts names from it. That stops `sub_made` / `subMade` / `substitution_made` drift across five sports.
- `identify()` runs after login with the Supabase user id; `reset()` runs from `SignOutButton` / `UserMenu`.
- `server.ts` uses posthog-node for events that must be true even when the phone is offline (see Phase 2). It flushes with `waitUntil`, so serverless functions don't drop events.
- **Super properties** on every event:
  - `sport`;
  - `brand_host`;
  - `platform` (`web` / `pwa` / `ios` / `android`, from `Capacitor.getPlatform()` plus `display-mode: standalone`);
  - `app_version` (`VERCEL_GIT_COMMIT_SHA`);
  - `team_role` (coach / manager / parent) when inside a team.
- **Reverse proxy:** add `/ingest/*` rewrites to PostHog in `next.config.mjs`, so ad blockers don't silently drop a chunk of events.
  - Add `/ingest` to the public paths in `src/lib/supabase/middleware.ts`. Otherwise signed-out events get redirected to `/login`.
  - Check the service worker doesn't cache it. It shouldn't: our runtime caching only covers navigations and static files.
- **Error tracking:** turn on exception autocapture, and call `captureException` from `src/app/error.tsx`.

**Tests:**
- Vitest: `sanitizeUrl` cases, the event-catalogue shape (snake_case names, required props), platform detection.
- E2E: with `NEXT_PUBLIC_ANALYTICS_DEBUG=1`, `track()` pushes to `window.__sirenEvents` instead of the network. A new `e2e/tests/analytics.spec.ts` asserts:
  - sign-up → `signup_completed` fires;
  - a `/run/<token>` visit never puts the token in any captured URL;
  - no request goes to posthog or google hosts in normal e2e runs.

**Also:** privacy policy update, the `/account` opt-out toggle, and the App Store and Play forms.

---

## Phase 2: Events and dashboards

### Rule: instrument shared components, not sport components

Per CLAUDE.md, put `track()` calls in the shared chrome: `ScoreRecordingDock`, `SubDueModal` / `SubDueBanner`, `LockModal`, `LateArrivalMenu`, `InjuryReplacementModal`, `WalkthroughModal`, `QuarterBreak`, `LineupPicker`. Pass `sport` as a property. Every sport, soccer and basketball included, gets analytics for free, and the numbers compare like for like.

### Event catalogue v1

| Stage | Event | Key props | Where it's sent from |
|---|---|---|---|
| Acquire | `$pageview` | utm_*, referrer (automatic) | client |
| | `cta_clicked` | location (hero / nav / final_cta), sport | client |
| | `demo_started` | sport | client |
| | `signup_started` | method (email / google / apple) | client |
| | `signup_completed` | method, brand_host | **server** |
| Activate | `team_created` | sport, age_group | **server** |
| | `squad_built` | player_count (fires when the squad first reaches the team's on-field size) | **server** |
| | `game_created` | sport, days_until_game | **server** |
| | `game_started` | sport, has_lineup_draft | **server** |
| | `game_completed` | sport, duration_min, subs_count | **server** |
| Game day | `sub_made` | source (suggestion / manual / due_prompt) | client |
| | `sub_due_prompt` | action (accepted / snoozed / dismissed) | client |
| | `score_recorded` | kind, via (dock / chip) | client |
| | `quarter_break_suggestion` | action (applied / edited / ignored), fairness_score | client |
| | `lock_action` | action (switch / injure / lend) | client |
| | `late_arrival_added` | — | client |
| | `walkthrough` | action (completed / skipped), step | client |
| | `undo_used` | what | client |
| | `offline_queue_flushed` | queued_count, offline_seconds | client |
| Collaborate | `invite_sent` / `invite_accepted` | role | **server** |
| | `run_link_shared` | — | client |
| | `parent_viewed_game` | — | client |
| Learn | `help_article_viewed` | slug | client |
| | `feedback_submitted` | — | server |

**Why server-side for lifecycle events:** the live game runs offline (slice 5d write queue), and client events captured offline may never send. Lifecycle events fire from the server action that writes the DB row, so they are as reliable as the data itself. Client events are for *how* someone used a screen.

### What we'll measure (the five numbers)

1. **Weekly active teams (north star):** teams that completed at least one game in the week, by sport. Junior sport runs on a weekly, Saturday rhythm, so daily active users is the wrong metric.
2. **Activation rate:** sign-up → team → full squad → first game completed **within 21 days**. This shows where new coaches drop out.
3. **Season retention:** of teams that ran a game in week 1–2 of their season, the % still running games in weeks 6 and 10. Measure per sport, because seasons differ.
4. **Visit → sign-up conversion** by source (organic, direct, club referral, app store) and by brand domain.
5. **Game-day friction:** sub-suggestion acceptance rate, rage clicks on the live screen, undo rate, and errors per game.

**Dashboards to build in PostHog:** Acquisition, Activation funnel, Weekly active teams by sport, Game-day health. The `/admin` page stays the DB source of truth for raw counts. Add a link from `/admin` to the PostHog dashboards.

---

## Phase 3: Heatmaps and session replay

- **Heatmaps:** enable `enable_heatmaps`. Out of the box this gives clicks, rage clicks, dead clicks and scroll depth. View them through the PostHog toolbar on any page, filtered to phone widths for the live screen.
- **Replay scope.** Recording everything would burn the 5k/month budget on returning coaches doing the same thing. Instead:
  - 100% on **marketing and `/demo`**: low volume, and it shows why visitors don't sign up.
  - 100% of a user's **first 3 sessions** (`/login` → `/welcome` → first team setup). This is onboarding friction.
  - **Live game:** triggered when a `rage_click`, `undo_used` or `$exception` happens, plus a small random sample.
  - **Never on `/run/*`.**
  - Minimum duration 10 s; all text masked on authed routes.
- **Ritual:** 20 minutes each Monday after the weekend's games. Watch five replays from new coaches and five triggered live-game replays, and file what you see as issues. This complements the Stagehand usability runs: those test what we *think* is hard, replays show what *is*.

---

## Phase 4: SEO and search

### 4a. Technical (code, ~1 PR)

- ✅ **Share images per brand** (built 19 Oct, branch `feat/seo-phase-4a`).
  - `src/app/opengraph-image.tsx` draws a 1200×630 card per brand: field green with the orange dot for footy, court blue for netball. The words come from the CMS brand copy.
  - One card serves every page. Per-page cards can come later if a page needs its own pitch.
  - Club committees share links in WhatsApp and Facebook groups, our main word-of-mouth channel, and those links used to show no image.
  - A page that sets its own `openGraph` must spread `baseOpenGraph()` (src/lib/seo.ts) in, or it loses the image.
- ✅ **Structured data (JSON-LD)**, built the same day:
  - **Home page:** `Organization`, `WebSite` and `SoftwareApplication`, with the App Store link and a $0 AUD offer while the 2026 season is free. **Update the offer when pricing changes.**
  - **Help pages:** `BreadcrumbList` on `/help/*`.
  - No ratings: the homepage trust band's "4.9★ parent rating" isn't from a review source, so it stays out of structured data.
  - Skip `FAQPage`: Google stopped showing FAQ rich results for most sites in 2023.
  - Add a Play link to `src/lib/app-links.ts` when the Android listing ships.
- **Duplicate pages across brand domains:** only sirenfooty.com.au exists today, so there's nothing to do until a second domain is registered. Then:
  - Short term: point `/privacy`, `/terms` and the generic `/help/*` canonicals at sirenfooty.
  - Longer term: make help sport-aware per brand, so sirennetball.com.au/help talks about netball and earns its own rankings.
- **Core Web Vitals:** keep watching Speed Insights. The marketing page already redirects signed-in users server-side, which is good.

### 4b. Content (the real lever)

Siren already *knows* the rules: the sport models and age policies under `src/lib/sports/*` cover zones, game-time floors, positions and rotation styles. Turn that into public, genuinely useful pages:

- **Sport landing pages:** `/afl`, `/netball`, `/rugby-league`, `/soccer`, `/basketball`, each with its own copy, screenshots and a sign-up CTA. Soccer and basketball currently have nowhere to rank.
- **"Rules and rotations" guides per sport and age group**, generated from the sport config with written intros. For example "Auskick U10: zones, game time and fair rotations", "NetSetGo positions explained" or "U9 rugby league interchange rules". These target what coaches actually search before game day.
  - Accuracy matters. Link to the governing body's rules, and phrase the content as "typical / default" until association rule packs are confirmed (that question is still parked from the UX plan).
- **Help centre:** expand it, and use the help search queries (Phase 5) and Search Console queries to pick the next articles.
- **Starting keyword themes**, to be validated in Search Console after about 6 weeks of data:
  - auskick team app
  - junior football rotation app
  - fair game time kids sport
  - netball rotation planner
  - junior rugby league interchange
  - under 8 soccer rotations

### 4c. Off-site and app stores

- **Backlinks:** club and league partnerships. A "Clubs using Siren" page, plus a link from each club's website. One association link is worth more than any on-page tweak.
- **App store search (ASO):** the App Store title, subtitle and keyword field are a search engine too. Revisit them once we know the winning web keywords.
- **Attribution:** PostHog stores first-touch UTM on the person at sign-up. Use `?utm_source=club&utm_campaign=<club>` on links we give clubs, so we can see which partnerships bring active teams, not just visits.

---

## Phase 5 (optional): help search

A search box on `/help` with a small client-side index over the help pages. Track `help_searched {query, results_count}`. **Zero-result queries are a free list of content to write**, and they feed straight into 4b.

---

## Order and size

| Phase | Size | Depends on | Notes |
|---|---|---|---|
| 0: fix and baseline | S | — | Ship first. Includes the token-leak regression test. |
| 1: PostHog foundation | M | your PostHog account | 3–4 commits: lib + proxy, identify, privacy and opt-out, tests |
| 2: events and dashboards | M | 1 | Shared components first, then server lifecycle events |
| 3: heatmaps and replay | S | 1 | Mostly config. The value is in the Monday ritual. |
| 4a: technical SEO | S–M | 0 | Can run in parallel with 1–3 |
| 4b: content | L, ongoing | 4a, 6 weeks of Search Console data | Biggest long-term payoff |
| 5: help search | S | — | Optional |

Phases 0 and 4a can run alongside 1–3; they touch different files.

---

## Decisions for you

1. **PostHog region: EU or US?** Neither is in Australia. *Recommend EU*, for the stricter default handling, which is a good story for parents. Latency doesn't matter because events are sent asynchronously.
2. **GA4: keep on public pages only, drop entirely, or keep everywhere?** *Recommend public pages only*: it keeps the history and the Search Console link, and the app stays clean.
3. **One home domain or one domain per sport?** Every new sport domain starts at zero authority, and three or more tiny sites compete with each other. Before soccer and basketball launch publicly, decide whether they live under an existing domain, under a new umbrella domain with `/footy`, `/netball` and so on, or under their own domains. This is a brand call more than a code call. It doesn't block Phases 0–3.
4. **Did "Search" also mean in-app search?** For example, search across games, players or help. This plan assumes search engines plus the help search in Phase 5.
