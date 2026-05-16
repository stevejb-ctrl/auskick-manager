# Siren Footy — store listing copy

Paste-ready copy for App Store Connect and Google Play Console.
Australian English throughout (centre, mum, oval). Voice matches
the "Field Sunday" project tone — sideline-friendly, practical,
anti-marketing fluff.

Choices baked in from review:
- Subtitle: "Fair rotations on game day" (Steve 2026-05-16)
- "Free during the 2026 season" line removed (no implicit pricing
  commitment; pricing stays free with no deadline either way)
- Support URL is `/support` (live as of commit 3689b44)

Last reviewed: 16 May 2026

---

## App name *(both stores, 30-char limit)*

```
Siren Footy
```

---

## Subtitle *(iOS only, 30-char limit)*

```
Fair rotations on game day
```

*(26 chars)*

---

## Short description *(Play Store only, 80-char limit)*

```
Fair rotations and a live game clock for junior AFL and netball coaches.
```

*(72 chars)*

---

## Promotional text *(iOS only, 170-char limit — editable without re-submission)*

```
Run a fair, fun game day. Live rotations, quarter-break recaps, and offline-tolerant for sideline Wi-Fi. Built for junior AFL and netball.
```

*(141 chars)*

---

## Full description *(both stores, 4000-char limit — using ~1500)*

```
Run a fair, fun game day. No spreadsheets.

Siren Footy is the game-day companion for junior AFL and netball
coaches. It does the unglamorous bookkeeping — who's been on the bench
too long, who hasn't played centre yet, who's late and needs slotting
in — so you can keep your head up watching the game.

WHAT'S INSIDE

• Fair rotation suggester. At every sub interval, Siren proposes the
  next swap based on season-long zone minutes. Every kid gets equal
  time on field, time in their preferred positions, and a turn at
  centre. Lock individual players to a zone or always-on-field when
  needed.

• Live game clock. Quarter-aware, with a hooter at the end of each
  period. Pause, scrub, and resume if play stops.

• Mid-game swaps, injuries, fill-ins. Tap a player to swap, mark
  injured, lend to the opposition, or add a late arrival. Score
  goals and behinds with one tap.

• Quarter-break recap. At every break, see who's played where
  and copy a plain-language summary into your team's group chat.

• Offline-tolerant. Built for ovals with patchy Wi-Fi. Your taps
  queue while you're disconnected, then sync when you're back.

• Multi-coach. Invite your assistants as game managers and parents
  as viewers. Share a runner link with the scorers' bench so they
  can record events without an account.

• Multi-sport. Full support for AFL (Auskick through U17) and
  netball (open age, junior through senior). Position model, score
  rules, and quarter length adapt automatically.

WHO IT'S FOR

Saturday-morning coaches who want their players to have a fair go,
their parents to know what's happening, and their phone to do the
spreadsheet bit. Built by a junior AFL coach who got tired of running
games out of a paper notebook.
```

---

## Keywords *(iOS only, 100-char total, comma-separated, no spaces after commas)*

```
afl,auskick,footy,junior football,coach,team manager,rotation,game day,netball,sideline
```

*(91 chars. Mix of high-volume "afl/coach/sport" + niche
differentiators "rotation/auskick" so you compete in both lanes.)*

---

## Tags *(Play Store only — pick 5 from their predefined list)*

- **Sports**
- **Team Sports**
- **Coaching**
- **Football**
- **Sports Tracking**

---

## What's new in this version *(both stores have a release-notes field, ~140 char)*

```
First release. Fair rotation suggester, live game clock, quarter-break recap, offline support. Built for junior AFL and netball.
```

---

## URLs

| Field                        | Value                                                 |
| ---------------------------- | ----------------------------------------------------- |
| **Privacy Policy URL**       | `https://www.sirenfooty.com.au/privacy`               |
| **Support URL**              | `https://www.sirenfooty.com.au/support`               |
| **Marketing URL** (optional) | `https://www.sirenfooty.com.au`                       |
| **Contact email** (Play Store, public) | `hello@tribebikes.com.au`                   |

---

## Category + rating

- **Primary category** (both stores): **Sports**
- **Age rating**: **4+** (no violence, no UGC visible outside the
  team, no in-app purchases, no advertising)

---

## App Review Information (Apple) / Demo credentials (Google)

Provisioned by `npm run seed:app-review` (idempotent — re-run any
time). Output prints the canonical credentials block; paste as-is
into the submission form. The seeded account includes three games
at different lifecycle stages so the reviewer can walk the whole
flow end-to-end.

```
Email:    appreview@sirenfooty.com.au
Password: SirenReview2026!
Sign-in:  email + password (toggle on /login page)
```

**Reviewer walkthrough notes** (paste into the App Review notes
textarea — Apple's optional but helpful, Google's required):

```
Siren Footy is a game-day team management app for junior AFL and
netball coaches. Suggested walkthrough for review:

1. Sign in with the demo credentials above. Lands on the team
   page for "Siren Demo FC" (AFL, U10).
2. Open the round 1 game (status: completed) to see the
   post-game summary card + scoring recap.
3. Open the round 2 game (status: live, mid-Q2) to see the
   in-game UI — clock, score-bug, swap affordances.
4. Open the round 3 game (status: upcoming) and tap "Start game"
   to walk the pre-game flow: mark availability → lineup picker
   → kickoff.
5. Tap your avatar (top-right) → "My account" to see the
   account-deletion affordance required by App Store guideline
   5.1.1(v). The 30-day soft-delete + restore flow is documented
   here; please DO NOT confirm the deletion on the demo account.

The app is a Capacitor WebView shell around our hosted Next.js
app at https://www.sirenfooty.com.au. Sign in with Apple is
available on iOS but cannot be tested with this demo account —
test on a personal Apple ID if needed.
```

---

## Pre-submission checklist

Before pasting any of the above into a submission form:

- [ ] `/support` resolves on the prod URL (deploy from main has
      landed; `https://www.sirenfooty.com.au/support`)
- [ ] `/privacy` resolves (existed before, but confirm)
- [ ] `npm run seed:app-review` has been run against prod Supabase
      and the credentials work via the prod login page
- [ ] App icon visible in TestFlight / Play Console internal track
      and reads as the S + dot lockup (not the Capacitor 'C')
- [ ] Screenshots prepared per format (next prep item — see
      `mobile/store/screenshots/` once captured)
