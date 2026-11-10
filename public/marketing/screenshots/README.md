# Marketing screenshots

The public site's phone screenshots: the homepage and the ten sport pages.
All of them come from the real app (live v3), shot by one script, so
re-shoot them rather than editing them by hand.

## Layout

One folder per sport page slug (`netball`, `afl`, `rugby-league`, `soccer`,
`basketball`, `rugby-union`, `touch-football`, `oztag`, `hockey`, `futsal`),
each with the same files, 390 × 844 at 2× in the app's light theme:

| File           | What it shows                                              | Used by                         |
| -------------- | ---------------------------------------------------------- | ------------------------------- |
| `live.png`     | The live screen mid-period, the next sub under 30 s off    | Sport page hero and tour; homepage hero (AFL, netball, basketball); homepage feature (soccer) |
| `pairs.png`    | The pairs sheet with the sub due (netball: its next-quarter plan) | Tour; homepage feature (basketball) |
| `scoring.png`  | The scorer sheet after tapping the score button            | Tour                            |
| `break.png`    | The first break                                            | Tour                            |
| `fulltime.png` | The full-time review, before Finish game                   | Tour                            |
| `stats.png`    | The team's Stats page after the game                       | Tour; homepage features (AFL, netball) |
| `actions.png`  | A kid picked on the field, then More                       | Homepage feature (rugby league) |
| `runner.png`   | The parent's game-day link, signed out                     | Homepage feature (netball)      |

The paths are built by `sportShot()` in `src/lib/sports/marketing-sports.ts`
and `SHARED_FEATURES` in `src/lib/marketing/sportPages.ts`; the words and alt
text for each tour step are in `content/marketing/sports.json` (`tour`).
Keep the alt text true to the picture when you re-shoot.

## Re-shooting

`scripts/capture-marketing-v3.mjs` seeds a coach, a team and a game per sport
in the **local** Supabase only (it refuses any other URL), plays the game
through the UI, shoots each moment, then deletes everything it made. Kids'
names are made up.

```bash
# a production build of this checkout, served locally with .env.test loaded
next build && next start -p 3750
node scripts/capture-marketing-v3.mjs --base=http://localhost:3750
node scripts/capture-marketing-v3.mjs --only=break                 # one moment, every sport
node scripts/capture-marketing-v3.mjs --sport=netball,afl          # some sports
node scripts/capture-marketing-v3.mjs --only=break --sport=hockey  # both
```

A full run takes about an hour (each sport plays a whole game, the later
periods sped up). A moment it can't reach is reported, its old file is left
alone, and a `<slug>-error-debug.png` shows where it stuck (delete it).

The PNGs are the sources: `next/image` serves them resized and as WebP, and the
service worker doesn't precache this folder (`publicExcludes` in
`next.config.mjs`).
