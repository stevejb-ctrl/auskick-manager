# Pages CMS — homepage content editing

This is the walkthrough for Steve (or anyone) to edit the marketing
homepage strings without touching code or asking a developer.

## TL;DR

1. Go to https://app.pagescms.org/
2. Sign in with GitHub.
3. Open the `stevejb-ctrl/auskick-manager` project.
4. Click **Homepage** in the left sidebar.
5. Edit fields → **Save**.
6. Wait ~2 minutes. The change is live at https://sirenfooty.com.au.

That's it. No build step, no deploy button, no terminal.

## What's editable

Today, only the **shared cross-sport homepage content**:

- **Hero section** — the big headline, the subtitle paragraph
  underneath it, and the tiny uppercase trust line under the CTA
  buttons.
- **Per-sport eyebrows** — the small "Built for junior X" line that
  swaps as the hero carousel rotates through AFL / League / Netball /
  Union.
- **Trust band** — the four "1,200+ Coaches / 38k Games tracked / 4.9★
  Parent rating / 0 Clipboards" stats.

Deep per-sport prose (the long scrolling features section) is still
in code at `src/lib/sports/brand-copy.ts` — promoting that to the
CMS is a follow-up when the per-sport content stabilises.

## How it works under the hood

- The CMS schema is `.pages.yml` at the repo root. It tells Pages CMS
  which file to edit and what fields the file contains.
- The content lives in `content/marketing/home.json`.
- When you click Save in Pages CMS, it writes the JSON file and
  pushes a commit to `main`.
- Vercel watches `main` for changes and auto-deploys. The whole loop
  is usually 1–2 minutes from Save to live.
- TypeScript validates the JSON shape at build time via
  `src/lib/marketing/homeContent.ts` — if a required field is
  missing or mis-typed, Vercel's build will fail loudly rather than
  ship a broken page.

## First-time setup (one-off)

If Pages CMS isn't connected yet:

1. **Sign up at https://app.pagescms.org/** with GitHub. Pages CMS
   is free for public repos. `stevejb-ctrl/auskick-manager` is
   private, so you'll need the **Pro plan** (free trial available).
2. **Authorise the GitHub app** when prompted — it only needs read
   + write access to this repo.
3. **Add the project**: pick `stevejb-ctrl/auskick-manager`, branch
   `main`. Pages CMS auto-detects `.pages.yml` and lists the
   Homepage collection.
4. **Bookmark the project URL** so you don't have to navigate from
   the dashboard every time.

## Editing tips

- **Em-dashes & special characters**: paste them in directly. The
  JSON file is UTF-8, no escaping needed.
- **The trust line**: keep it UPPERCASE with ` · ` (space + middle
  dot + space) between items. The CSS uppercases nothing — what you
  type is what renders.
- **Saving with a typo / missing field**: Pages CMS will mark the
  field red and refuse to save. If a save somehow lands a bad
  payload, Vercel's build will fail and the previous version stays
  live — you can't break production from the CMS.
- **Don't rename `path:` in `.pages.yml`** unless you also rename
  the JSON file and update the loader import in
  `src/lib/marketing/homeContent.ts`. The three need to stay in
  sync.

## Adding a new field

1. Add the field to `content/marketing/home.json` with a default value.
2. Add the matching field to the `HomeContent` interface in
   `src/lib/marketing/homeContent.ts`.
3. Add the field to `.pages.yml` under the appropriate `fields:`
   block so the CMS surfaces it in the editor.
4. Use it from the relevant component (HeroCarousel, TrustBand,
   etc.).
5. Commit + push. The CMS picks up the new field the next time you
   reload the editor.

## Adding a new sport eyebrow

When a new sport launches:

1. Add the sport id to `MarketingSportId` in
   `src/lib/sports/marketing-sports.ts`.
2. Add the eyebrow string to `content/marketing/home.json` under
   `sportEyebrows`.
3. Add the field to `.pages.yml` under the `sportEyebrows` object
   block.

The `getHeroEyebrow()` helper falls back to AFL if a sport id ever
points at a missing eyebrow, so steps 1–2 are technically enough to
not break the page — step 3 just exposes the new sport to the CMS
editor UI.

## When the CMS won't help

The CMS is for **strings**, not **structure**. If you want to:

- Reorder picker cards → edit `MARKETING_SPORTS` in `marketing-sports.ts`.
- Change colours → edit the `accent` hex in `marketing-sports.ts`.
- Add a new section → that's a code change.
- Swap a screenshot → upload to `public/marketing/screenshots/` and
  update `heroScreenshot` in `marketing-sports.ts`.

For those, ping a developer (or open the codebase yourself — they're
all small focused files).
