# Siren Footy — Marketing Handoff (AFL)

A briefing for an external marketing agency or freelancer working on the
AFL side of Siren ("Siren Footy"). Everything here describes the
product **as it ships today** — no roadmap items, no aspirational
features.

The companion netball brand ("Siren Netball" at sirennetball.com.au)
shares the same engine but is out of scope for this brief.

---

## 1. One-line pitch

> Fair rotations and a calm Saturday morning for volunteer junior AFL coaches.

## 2. What it actually is

Siren Footy is a web app (with a native iOS shell) that lets a junior
AFL coach run game day from their phone. It replaces the laminated
clipboard, the spreadsheet a club captain emails out on Friday, and
the generic interval timer that doesn't know what a quarter is.

Core promise: **every kid gets a fair go, and the coach doesn't have
to count.**

- Live URL: **https://www.sirenfooty.com.au**
- iOS app: **https://apps.apple.com/au/app/siren-footy/id6768541987** (live since 2026-05-19)
- Android: web/PWA today; native shell on the roadmap
- Pricing: **Free for the entire 2026 season.** No subscription, no
  in-app purchase, no credit card collected.

## 3. Who it's for

Primary persona: **the volunteer coach of a junior AFL team** —
usually a parent of a player, often coaching for the first or second
time, no fancy footy coaching background.

Their problems, in their words:
- "I'm trying to remember who's had a turn at full forward while also
  watching my own kid run on."
- "The parents are watching me to see if their kid gets enough time."
- "Someone forgot to mark availability and now I'm short two players."
- "I shouldn't need a finance degree to track this in a spreadsheet."

Secondary persona: **the team manager / assistant coach** — handles
availability, fill-ins, and acts as a backup scorer.

Tertiary persona: **parents on the sideline** — want to know when
their kid is on, what zone, and the score. They don't want an app
or an account.

## 4. Capabilities — the full inventory

Grouped by the coach's actual day. Numbers in parentheses point to
the matching block in the existing marketing copy
(`src/lib/sports/brand-copy.ts` → `AFL_COPY`).

### Setting up the team (one-off)
- **Multiple teams per account.** A coach with kids in two age groups
  can run both from one login. Multi-sport too (AFL + netball
  siblings).
- **Squad builder.** Add players by name + optional jersey number.
  Up to 15 active players per team.
- **Player chips (5).** Three optional coloured tags per team. Out
  of the box they map to positions (Forward / Centre / Back) so the
  rotation engine respects positional preferences. Or coaches define
  their own — e.g. *"older/younger"* to mix experience every line,
  or *"stays with these kids"* for kids who need a steady partner.
- **Onboarding flow** that walks a first-time coach from sign-up to
  first game in about five minutes.

### The week before a game
- **Availability marking (3).** One tap per player to mark them
  available or unavailable. Mark them on the train home from work,
  finish in the kitchen Friday night.
- **PlayHQ integration (8).** Fixtures auto-imported from the
  league's PlayHQ schedule. Results sync back after the game.
- **Team invites.** Admins can invite assistant coaches, team
  managers, or parents by email. The system recognises existing
  Siren users (one-click add) and falls through to a magic link for
  everyone else.

### Game day, pre-bounce
- **Fill-ins on the day.** Add a brother who's filling in, with a
  jersey number, and Siren rebalances the rotation as if they'd
  always been on the squad.
- **Drop your numbers to match the opposition.** If you're at 18
  and they show up with 14, drop to 14 and Siren rebuilds rotations
  for the smaller squad.

### During the game
- **Live game clock.** Quarter-aware, hooter at period end, pause +
  scrub + resume.
- **Fair rotations engine (1).** Tracks per-zone minutes for every
  player across every quarter AND across the entire season. Suggests
  the next lineup weighted toward kids with lower zone minutes.
  Real-time fairness bars so the coach can see "Sam's had three
  quarters at full back, swap him to forward."
- **One-tap quarter break (6).** A suggested next-quarter lineup
  appears at every break. Accept it, drag to tweak, or build it
  yourself — fairness score updates live as you adjust.
- **Long-press a player for mid-game pivots (4).** Lock them to a
  zone, mark them as injured (they drop from rotation), or lend them
  to the opposition and track their time separately.
- **Optional scoring (2).** Track goals and behinds for both teams
  with one tap each. Opt-out completely if your league doesn't keep
  score at this age.
- **Optional goal song.** Plays automatically when your team kicks
  a goal. Or off, if you'd rather hear the kids cheer.

### Parent involvement
- **Read-only share link (7).** Tap "share" on a game and send a
  link to a sideline parent. They can see lineup, scores, and quarter
  progress in real time. No app download, no account, no friction.
- **Runner / scorer mode.** Same link concept, but write access —
  a parent on the sideline can record goals/behinds while the coach
  manages rotations. Taps queue offline and sync when the WiFi
  returns.

### After the game
- **Auto-saved stats (9).** Per-player zone-minute totals roll up by
  season. Top goal-kicker leaderboard. Fairness variance across the
  squad — Siren flags kids who've been stuck on the bench too long
  so coaches can rebalance mid-season.
- **Quarter recap to the group chat.** Copy a summary at any quarter
  break to paste into the team WhatsApp.

### Across the brand
- **Web + iOS app.** Same product, both surfaces. iOS users get push
  notifications (invite-accepted, etc.) and a native splash.
- **Offline-tolerant.** Field WiFi is famously bad — taps queue and
  sync when the connection returns.
- **No ads. No in-app purchases. No data sold.** This matters
  because the audience is parents of kids.

## 5. Existing positioning — what we're already saying

This is the source of truth for tone of voice. The agency should
read these, then either riff on them or propose alternatives.

### Live marketing site (sirenfooty.com.au)
| Surface | Copy |
|---|---|
| Product name | **Siren Footy** |
| Tagline | **Made for volunteer coaches.** |
| Banner | "Free for the entire 2026 season." → "Sign up in under a minute" |
| Hero eyebrow | "Built for junior AFL" |
| Hero H1 | **"Run game day. Keep your head up."** |
| Hero subtitle | *"Three-zone rotations. Fair game time across the quarters. Late arrivals, injuries, fill-ins. Siren knows the intricacies of junior AFL that generic sub-timers miss. So you can stop juggling a clipboard and watch your kid play."* |
| Hero trust line | **FREE 2026 SEASON · WORKS ON ANY PHONE · NOW ON THE APP STORE** |
| Centrepiece headline | "Everything you need to make game day a **breeze**." |
| Final CTA eyebrow | "Saturday morning is coming" |
| Final CTA title | **"Set up your team in about five minutes."** |
| Final CTA body | "Free for the entire 2026 season. Works on the phone you already have. No app download, no credit card." |

### Social-proof stats (currently in the trust band)
- **1,200+** Coaches
- **38k** Games tracked
- **4.9★** Parent rating
- **0** Clipboards

> ⚠️ Verify these with Steve before the agency leans on them. The
> first three are aspirational placeholders from launch; "0
> Clipboards" is real.

### App Store listing (subset — see `mobile/store/listing.md` for full text)
- App Store name: **Siren Footy**
- Subtitle: *"Fair rotations on game day"*
- Short description: *"Fair rotations and a live game clock for junior AFL and netball coaches."*

## 6. Tone of voice

Pulled from existing copy. The agency should hold to this even if
specific lines get rewritten.

**Do:**
- Speak to the coach, not the player ("watch your kid play", not
  "give every player game time").
- Be direct. "Run game day. Keep your head up." — that's six words,
  two clauses, and a complete thought.
- Acknowledge the volunteer reality. They are not paid, they are
  not pros, and they would rather be watching their kid.
- Use specific, concrete language. *"Three-zone rotations"*, *"the
  hooter at period end"*, *"the parent on the sideline"*. Junior AFL
  has a vocabulary — use it.
- Be honest about the free year. It's not a "limited time offer"
  trick — Steve is genuinely shipping it free for 2026 to build a
  user base.

**Don't:**
- ❌ Corporate-speak ("seamless", "powerful", "intuitive", "robust",
  "best-in-class", "next-generation").
- ❌ Treat coaches like clients of a B2B SaaS product. They're not.
- ❌ Promise "fair" outcomes — *promise the tools that help them
  deliver fairness*. The coach is still the decision maker.
- ❌ Lean on the iOS app as a differentiator above the web product
  — most users will be on the web, and the messaging has been "no
  app download required" since launch. The App Store presence is
  additive ("now on the App Store") not the headline.
- ❌ Compare directly to competitors by name. There's a vague
  "generic sub-timers" framing in the hero subtitle; that's the
  level of competitor mention to stick to.

## 7. Visual / brand identity assets

What lives in the repo today (the agency should ask Steve for
high-res versions):

- **Wordmark**: `src/components/marketing/SirenWordmark.tsx` (SVG)
- **App icons / logo**: `public/siren-logo-120.png`, `public/siren-logo-512.png`
- **Marketing screenshots**: `public/marketing/screenshots/` —
  `live-game.png`, `rotations.png`, `scoring.png`, `availability.png`,
  `flexibility.png`. Used on the marketing site features section.
- **App Store screenshots**: `mobile/store/screenshots/` —
  iPhone 6.5" + 5.5", iPad if needed.
- **Brand palette**: brand orange (the "alarm" accent in the banner
  link), ink (near-black for body type), warm (cream background),
  hairline (light grey border). Tailwind config has the exact hex
  values — agency should pull from `tailwind.config.ts` or the
  rendered site.
- **Typography**: sans-serif body type, *Instrument Serif* italic
  for the one-word accent in headlines ("breeze", "fair", "five").
  See `src/components/marketing/TitleAccent.tsx`.

## 8. Suggested marketing angles for the agency to consider

Not prescriptive — these are starting points for them to test
against.

1. **"Watch your kid play."** The emotional payoff of the whole
   product. Most junior coaches are parents of players. The
   clipboard means they're looking at paper instead of their kid.
2. **"Every kid gets a fair go."** The fairness engine made
   concrete. Targets the parent-of-bench-warmer dread.
3. **"Saturday morning calm."** Lifestyle/feeling, not a feature.
   Riff on the "Saturday morning is coming" CTA.
4. **"Made by a coach, for coaches."** Authenticity / origin story.
   Steve built this for his own team — leans into the volunteer-
   not-corporate identity.
5. **"Free for the season."** Top of funnel. Generous, no-catch,
   no-credit-card.
6. **"PlayHQ in, fairness out."** For the practical / data-curious
   coach who wants to see the rotation engine actually working.

## 9. What we are NOT

To save the agency from chasing the wrong story:

- **Not a stats / performance-analysis tool** for elite AFL pathways.
- **Not for adult AFL** (though the engine technically works — we
  don't market it that way).
- **Not a parent-comms platform.** Notifications go to the team's
  Siren members; we don't host group chats, photos, or social.
- **Not a fundraising / club-management app.** PlayHQ already owns
  that surface and Siren integrates with it, doesn't replace it.
- **Not built on AI / "intelligent" hype.** The rotation engine is
  deterministic — explainable, reproducible, no LLM. That's a
  feature.

## 10. Contacts + resources

- **Product owner**: Steve (hello@sirenfooty.com.au)
- **App Store listing source**: `mobile/store/listing.md`
- **Live marketing site copy source**: `src/lib/sports/brand-copy.ts`
  (the `AFL_COPY` constant)
- **In-app help / FAQ**: https://www.sirenfooty.com.au/help — useful
  for understanding edge cases the agency might be asked about
- **Demo account** (for App Review + curious-agency walkthroughs):
  `appreview@sirenfooty.com.au` (password in the team password
  vault — ask Steve)
- **Brand**: AFL = orange accent; Netball = mint accent. The brand
  is dual-domain (sirenfooty.com.au + sirennetball.com.au) — keep
  AFL marketing on .com.au/sirenfooty.

## 11. Open items for Steve to confirm before the agency leans in

- [ ] Trust band numbers (1,200+ coaches / 38k games / 4.9★) —
      real or placeholder?
- [ ] Authoritative contact email for the agency to use on
      outbound. The repo currently shows `hello@sirenfooty.com.au`
      (product) and `hello@tribebikes.com.au` (personal) in
      different places.
- [ ] Whether the agency can quote the "made by a coach, for
      coaches" line, i.e. confirm Steve is comfortable being the
      face / origin story.
- [ ] Any leagues, clubs, or associations Siren is officially
      partnered with that the agency can name in case studies.
- [ ] Photography / B-roll: do we have any real game-day footage
      we can license to the agency, or do they need to source it?
