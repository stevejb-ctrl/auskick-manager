# Positive position selection — audit (Phase A)

21 Oct 2026 · read against `origin/main` @ `3726d2b5` · no code changed.

Steve's direction: **"Check all the sports and make sure this negative
state does not exist."** Every sport's role sheet should say where a
kid plays, never where they don't.

This audit lists every place the negative state lives, and how to
remove it without losing anyone's saved roles. It ends with the five
decisions Steve needs to make before Phase B starts.

---

## 1. The short version

- **There is one role sheet**, shared by every sport:
  `src/components/playbook/PlayerRoleSheet.tsx`. Flipping it flips
  every sport at once, so Phase B is one shared change, not one per
  sport.
- **Every sport except AFL U8–U10 (Auskick) shows "Never plays" today.**
  AFL U8–U10 shows no role sheet at all, because the zone rules
  already rotate every kid through every line. Strategies with a home
  spot show "Never plays" *under* the positive sections; strategies
  without one show *only* "Never plays", which is what Steve hit.
- **The database stores roles as rows** in `player_position_prefs`, with
  `kind` one of `home`, `also`, `never` or `keep_on`. Every engine
  reads those rows the same way, through `rolesFromPrefs()`
  (`src/lib/playbook/roles.ts`).
- **Recommended:** make the sheet positive and keep storing the same
  rows underneath. Ticking "Plays as Back, Centre" saves `never:
  Forward`, exactly what is stored today. This needs no schema
  migration and no backfill. Old records read back correctly ("never
  Forward" shows as "Plays as Back, Centre"), and the AFL, netball,
  rugby and soccer engines need no change at all.
- **Basketball has a real engine bug** whatever we decide: its
  suggester ignores both `never` and `keep_on`, so today those
  controls on a basketball team do nothing.

---

## 2. Every sport, as it is today

"Negative only" means the sheet shows only "Never plays" and "Keep on".
"Both" means it shows the positive sections (home / preferred spot and
"Also plays") with "Never plays" underneath.

| Sport | Ages | Strategy | Sheet options | Framing today | Engine reads `never`? | Engine reads `keep_on`? |
|---|---|---|---|---|---|---|
| AFL | U8–U10 (zoned) | any | — | **No sheet** (zones rotate everyone) | — | — |
| AFL | U11+ | Suggested, Rotate lines, Keep last quarter, Set manually, Free rotation | Forward / Centre / Back | Negative only | Yes, hard filter (`fairness.ts`, `afl/engine.ts`) | Yes |
| AFL | U11+ | Preferred lines | Forward / Centre / Back | Both | Yes | Yes |
| AFL | U11+ | Set positions | Team's positions (custom allowed) | Both | Yes, per position and per line | Yes |
| Netball | all | By thirds, Position by position, Position cycle | Attack / Centre / Defence thirds | Negative only | Yes (`netball/engine.ts`) | Yes |
| Netball | all | Partners | Bibs (GS … GK) | Both | Yes | Yes |
| Netball | all | Set positions | Bibs | Both | Yes | Yes |
| Rugby league | Mini Footy ages | Both lines | Forwards / Backs | Negative only | Yes (`rugby_league/engine.ts`) | Yes |
| Rugby league | Mod League ages | Preferred line | Forwards / Backs | Both | Yes | Yes |
| Rugby league | older ages | Named positions | Team's positions (custom allowed) | Both | Yes, per position and per line | Yes |
| Rugby union | U6–U9 | Both lines | Forwards / Backs | Negative only | Yes (shares league's engine) | Yes |
| Rugby union | U10–U11 | Preferred line | Forwards / Backs | Both | Yes | Yes |
| Rugby union | U12+ | Named positions | Team's positions (custom allowed) | Both | Yes | Yes |
| Basketball | U8–U10 | Equal minutes | Guards / Forwards | Both | **No** | **No** |
| Basketball | U12–U14 | Guards and forwards | Guards / Forwards | **Negative only (Steve's report)** | **No** | **No** |
| Basketball | U16+ | Home line | Guards / Forwards | Both | **No** | **No** |
| Basketball | any | All five positions | Guards / Forwards (should be 1–5) | Negative only | **No** | **No** |
| Basketball | any | Set positions | Positions 1–5 | Both | **No** | **No** |
| Soccer | U8–U11 | Everyone has a turn in goal | Keeper | Both | Yes: "not here: Keeper" = rather not go in goal | Yes |
| Soccer | U12+ | Keepers | Keeper | Both | Yes | Yes |
| Soccer | U6–U7 | Equal minutes (4 a side) | none | Keep on only | — | Yes |

AFL senior isn't a separate sport config. It's AFL at older ages, with
the same strategies as AFL U11 and up. There is no Auskick config
either: Auskick is AFL U8–U10.

---

## 3. Every negative string

**The role sheet** (`src/components/playbook/PlayerRoleSheet.tsx`):

| Line | Today | Proposed |
|---|---|---|
| 64 | doc comment "home spot, also plays, never plays, keep on" | "plays as, main spot, plays every minute" |
| 161, 163 | heading and group label **"Never plays"** | **"Plays as"** (pill group, tick = plays here) |
| 162 | "Siren won't suggest this {line} for them." | "Siren suggests them only here. Pick none and they play anywhere." |
| 108, 110 | "Home position" / "Preferred line" | "Main position" / "Main line" (picked from the "Plays as" ticks) |
| 135, 136 | "Also plays" | removed: folded into "Plays as" (see §5) |
| 171 | `tone="danger"` red pills | brand (green) pills |
| 188, 193 | "Keep on, every game" | "Plays every minute" (see §6) |
| 189–191 | "Plays as much as the rules allow, all season. For one game, long-press them on the lineup." | "Siren keeps them on as long as the rules allow, every game. For one game only, long-press them on the lineup." |

**Elsewhere:**

| File | Line | Today | Proposed |
|---|---|---|---|
| `src/lib/playbook/roles.ts` | 105–113 `describeRole` (squad list subtitle) | "Home FF · also CHF, HFF · not R · keep on" | "Plays FF, CHF, HFF (main FF) · every minute" |
| `src/lib/playbook/roles.ts` | 1, 80 | comments "not here" | reword |
| `src/components/live/LockModal.tsx` | 413 | button subtitle "Home, also plays, never plays, keep on" | "Where they play, every minute" |
| `src/components/live/LockModal.tsx` | 89 | doc comment | reword |
| `src/app/help/squads/page.tsx` | 105 | Help: **"Never plays — Siren won't …"** | rewrite the roles section positively |
| `src/app/help/rotations/page.tsx` | 69 | Help: "never plays, keep on" | reword |
| `src/components/playbook/KeepOnMarker.tsx` | 1, 13, 14 | marker aria-label and title "Keep on, every game" | "Plays every minute" |
| `src/components/live/PlayerTile.tsx` | 58 | doc comment | reword |
| `src/components/league/LeaguePlayerTile.tsx` | 96 | doc comment | reword |
| `src/components/netball/PositionToken.tsx` | 64 | doc comment | reword |
| `src/components/live/LineupPicker.tsx` | 120 | doc comment | reword |
| `src/components/netball/LineupPicker.tsx` | 165 | doc comment | reword |
| `src/components/league/LeagueLineupPicker.tsx` | 147 | doc comment | reword |
| `src/lib/sports/soccer/playbook.ts` | 12, 54 | comments "Not here: Keeper" | "Doesn't take a turn in goal" |
| `src/lib/fairness.ts` | 735 | comment "Never plays is a hard filter" | reword (logic unchanged) |

Not role framing, so these stay: `LiveGame.tsx:830` ("never plays the
goal song"), `subDueBeep.ts:12`, `LongPressHint.tsx:131` and
`ScoreRecordingDock.tsx:51` (the long-press action "keep on", which is
the one-game override), and the help page heading "Player actions: keep
on, injury, loan" (same one-game action).

---

## 4. Where roles are read and written

All reads go through `rolesFromPrefs()`, and all writes through
`prefsFromRole()`, both in `src/lib/playbook/roles.ts`:

- **Write:** `savePlayerRole` in
  `src/app/(app)/teams/[teamId]/settings/howWePlayActions.ts`. It
  replaces all of a player's rows on each save.
- **Read for the sheet and squad list:** `loadSquadRoles`
  (`src/lib/playbook/load.ts`), `useRoleSheet`, `PlayerRow`, and the
  AFL, netball and league lineup pickers.
- **Read for the engines:**
  - AFL: `src/lib/sports/afl/engine.ts` (lines 108–128, 152, 198, 261–295) and `src/lib/fairness.ts` (735–741, 1023)
  - Netball: `src/lib/sports/netball/engine.ts` (86, 103–105) and `netball/fairness.ts` (794)
  - Rugby league and union: `src/lib/sports/rugby_league/engine.ts` (60–90) and `rugby_league/fairness.ts` (1207, 2457, 2480)
  - Soccer: `src/lib/sports/soccer/playbook.ts` (97–103: `notInGoal` from `kind = 'never'` on the Keeper line)
  - Basketball: `src/lib/sports/basketball/playbook.ts` `basketballPrefs` (home and also only)
  - Game plan: `src/lib/game-plan/project.ts` (444, keep on)
- **Season balance and rule check:** `src/lib/playbook/seasonBalance.ts`
  and `ruleCheck.ts`, which use "never" only in the sense of "never
  played yet". Unaffected.

**Database:** `player_position_prefs.kind` has
`check (kind in ('home','also','never','keep_on'))` (migration 0053).
Every sport uses the same table, so the record shape is shared too.

---

## 5. Migration plan: store the same rows, show them positively

**Recommendation: no new column, no new `kind`, no backfill.** The
positive "Plays as" set is the complement of the stored `never` rows:

```
read   plays_as = never is empty ? []                 ("anywhere")
                                 : options − never
write  never    = plays_as is empty ? []
                                    : options − plays_as
```

This is the read-time migration Steve asked for, done in the data
layer (`rolesFromPrefs` / `prefsFromRole`). It has four advantages:

- **Old records convert themselves on read.** A player stored as
  `never: Forward` (AFL lines) reads as **Plays as Back, Centre**. This
  is the verification case, and it will be a Vitest unit test plus an
  e2e test through the squad screen.
- **The stored meaning is identical,** so "Plays as X, Y" excludes
  everything else exactly as `never` does today. The AFL, netball,
  rugby and soccer engines don't change (Steve's step 5 is satisfied
  without touching them).
- **Nothing to roll back.** Old and new code read and write the same
  rows, so a deploy can be reverted safely.
- **No DB migration**, so nothing for `db-push.yml` to apply.

**"Also plays" folds into "Plays as".** Today "Also plays" is a soft
preference ("lean here as well") and "Never" is a hard filter. With one
positive group, the ticks are hard, and the main spot is chosen among
them. Writing a tick set saves `home` = the main spot, `also` = the
other ticked spots, and `never` = the unticked ones. The engines keep
their soft ordering (main first, then the other ticks) for free.

**The one lossy case.** A player saved with `also` rows but **no**
`never` rows reads as "anywhere". The sheet would show their `also`
spots ticked but stores no restriction. If the coach then saves without
changing anything, those spots become hard (the others get `never`
rows). Two ways to handle it (Steve's decision, Q3):

- **(a) Show it as it will save.** Show their `also` spots ticked, with
  a one-line note on first open: "Saving will keep them to these
  spots." Simple and honest.
- **(b) Preserve the old meaning.** If nothing changed, re-save the
  original rows untouched. Safer, but a hidden special case.

Before Phase B, a read-only count of affected rows on prod would size
this:
`select count(distinct player_id) from player_position_prefs p where kind = 'also' and not exists (select 1 from player_position_prefs n where n.player_id = p.player_id and n.kind = 'never');`

**If Steve prefers a true positive column instead** (a new `kind =
'plays'`): it needs migration 0070 to widen the check constraint,
read-time conversion of `never` rows, and changes to every engine
listed in §4. It's more work and more risk for the same result. One
difference is real: with complement storage, a position the coach
adds *later* is open to everyone (nobody has a `never` row for it). With a
positive column, it's closed until ticked. The complement behaviour
seems right for a new spot, but it's Steve's call (Q2).

---

## 6. "Keep on, every game"

It isn't a position setting. It means "plays as many minutes as the
rules allow", for example a kid the coach always wants on court. Four
engines read it (AFL, netball, rugby, game plan). Ticking "Plays as
Guard" doesn't imply it: a guard can still sit out a rotation.

**Recommendation: keep it, positively worded**, and move it below the
position pills with its own heading:

```
┌──────────────────────────────────────┐
│ Maya Chen                         ✕  │
│                                      │
│ Plays as                             │
│ Siren suggests them only here.       │
│ Pick none and they play anywhere.    │
│  [ Guards ✓ ]  [ Forwards ]          │
│  Main: Guards ★                      │
│                                      │
│ ──────────────────────────────────── │
│ Plays every minute            [ ○ ]  │
│ Siren keeps them on as long as the   │
│ rules allow, every game. For one     │
│ game only, long-press them on the    │
│ lineup.                              │
│                                      │
│ [          Save role          ]      │
│             Cancel                   │
└──────────────────────────────────────┘
```

Under a named-positions strategy (rugby U12+, AFL set positions), the
pills are the team's positions, with the add-a-position link (§7):

```
│ Plays as                             │
│  [ LP ] [ HK ] [ TP ] [ LK ✓ ]       │
│  [ BF ✓ ] [ OF ] [ N8 ] [ SH ] …     │
│  Main: Lock ★   + Add a position     │
```

On soccer (one option, Keeper):

```
│ In goal                              │
│  [ Takes a turn in goal ✓ ]          │
│  Main: Keen keeper ★                 │
```

Soccer's default stays "takes a turn". Unticking it stores `never:
Keeper`, today's "not here: Keeper".

**If Steve would rather drop the toggle:** remove the section and stop
writing `keep_on`. Old `keep_on` rows would then be ignored, since all
four engine readers would be removed with it, and the lineup tile's
keep-on marker goes too. The one-game long-press "Keep on" action is
separate and stays either way.

---

## 7. "+ Add a position": which sports have it

Today, adding, renaming and removing positions lives in How we play's
positions step, and only where the sport's position model allows it:

| Sport | Custom positions today | Proposed in the sheet |
|---|---|---|
| AFL U11+ (Set positions) | **Yes** (`canAddRemove: true`) | Show "+ Add a position" |
| AFL lines (any other strategy) | No: Forward / Centre / Back are the lines | Hide |
| AFL U8–U10 | No sheet | — |
| Rugby league / union, named-position ages | **Yes** (shipped 16 Oct, `5d3bbc41`) | Show |
| Rugby, line strategies | No: Forwards / Backs | Hide |
| Netball | No: bibs are fixed by the rules | Hide |
| Basketball | No: positions 1–5 are fixed (`kind: "fixed"`) | **Steve to decide** ("bench specialists"?) |
| Soccer | No: only Keeper | Hide |

The link goes to How we play's positions step (one source of truth for
the team's position list). It doesn't add a position for one player
only, because a position has to exist on the field layout and in the
engine for Siren to suggest it.

Note: AFL *does* allow custom positions today, under Set positions,
which differs from the brief's assumption that AFL is closed.

---

## 8. Basketball fixes needed either way

1. **Honour the hard filter.** `basketballPrefs` ignores `never`, so
   "Plays as Guards" would be ignored too. Add it to the suggester (line
   and position), as the other sports do.
2. **Honour "Plays every minute"** (`keep_on`), as netball and rugby do.
3. **All five positions should offer positions 1–5** in the sheet, not
   the two lines (`roleModelFor`).
4. **Home line should weigh the other ticked line,** today's `also`
   lines, which `basketballPrefs` drops.

Each lands with a failing-first Vitest test in
`src/lib/sports/basketball/__tests__`.

---

## 9. Phase B shape (once approved)

One shared component, so it ships as a few focused commits rather than
one per sport:

1. `feat(roles): read and write roles as "Plays as"`: the
   `rolesFromPrefs` and `prefsFromRole` complement and fold, plus unit
   tests (including never Forward → Plays as Back, Centre).
2. `feat(roles): the role sheet says where a kid plays`: the
   `PlayerRoleSheet` flip, "Plays every minute", soccer's keeper
   wording, and the squad-list subtitle.
3. `fix(basketball): the suggester honours plays-as and every-minute`:
   §8 items 1–4.
4. `feat(roles): add a position from the role sheet`: §7, for the
   sports Steve approves.
5. `docs(help): roles in positive terms`: Help pages and comments.

**Tests.** A new `e2e/tests/positive-roles.spec.ts` will:

- seed an AFL U12 player with a stored `never: Forward` row, then
  check the squad sheet shows "Plays as Back, Centre", and that a save
  round-trip leaves the stored rows unchanged;
- seed a basketball U12 team, then tick Guards and check the suggested
  lineup never puts that kid at forward;
- check the role sheet in every sport has no "Never" text.

`role-sheet`, squad and lineup specs that assert "Never plays" will be
updated.

---

## 10. Decisions for Steve

1. **Storage.** Show positively and keep storing the complement
   (recommended: no migration, engines untouched), or add a true
   positive `plays` column (migration 0070 plus engine changes)?
2. **New positions.** When a coach adds a position later, should it be
   open to every kid (complement storage, recommended) or closed until
   ticked?
3. **Old "Also plays" records with no "never".** Show them as they'll
   save, with a one-line note (recommended), or preserve them silently?
4. **"Keep on, every game".** Keep it as "Plays every minute"
   (recommended), or remove it?
5. **"+ Add a position".** Confirm on for AFL Set positions and rugby
   named positions, and off for netball, soccer and lines. Basketball:
   on or off?
