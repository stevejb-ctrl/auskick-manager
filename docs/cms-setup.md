# Decap CMS — homepage content editing

Walkthrough for editing the marketing homepage strings without
touching code. Built on [Decap CMS](https://decapcms.org/)
(formerly Netlify CMS) — open source, free, repo stays private.

## TL;DR

1. Go to https://www.sirenfooty.com.au/cms
2. Click **Login with GitHub** → approve.
3. Click **Homepage** → **Homepage content**.
4. Edit fields → **Publish** (top right).
5. Wait ~2 minutes. The change is live at https://sirenfooty.com.au.

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

- **Admin page**: `public/cms/index.html` loads Decap from unpkg
  (pinned to an exact version for security — see the comment in
  that file).
- **Schema**: `public/cms/config.yml` tells Decap which file to
  edit and what fields it has.
- **Content**: lives in `content/marketing/home.json`.
- **Auth**: a small OAuth proxy at `src/app/api/decap/auth` +
  `src/app/api/decap/callback` handles the GitHub OAuth dance so
  Decap can hold a GitHub token without ever seeing the OAuth
  client secret.
- **Publish flow**: when you click Publish in Decap, it calls the
  GitHub API to write the JSON file and push a commit to `main`.
- **Deploy**: Vercel watches `main` and auto-deploys. Total loop
  is usually 1–2 minutes from Publish to live.
- **Build-time validation**: `src/lib/marketing/homeContent.ts`
  has a `HomeContent` TypeScript interface that the JSON is
  type-checked against. If a required field is missing or
  mis-typed, Vercel's build fails loudly rather than shipping a
  broken page.

## First-time setup (one-off, do this once before the CMS works)

### 1. Register a GitHub OAuth App

1. Go to https://github.com/settings/developers → **OAuth Apps** →
   **New OAuth App**.
2. Fill in:
   - **Application name**: `Siren CMS` (or anything — only you see it)
   - **Homepage URL**: `https://sirenfooty.com.au`
   - **Authorization callback URL**:
     `https://www.sirenfooty.com.au/api/decap/callback`
3. Click **Register application**.
4. On the next page, note the **Client ID** (shown immediately).
5. Click **Generate a new client secret**, copy the secret value
   (only shown once — store it somewhere safe like 1Password).

### 2. Add the env vars to Vercel

1. In the Vercel dashboard → `auskick-manager` project → **Settings**
   → **Environment Variables**.
2. Add two variables, both for **Production** (and optionally
   Preview):
   - `GITHUB_OAUTH_CLIENT_ID` = the client ID from step 1.4
   - `GITHUB_OAUTH_CLIENT_SECRET` = the secret from step 1.5
3. Click **Save**. Then **Deployments** → on the latest production
   deploy, click **⋯** → **Redeploy** so the new env vars take effect.

### 3. (Optional) Restrict who can log in

By default, anyone with push access to `stevejb-ctrl/auskick-manager`
can log into the CMS — since the repo is private, that's already a
tight set (just you + any collaborators).

If you ever add a collaborator who shouldn't have CMS access:
remove them from the repo (or move to a separate `cms-editors`
GitHub team and gate via [GitHub OAuth App restrictions](
https://docs.github.com/en/organizations/restricting-access-to-your-organizations-data/about-oauth-app-and-github-app-access-restrictions)).

### 4. Try it

Visit https://www.sirenfooty.com.au/cms → click **Login with GitHub**.
You should see the Homepage collection and be able to edit fields.

## Editing tips

- **Em-dashes & special characters**: paste them in directly. The
  JSON file is UTF-8, no escaping needed.
- **The trust line**: keep it UPPERCASE with ` · ` (space + middle
  dot + space) between items. The CSS uppercases nothing — what you
  type is what renders.
- **Saving with a typo / missing field**: Decap will mark the field
  red and refuse to publish. If a bad payload somehow lands,
  Vercel's build fails and the previous version stays live — you
  can't break production from the CMS.
- **Don't rename `file:` in `config.yml`** unless you also rename
  the JSON file and update the loader import in
  `src/lib/marketing/homeContent.ts`. The three need to stay in
  sync.

## Adding a new field

1. Add the field to `content/marketing/home.json` with a default value.
2. Add the matching field to the `HomeContent` interface in
   `src/lib/marketing/homeContent.ts`.
3. Add the field to `public/cms/config.yml` under the appropriate
   `fields:` block so the CMS surfaces it in the editor.
4. Use the field from the relevant component (HeroCarousel,
   TrustBand, etc.).
5. Commit + push. The CMS picks up the new field the next time you
   reload the editor.

## Adding a new sport eyebrow

When a new sport launches:

1. Add the sport id to `MarketingSportId` in
   `src/lib/sports/marketing-sports.ts`.
2. Add the eyebrow string to `content/marketing/home.json` under
   `sportEyebrows`.
3. Add the field to `public/cms/config.yml` under the
   `sportEyebrows` object block.

The `getHeroEyebrow()` helper falls back to AFL if a sport id ever
points at a missing eyebrow, so steps 1–2 are technically enough to
not break the page — step 3 just exposes the new sport to the CMS
editor UI.

## Upgrading Decap CMS

The CMS script in `public/cms/index.html` is pinned to an exact
version (e.g. `decap-cms@3.12.2`). To upgrade:

1. Check the [Decap CMS releases](
   https://github.com/decaporg/decap-cms/releases) for the latest
   version and read the changelog.
2. Bump the version number in `public/cms/index.html`.
3. Test locally (`npm run dev` → visit `/cms`) before committing.

**Don't switch to a floating range like `^3.0.0`** — that means any
future Decap release runs in your logged-in browser without review,
and this page can write to the repo.

## When the CMS won't help

The CMS is for **strings**, not **structure**. If you want to:

- Reorder picker cards → edit `MARKETING_SPORTS` in `marketing-sports.ts`.
- Change colours → edit the `accent` hex in `marketing-sports.ts`.
- Add a new section → that's a code change.
- Swap a screenshot → upload to `public/marketing/screenshots/` and
  update `heroScreenshot` in `marketing-sports.ts`.

For those, open the codebase yourself (or ping a developer) — they're
all small focused files.

## Troubleshooting

**"Login with GitHub" opens a popup that immediately closes / fails**
- Most likely cause: env vars not set on Vercel or callback URL
  mismatch. Check the **Authorization callback URL** in the GitHub
  OAuth App matches `https://www.sirenfooty.com.au/api/decap/callback`
  exactly (no trailing slash, https not http).
- Check `GITHUB_OAUTH_CLIENT_ID` and `GITHUB_OAUTH_CLIENT_SECRET`
  are set in Vercel's env vars for the Production environment, and
  that you've redeployed since adding them.

**"State mismatch" error**
- Stale cookie. Close the popup, refresh `/cms`, try again.

**Publish succeeds but the site doesn't update**
- Wait 2 minutes — Vercel's build takes ~90s.
- Check the **Deployments** tab in Vercel: if the latest build
  failed, the error message will tell you which field tripped the
  TypeScript validator. Edit it in Decap and republish.

**Login works but I can't see any collections**
- Make sure `public/cms/config.yml` is being served — visit
  `https://www.sirenfooty.com.au/cms/config.yml` directly; you should
  see the YAML. If you get a 404, the file isn't in `public/cms/`
  or hasn't been deployed.
