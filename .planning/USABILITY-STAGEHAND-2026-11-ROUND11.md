# Round 11 (11–12 Nov 2026): the public site, new teams in every sport, whole games, team admin

## Build and method

- **Build.** Production builds of `claude/live-v3-sh4` (cut from `claude/live-v3` 9b1665d9: live v3 everywhere, the new homepage and sport pages, per-sport help hubs, v3 lineup pickers, the restyled /demo), served on :3716 against the local Supabase. Rebuilt three times as fixes landed; the later missions ran on the fixed builds.
- **Agent.** Claude Haiku 5.5 in Stagehand's hybrid mode, two lanes. Game-day seeds run the clock at 8×.
- **Stagehand runs.** 57 that ran (plus 3 that never started: the harness's sign-in or account creation timed out against a slow local Supabase, and were re-run).
- **Scripted checks.** A Playwright walk of the setup wizard in all ten sports (`onboard-drive`), DOM and layout probes at 320 px, 412 px and 200% text, event-log checks of every game, slow-network writes, and copies of live games at the moment a report described.
- **The machine.** CPU sat at 97–100% for most of the round (other apps as well as the runs). Stagehand's typing suffered most: dropped, duplicated and reordered keys, and native selects that changed the wrong thing. Where a report blamed a form, the same steps were replayed in Playwright before calling it a bug.
- **Severity.** P1: wrong data, or someone can't do the job. P2: a coach or parent gets it wrong or gives up. P3: polish.

| Area | Runs | Personas and devices |
|---|---|---|
| Public site, signed out | 15 | Curious parent (412, 320, 200% text); club comparing sports (desktop 1280, phone); five two-sport demo runs (412, 320, landscape 915×412, slow network); help reader (412, 200%); club secretary reading the fine print (desktop); sign-up from the site (412, 320) |
| New teams | 11 + 10 scripted | A brand-new coach in AFL (zones; set positions at 200% text), netball, rugby league, rugby union, soccer, futsal, hockey, basketball, touch (mixed), Oztag (mixed); the scripted walk in all ten |
| Whole games | 21 | Every sport's whole game with a late kid, injury and lend (AFL, netball twice incl. landscape, league, union, soccer, futsal, hockey, basketball, touch, Oztag); AFL big field to full time; parents on the game-day link (hockey landscape, Oztag, league at 200% text); coach plus a second phone (basketball, AFL); messy Saturdays (netball on a slow network, union, futsal landscape, soccer) |
| Team admin | 10 | Invites and roles (twice); squad edits; next week's availability (AFL, league); How we play (netball at 200%, AFL); help and settings from inside a team (touch, hockey); season stats |

Pass or fail, by what the persona set out to do:

- **Whole games:** every full game reached full time with scores that add up per period and per kid (12/12). Every time-played complaint (eleven of them) was the agent's arithmetic: each was checked against the period lengths in the event log and matched to the second.
- **Public site:** 15/15 reached what they came for; four found real bugs (below).
- **New teams:** the agent runs stalled on the squad step in 10 of 11 (Stagehand typing on a loaded machine, plus bug 1). The scripted walk passed in all ten sports: team, How we play, squad, a game, the lineup picker, each in its own sport's words and sizes.
- **Team admin:** 8/10. Both invite runs hung at a native `confirm()` (P3 friction 9).

## Real bugs (fixed, red first)

### 1. P2: The next kid's name, typed straight after Add player, was lost
- **Who:** every new coach adding a squad, on the wizard's squad step and the Squad tab.
- **Seen:** "hloe Nguyen", "va Smith", "Lily Okafo"; names that "wiped themselves". Five onboarding runs.
- **Cause:** `AddPlayerForm` disabled the name and number boxes while an add saved (0.8–1.7 s locally), so keys typed then went nowhere; then the success cleared the field.
- **Probe:** Playwright typed "Fast Typer" straight after Add: the box ended empty.
- **Fix:** the boxes clear as Add is tapped and stay open; a failed add puts the kid back unless the next one is already going in. Commit 86548b2b. Test: `stagehand-round11.spec.ts` #1.

### 2. P2: "Try the rugby league demo" went to the picker, not rugby league
- **Who:** anyone on a sport page. Both sport-shopper runs (desktop and phone) found it on every page.
- **Fix:** the sport page's link is now a form on the demo picker's own server action, with the same pending guard, so it starts that sport's demo. Commit 0009af5f. Test: #2 (rugby league, netball).

### 3. P2: The help search found nothing for "subs"
- **Who:** a coach searching help. "subs", "injury" and "fix score" all said "No topics match" on the main help: it matched titles only.
- **Fix:** a topic also matches on its blurb, word by word on each word's stem. Commit c506241a. Test: #3. The later help run at 200% text confirmed "subs" now finds Rotations.

### 4. P2: The site's header ran off the screen at large text
- **Who:** a phone user with large text (200%). The header was 510 px on a 412 px screen: Start free cut in half, and every public page scrolled sideways (/, /netball, /why-siren, /demo).
- **Fix:** the header and its nav wrap; the link labels don't break mid-phrase. Commit 29861f25. Test: #4 (three pages).

### 5. P2: Stats said "Everyone's within a quarter of even" above "12 of 25 kids within a quarter of even"
- **Found** triaging the big-field and netball stats (also "7 of 10" under the same tick).
- **Cause:** the tick looked only at kids owed time; the count also counts kids over in a line.
- **Fix:** unless every kid is within, the tick says "Nobody's owed a quarter anywhere." Commit 61fbaa8d. Test: #5 (AFL, two quarters with nobody moved: 0 of 12).

### 6. P2: At 200% text the player name box was 75 px wide
- **Who:** a large-text coach adding kids (the wizard and the Squad tab). The name box showed "e.g" beside a 167 px number box sized in rem.
- **Fix:** the row wraps; the name keeps at least 12rem (or the full row, if narrower). Test: #6.

### 7. P1: Netball "Player chemistry" claimed more time together than the game lasted
- **Seen:** "Ava Nguyen + Mia Patel 30 min" in a game that ran 19:47.
- **Cause:** each lineup event credited every pair in a third with a full nominal quarter, whether the quarter ran 4 minutes or 10, and a lineup set twice counted twice.
- **Fix:** pairs are credited when a quarter closes, for as long as it ran. Test: `src/lib/dashboard/__tests__/netballChemistry.test.ts` (3 cases, all red before). Mid-quarter injury replacements still aren't split out of pair time.

## Checked and not bugs

| Claim | Runs | What the evidence says |
|---|---|---|
| Time played more than the game / totals don't add up | fg-afl, union, futsal, basketball, league, soccer, oztag, hockey, touch, netball ×2 | Each matched the event log to the second: e.g. union 1257.4 + 586.3 s = 30:43.7; hockey four quarters = 36:13 (Ava, whole game); oztag 8 × 1475 s = 196.6 min. Agents compared against the nominal period length or a mid-game reading. |
| "Make all 4 swaps did nothing", own swap "didn't take" | fg-union | Four swaps logged within 0.7 s; the own swap was made then swapped back by the agent's next taps. Screenshot lag. |
| Ruby's split sums to 106% | fg-afl | Stats 0/62/38, summary CEN 62 · BCK 38. |
| Forwards 5/6 or 6/6 with five showing (third sighting, with round 10) | fg-league, demo league | A copy of the league game just after the injury swap shows FORWARDS 5/5, BACKS 6/6; the league and union demo boards show 5/6-on and 6/6 correctly. Not reproduced. |
| "Network error" on a goal | demo league, hockey helper | The write queue shows "couldn't save" after five failed tries, with Retry. No server error logged; the server was at 100% CPU. Not reproduced on a slow-network replay. |
| Slow network lost goals, the break read 0-0, Leo vanished | mess-netball | The saved log stops at the injury: later taps never reached the server before the run ended. A replay with the same 600 ms / 40 KB/s saved 2 goals and an opposition goal in about a second each. Leo is on the Q2 board at GS. |
| Paste-a-list scrambles text and loses line breaks | onboarding ×5 | Playwright typed the same list with Enter: exact text. Stagehand typing. |
| Help, Privacy, Terms on sign-in show raw JSON | curious parent, 200% | The taps landed on Sign in with Apple; the local stack has no Apple provider. |
| "Try another sport" went home; demo Exit stuck | demo runs | The link and wordmark go to /demo at 915×412. |
| Text off the right edge at 320 | pub-parent-320 | No page wider than 320 (home, a sport page, demo, help, privacy, terms, support, contact, why Siren). |
| Phone mockups blank on three sport pages | sport shopper | Eight shots per sport, each loads (≈210 KB). Lazy loading. |
| "22:61" time on the summary | fg-oztag | The header reads 22:01, the scheduled kickoff. |
| Mixed rule broke: four girls on | fg-touch | The cap is at most three boys; four girls and two boys is legal. |
| Ava keeper 20:34 "longer than the match" | fg-futsal | The match was 20:34; she kept goal all game. |
| Stats tab never loaded | big field | Loads; slow under load. |
| Half length box appends digits, won't clear | help-in-team (touch) | A plain controlled number input; Stagehand's select-all. |
| Manual at the break left nobody in goal | mess-futsal | By design: Manual starts empty (help, Breaks). |
| AFL U15 "no set positions" offered | onboard AFL positions | The team saved as U10 (native select); U10 offers Suggested, Rotate lines, Set manually. |
| Union demo counts mismatched | demo soccer-union | FORWARDS 6/6, BACKS 6/6 with 3 on the bench. |
| "Siren Footy" on a netball page | several | The brand follows the domain; localhost is the footy brand. |
| Netball "4 quarters" against "three thirds" | curious parent ×2 | Thirds are the court's. |

## Friction for Steve (needs a product call; not changed)

1. **No way to sign up from inside a demo game** (5 runs). Options: a "Set up your team" item in the demo's ⋯ menu and on the demo's Exit page; or a quiet line on the break screen.
2. **The break re-plans without saying so** (union, soccer, futsal, hockey helper; a round 10 theme). Options: a one-line "Suggested moved 5 kids" with Repeat beside it; or open breaks on Repeat after a coach-made change.
3. **The score margin chip ("+1") at the break isn't explained** (3 runs). Options: "up 1" / "down 2", or drop it beside a two-team score.
4. **A blank screen after Start game day** (2 runs): `live/loading.tsx` renders nothing on purpose (to avoid a flash on in-route refreshes), so the first navigation into the live game is blank for as long as the server takes. Option: a skeleton of the live chrome for first entry only.
5. **The sub interval reads three ways:** AFL "Sub every 5m", league and union "4 min subs" (union "4.2 min subs"), the other sports "Subs every 4 min". One shared phrase and whole minutes or "4 min 15 s".
6. **A mixed team's cap isn't on How we play.** It lives in Team settings › Mixed team ("At most 4 boys on the field, at least 1 girl"); the Oztag and touch coaches looked for it on How we play and in "Our league is different".
7. **Availability counts default to In** ("15 of 15 in" with 0 replied), with no list of who hasn't answered (2 runs).
8. **A typo'd email is accepted** (`new.coach@examplecom`; `type="email"` allows a dotless domain) and "a link was sent". Option: require a dot in the domain, or a "did you mean" check.
9. **Native `confirm()` for Revoke invite, Remove member and Remove team song**, where the rest of the app uses its own confirm sheets. It also blocks the test agent. Option: the shared confirm sheet.
10. **Pending invites can't change role** (only Copy link and Revoke).
11. **The game page never shows the period length**, so a coach who changes it in Settings can't confirm today's game picked it up.
12. **The Game plan doesn't say which rotation made it** (2 runs).
13. **Help:** "game-day link" isn't a heading anywhere (it's inside Games); the shared Live Screen page's pictures are AFL; "Scores and fixes" reads as a link but isn't.
14. **Parents on the game-day link weren't sure what it lets them do** (3 runs): the menu lists what's for team admins, not what the link runs (the game: periods, scores, subs). Option: say that in the menu or the welcome line.
15. **Repeats from earlier rounds:** jargon (pair, Off next, Sub after next, On next → DEF, position codes LHP1/FB15, "def" in summaries); lends, injuries and subs missing from the summary; score buttons pushed below the fold by the sub card (futsal demo); the floating help button covering text while scrolling; sign-in and sign-up look identical.
16. **Copy:** the Terms say "free during the early-access period", the site says "free for the entire 2026 season". For whoever owns the legal copy.

## Unrun or unverified

- **Two phones at once:** Stagehand can't open a second tab, so both runs stopped after the coach side. Covered by `two-phones.spec.ts` instead.
- **Large text in the league runner** (conversion MADE/MISSED cut off, a menu row overflowing) and **netball at 200%** (overlapping labels): reported once each, not probed.
- **The AFL break rule warning not cleared by Fix** (one run) and the **AFL 50% counts "2 vs 13"** (one run): no DOM probe.
- **Netball pair time** doesn't yet split a quarter at a mid-quarter injury replacement.

## Checks before handing over

Run against the last build (all seven fixes), with the CPU at 100% throughout:

- `npx tsc --noEmit`: clean. `npm run lint`: no errors (warnings only, none in changed files). `npm test`: 3305 passed, 2 skipped.
- Playwright, `--workers=2 --retries=1`: `stagehand-round11` (10 tests), `roster`, `squad-paste`, `onboarding`, `help`, `sport-pages`, `demo-picker`, `design-review`, `netball-stats`, `netball-summary`, `a11y-large-text`, `a11y-narrow-320`, `two-phones`: 100 passed, 4 flaky, 6 failed. All six failures were `demo-picker`'s card tests, plus one `onboarding` test, timing out (15 s for a demo game to be created; a squad page still "Loading" at 30 s). On reruns, `design-review`, `onboarding` and every `demo-picker` test passed; the Oztag card still timed out 1 in 2 when run on its own. `demo-picker` passed 19/19 earlier in the round on a quieter machine. The demo picker page itself wasn't changed.
- `playbook` timed out widely in an earlier run on the same machine (its saves landed 15+ s later); not rerun.
