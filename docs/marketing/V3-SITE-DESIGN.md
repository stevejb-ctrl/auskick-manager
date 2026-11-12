# The public site on live v3: field bands

The homepage and the ten sport pages wear the app's own look, "chalk on
grass", so the site and the app read as one thing. The idea in one line:
**the site is a ground and its sideline.** The parts that show the app
sit on the sport's playing surface, marked out in chalk; the parts you
read sit on the chalk page beside it.

## Palette

The surfaces and the chalk are the app's tokens (`src/lib/theme/palette.ts`),
the same in light and dark, so a ground never changes colour.

| Name   | Hex       | Where                                                         |
| ------ | --------- | ------------------------------------------------------------- |
| Grass  | `#0F4C2B` | AFL, both rugbies, football, hockey, touch, Oztag; the homepage |
| Court  | `#1E465F` | Netball, futsal                                                |
| Boards | `#5A3820` | Basketball                                                     |
| Chalk  | `#F7FAF5` | Words and line markings on a surface                           |
| Ink    | `#0B1E15` | Words on the page; the phone's bezel                           |
| Page   | `#F3F6F0` | The reading sections                                           |

Two signals, used the way the app uses them:

- **Hi-vis `#FF5A1F`** (ink words on it) is "act now": the one primary
  button on a band, as Start Q1 is on the live screen.
- **Sun `#F6C445`** is the accent word in a heading on a surface. The
  accent stays colour only, in the heading's own font.

Each sport's own accent (`marketing-sports.ts`) appears on the page only:
its dot, its big rule numbers, the accent word in a light heading. On a
surface the surface itself is the sport's identity.

## Type

- **Archivo** (`font-display`), weight 800 at 80% width (`stretch-80`),
  sentence case, for headings. Its narrow width is the scoreboard and
  the kid tiles; at 80% it still reads as words, not a sign.
- **Atkinson Hyperlegible** (`font-sans`) for everything you read,
  18–20 px in a band, 16–18 px on the page, lines under 70 characters.
- Narrow capitals (Archivo at 72%) only where the app uses them: the
  format plates under a sport's heading ("4 quarters", "7 positions"),
  the dim margin labels, the moment stamps in the tour.

Scale (rem): 0.875 · 1 · 1.125 · 1.3125 · 1.75 · 2.25 · 3 · 4 · 5.25.
Headings sit tight (leading 0.95–1.05); body text at 1.55–1.6.

## A field band

From the back:

1. **The surface**, full bleed, with its texture at 2–4%: mowing stripes
   on grass, boards on wood, the lighter inner court on court.
2. **The ground's markings in chalk**: the same drawings as the sport
   tiles and the app's field (`SportFieldGlyph`), drawn large, faint
   (14–18%) and cropped by the band. Landscape from 768 px, turned
   end-on below it, so a phone sees down the ground as the live screen
   does.
3. **The content**: chalk heading, chalk body at 85%, one hi-vis action,
   and the phone lying on the ground. The phone shows the app in its
   light theme: a lit chalk screen on a dark ground is what a coach sees
   on a Saturday, and it separates the screen from the surface.

Bands are square-edged and full width. Between two bands there is
always a light section.

## The tour

Each sport page walks through one game in six moments, on the sport's
surface: under way, the subs, a score, the break, full time, and the
stats afterwards. It is a timeline because the content is one, so the
steps hang off a chalk sideline and each is stamped with its moment in
the game ("Quarter time", "Full time"), not a number. On a wide screen
the phone stays put and changes with the step; on a phone each step
carries its own screen.

## The page sections

Light, calm, ink on the page with hairlines, the sport accent as a dot
and in big numbers. The homepage's sport directory makes every tile a
small piece of its sport's ground (surface plus chalk drawing), so ten
grounds side by side say "ten sports" before a word is read.

## Motion

One moment: on load, the hero's chalk lines are marked in left to right,
as a line-marking trolley would (1.2 s, once). The tour's phone
cross-fades as you move through the steps. Nothing else moves on its
own. With reduced motion, both are instant.

## Accessibility

- Chalk on grass, court and boards is 9.6:1 or better; body chalk at 85%
  is over 7:1; the dim labels (chalk at 62%) clear 4.5:1, as in the app.
- Sun on grass is 6.2:1; ink on hi-vis is 6.3:1.
- Focus on a band is a 2 px chalk outline, 3 px out; on the page, ink.
- Every screenshot has alt text that says what that screen shows.
- Layouts hold at 390, 768 and 1280+ with no sideways scroll.
