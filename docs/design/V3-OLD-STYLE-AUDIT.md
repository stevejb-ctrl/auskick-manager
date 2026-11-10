# Live v3: what's still in the old style

Audit of 10 Nov 2026, on branch `claude/live-v3-picker`. Every game-day
surface was opened at 390 px wide in all ten sports plus an AFL big field
(18 a side): the pre-game lineup picker (coach and game-day link), the
availability page, the game page before kickoff, the live screen before
kickoff, and the team's squad, games, stats and settings pages. The live
screen in play, the period break and full time were rebuilt on v3 earlier
on this branch and were checked against that work rather than re-shot.

"v3" means the live screen's look: the sport's ground drawn dark
(`FieldLines`), kids as solid `KidTile`s with their names in chalk, lines
told apart by air and a faint rule with a small rotated margin label
("FORWARD 4 on"), the bench as a `KidBench` under the field, and plain
words instead of bars and zone colours.

## Fixed on this branch

| Surface | Sports | Was | Now |
| --- | --- | --- | --- |
| Pre-game lineup picker | AFL | White cards with FWD/CEN/BCK colour tags, jumper numbers, three-colour season bars, a "Season time in zone" key, a white Bench card | `PickerField`: the oval (`ovalField`), KidTiles, line counts, KidBench; season time in words ("Least Fwd") |
| Pre-game lineup picker | AFL big field | Zone grid with position labels | The formation, line by line, each kid in the seat Ready deals them ("CHB Jack S"), dense tiles |
| Pre-game lineup picker | Netball | Court drawing with coloured bib tokens, white Bench card of chips | The court (`netballCourt` + `netballCourtLine`): bibs zigzag down the court, KidBench |
| Pre-game lineup picker | Rugby league, union | White "Starting field" card with a count chip, old tiles, a brand "Selected …" banner | `rugbyField` with posts and try lines, `leagueFieldLayout` rows, FR / DH flags on KidTiles |
| Pre-game lineup picker | Soccer, futsal, hockey | Old pitch tiles, separate bench card | `soccerField` (pitch, futsal court, hockey pitch), keeper alone at the foot with the GK flag |
| Pre-game lineup picker | Basketball | Old court tiles and bench | `woodCourt`, forwards and guards, positions before the name |
| Pre-game lineup picker | Touch, Oztag | Old field and bench | `rugbyField` (no posts), lanes or Oztag's staggered Field line, mixed G/B marks for the coach |
| Game-day link (runner) picker | All but AFL | The same old pickers | The same v3 pickers (they're the same components) |
| "Lent to the other team" | All pickers + the break | Amber chip strips, a different one per sport; netball and league only in Game settings | One `LentList` card with a plain Bring back, at the break and before kickoff |
| Game settings › Lend a player | AFL, netball, league | Amber chips with a × repeating the lent kids | One `LendSetting` row: a note and a 44 px "+ Lend a player" |
| Tap hint | All pickers | Four wordings, some under a heading, some missing | The break's words over the field in every sport |

## Already v3 (no change needed)

- Live screen before kickoff and in play, all ten sports and AFL big fields.
- Period break, all sports (`PeriodBreak`).
- Full time and the game summary cards (rebuilt earlier on this branch).
- Availability page and the game page before kickoff: the site-wide card
  look from the design review, no zone colours or bars.

## Still old style: follow-up

Listed rather than redesigned here: each is either not a game-day field
surface or large enough to want its own design pass.

1. **Picker chrome above the field.** The "Game settings" collapse is a
   white card with a mono eyebrow; the break uses a status chip that opens
   a sheet. Moving the picker to the chip and sheet is a behaviour change
   (several specs open the collapse) and should be its own commit series.
2. **League vest rotation plan card.** A white card with an amber edge bar
   and FR / DH chips under the picker's field (league U8 and up).
3. **Soccer keeper card** (`KeeperHandoverCard`) on the soccer, futsal and
   hockey pickers: the older card style.
4. **Heading inconsistency.** League, union, soccer, futsal, hockey,
   basketball, touch and Oztag show an "Under 10 starting lineup" heading
   over the picker; AFL and netball don't.
5. **AFL's game-day link** opens on a full-page In/Out list ("Continue to
   starting lineup") without the live top bar every other sport's link
   has; the other sports open straight on the picker with Who's here
   folded into a row.
6. **Stats tables** (`PlayerStatsTable`) still colour minutes by zone
   (`zone-*` tokens). Not game-day; wants its own pass with the
   season-balance view.
7. **Squad, games and settings pages** use the design-review card look,
   not the v3 field look. They aren't field surfaces, so this is a
   question of whether v3's chalk-on-grass language should reach them at
   all.
8. **Large text set from the page** (`html { font-size }`) doesn't switch
   the tiles to two across, because `bigtext:` answers to the phone's
   text setting (media queries use the default font size). With the
   phone's own 200% setting the picker's rows go two across and every
   name is whole; with only the page's size raised, a row of four cuts
   names ("Oc…"). The live screen behaves the same.
