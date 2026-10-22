# HANDOFF — Siren Footy Period Break Redesign

**For:** Claude Code (Siren Footy repo)
**From:** Steve, via Claude chat design session, 22 Oct 2026
**Design reference:** https://claude.ai/artifact/3VCU6jZLRJZEUzRSv46CEt (interactive mockups: AFL, Soccer and Netball side by side)

---

## How to run this

1. Save this file to `docs/handoffs/` in the repo.
2. Start Claude Code in the repo and paste:

```
Read docs/handoffs/siren-footy-break-redesign-HANDOFF.md and implement it.
Before coding, map our existing sport config, Zustand game store, rules
engine and current break screen, then post a short plan mapping the spec
to real files. Do step 1 (centralise sport config) first and STOP for my OK.
After that, work through the build order without stopping. Use the defaults
in "Decisions" for the open questions and list them in the final summary.
Run typecheck + lint after each step. Test AFL, soccer and netball breaks.
```

---

## Decisions already made (don't re-litigate)

- One break screen for all sports, driven by sport config. No per-sport components or branches.
- Zone order is attack, middle, defence, then GK (soccer), then bench.
- Strategy labels are renamed to Suggested / Rotate / Repeat / Manual.
- Game settings move into a bottom sheet opened from a status chip, and the collapsible card is removed.
- The score shows as a compact chip, and the collapsible card is removed.
- The legend, the per-card movement header bars and the pitch background are removed.
- Broken rules show inline with a Fix button. Starting with a broken rule shows a confirm sheet and is never blocked.

## Defaults for open questions (use these, flag them in the summary)

1. **Soccer format:** 9-a-side. ATT 2, MID 3, DEF 3, GK 1.
2. **Fix button:** if the rules engine can't return a suggested resolving swap, hide Fix and keep the message. Don't build a solver in this pass. Note it as a follow-up.
3. **Orange "low time" threshold:** 4 min under the team average, as a per-sport config value.

---


Stack: Next.js, Supabase, Tailwind, Zustand, Vercel. Live game state is offline-first in IndexedDB. Don't change persistence.

---

## Goal

Rebuild the quarter/half-time break screen ("Lineup for Q3") so the lineup is visible straight away and problems are obvious. Build one break screen driven by sport config, so AFL, soccer and netball get the same UX. Don't build per-sport screens.

## Global rules

1. **Sport-agnostic.** No hardcoded "quarter", "Q3", zone names, zone counts or colours in the component. Read all of it from sport config.
2. **One layout for every sport.** If a sport needs something different, add it to the config. Don't branch the component per sport.
3. **Same order every time.** Attack-type zone at the top, then middle, then defence. Goalkeeper zone (soccer) after defence. Bench always last.

---

## 1. Sport config additions

Extend the existing sport config with the fields below, or add them where they're missing. If any of this is currently hardcoded for AFL, centralise it first (prerequisite).

```ts
type ZoneDef = {
  key: string;            // 'FWD' | 'CEN' | 'BACK' | 'ATT' | 'MID' | 'DEF' | 'GK' ...
  label: string;          // 'FORWARD' — section header
  short: string;          // 'Fwd' — used in "From Fwd"
  colorToken: 'zone1' | 'zone2' | 'zone3' | 'zone4';
  slots: number;          // players on field in this zone
  slotLabels?: string[];  // netball bibs: ['GS','GA']; length === slots
};

type SportBreakConfig = {
  periodName: (n: number) => string;    // AFL/netball 'Q3', soccer '2nd half'
  breakName: (n: number) => string;     // 'Q2 break' | 'Half-time'
  zones: ZoneDef[];                     // in display order
  showJumperNumbers: boolean;           // false for netball
  formatScore: (s) => { main: string; detail: string }; // AFL '12 – 0' + '2.0 v 0.0'; soccer/netball '2 – 1' + 'Goals'
};
```

Starting values (confirm the soccer format before shipping, see open questions):

| | AFL | Soccer | Netball |
|---|---|---|---|
| Zones | FWD 4, CEN 4, BACK 4 | ATT 2, MID 3, DEF 3, GK 1 | ATT 2 (GS, GA), CEN 3 (WA, C, WD), DEF 2 (GD, GK) |
| Tile label | #jumper | #jumper | Bib from slotLabels; bench shows none |
| Break title | Q{n} lineup | 2nd half lineup | Q{n} lineup |
| Start button | Start Q{n} | Start 2nd half | Start Q{n} |

Colour tokens: zone1 orange `#C2410C`, zone2 teal `#0F7A5C`, zone3 blue `#1D4ED8`, zone4 purple `#7C3AED`, bench grey `#8A857C`. Text-on-light variants are in the mockup.

---

## 2. Layout (top to bottom)

1. **Header bar.** EXIT on the left. Centre shows the title (`{periodName} lineup`) with the subtitle `{breakName} · vs {opponent}` underneath. Help icon on the right. Remove the chat icon from this screen.
2. **Context row** (one line, 44px tall):
   - **Score chip.** Main score, the +/- margin in green or red, and the sport's detail text. Read-only. Tapping it opens the existing score editor.
   - **Status chip.** Shows the out-player summary ("1 injured", "1 lent", or "All available"). Tapping it opens a bottom sheet with the existing game settings (lent/injured status, reactivation). This replaces the collapsible "Game settings" card.
3. **Strategy picker.** A single-line, 4-up segmented control: `Suggested` / `Rotate` / `Repeat` / `Manual`. These rename "Rotate lines", "Keep last quarter" and "Set manually". The labels must not wrap.
4. **Issues card.**
   - **Broken rule.** Show it inline in red: the specific message in bold, the rule underneath, and a **Fix** button on the right. One row per broken rule.
   - **Warnings.** A collapsed "N warnings" row that toggles a plain list.
   - **No issues.** If there are no broken rules and no warnings, hide the card entirely.
5. **Hint.** One line: "Tap two players to swap — any position or bench".
6. **Zone sections.** One per zone from config, then Bench.
   - **Section header:** colour square, zone label, and a count on the right ("4 on", or "2 + 1 injured" for the bench).
   - **Tiles:** 2-column grid, 56px minimum height. Each tile shows:
     - Top row: tag (#jumper, or the bib in zone colour), name, and the score badge on the right if they've scored.
     - Bottom row: a dot in the previous zone's colour, the movement text (`Stays` / `From {short}` / `From bench` / `Injured`), and game time on the right.
     - Game time is orange when the player is under the team average by the warning threshold.
7. **Sticky footer.**
   - **Swap prompt:** while a swap is in progress, show "Swap **{name}** with… [Cancel]".
   - **Start button:** full-width `Start {periodName}`. If any rule is broken, add a red "N rule(s)" pill inside the button.

**Remove from this screen:** the Game settings collapsible, the Score collapsible, the FWD/CENTRE/BACK legend, the per-card "BCK → FWD" / "STAYS" header bars, and the pitch background. The pitch view can come back later as an optional toggle; it's out of scope here.

---

## 3. Behaviour

- **Swapping.**
  - Tap a tile to select it: green border and tint, and other tappable tiles get a light green border.
  - Tap a second tile to swap the two slots. This works across zones and to or from the bench.
  - Tap the same tile again, or Cancel, to deselect.
  - Changing strategy clears the selection.
- **Injured / lent players** stay in the bench section at 55% opacity, can't be tapped, and show "Injured" or "Lent" in red. Reactivate them via the status chip sheet.
- **Live re-check.** Rules and warnings re-evaluate after every swap. A broken rule disappears as soon as it's resolved, and the pill on the Start button updates with it.
- **Fix.** Ask the rules engine for the minimal swap that resolves the rule, then apply it. If the engine can't suggest one, hide the Fix button and keep the message.
- **Start with a broken rule.** Show a confirm sheet: "Start with 1 rule broken?" with options [Fix first] [Start anyway]. Never block outright.
- **Movement text.** Compare each player's slot zone this period with their zone at the end of last period. Bench to field reads "From bench".
- **Netball slots.** Each slot is a specific bib. A swap moves the players, and the bibs stay with the slot.

---

## 4. Accessibility / sizing

- Every interactive element is a real `<button>` with a touch target of at least 44px. The exception is the 36px Fix and Cancel buttons, which are fine inside 44px+ rows.
- Tiles use `aria-pressed` for the selected state. Disabled tiles use `disabled`.
- Text contrast is at least 4.5:1. Use the muted grey `#5F5B54` on `#F5F3EF`, not lighter.
- Test at 375px width. The strategy labels and tile names must not wrap. Names ellipsis-truncate.

---

## 5. Acceptance criteria

- [ ] The same component renders AFL, soccer and netball breaks, with no sport-specific branches in the component.
- [ ] On iPhone 13 at an AFL break, the first two zones are visible without scrolling.
- [ ] A broken rule is visible without tapping anything, and Fix resolves it.
- [ ] Swapping updates the movement text, section counts, rules and the start pill immediately.
- [ ] Injured and lent players can't be swapped in, and can be reactivated from the status sheet.
- [ ] Soccer half-time shows "2nd half" wording everywhere, and the GK zone has 1 slot.
- [ ] Netball tiles show bibs, and the bench shows no bib.
- [ ] State survives app backgrounding mid-break (existing IndexedDB persistence).
- [ ] Nothing reads a hardcoded period length or zone count.

---

## 6. Build order

1. Centralise the sport config fields from section 1 (prerequisite).
2. Build the new break screen components: Header, ContextRow, StrategyPicker, IssuesCard, ZoneSection, PlayerTile, SwapFooter.
3. Wire up swap state, re-evaluating rules after each swap, and the Fix action.
4. Move game settings into the status chip bottom sheet.
5. Add the start confirm sheet.
6. Remove the old components and the legend.
7. Run QA on all three sports.

---

---

## Appendix A — Reference logic from the mockup

This is illustrative, not drop-in code. Adapt it to the real store and types.

**Slot layout from config.** Field slots come from `zones` in order. Everything after that is bench.

```ts
function buildSlotLayout(cfg: SportBreakConfig, squadSize: number) {
  const slots: { zone: string; label?: string }[] = [];
  for (const z of cfg.zones)
    for (let i = 0; i < z.slots; i++) slots.push({ zone: z.key, label: z.slotLabels?.[i] });
  while (slots.length < squadSize) slots.push({ zone: 'BENCH' });
  return slots;
}
```

**Swap.** This is a two-tap selection that swaps slot contents. Labels (bibs) stay with the slot.

```ts
onTileTap(i) {
  if (sel === null) return setSel(i);
  if (sel === i) return setSel(null);
  const next = [...slotPlayerIds];
  [next[sel], next[i]] = [next[i], next[sel]];
  setSlotPlayerIds(next); setSel(null);
  // then re-run rules + warnings
}
```

**Movement text.**

```ts
const movement = (p, zone) =>
  p.injured ? 'Injured' : p.lent ? 'Lent'
  : p.prevZone === zone ? 'Stays'
  : p.prevZone === 'BENCH' ? 'From bench'
  : `From ${zoneShort(p.prevZone)}`;
```

## Appendix B — Visual tokens

| Token | Value |
|---|---|
| Background | `#F5F3EF` |
| Surface | `#FFFFFF` |
| Border | `#E2DED6` |
| Text | `#1A1916` |
| Muted text | `#5F5B54` |
| Primary (green) | `#2F6B45` |
| Selected tile background | `#E7F1EA` |
| Swap-target border | `#C9D9CE` |
| Error | `#B42318` / background `#FDF1EE` / border `#F0C7BE` |
| zone1 | `#C2410C` (text `#B23A0B`) |
| zone2 | `#0F7A5C` (text `#0D6B50`) |
| zone3 | `#1D4ED8` |
| zone4 | `#7C3AED` (text `#6D28D9`) |
| Bench | `#8A857C` (text `#4A463F`) |

- **Fonts:** Inter for UI. JetBrains Mono (or the app's existing mono) for labels, scores and times.
- **Radii:** cards 14px, tiles 12px, buttons 10–14px.

## Done means

- All acceptance criteria in section 5 pass.
- The final summary lists the files changed, the defaults used, any follow-ups (e.g. Fix solver) and anything that was hardcoded for AFL and got centralised.
