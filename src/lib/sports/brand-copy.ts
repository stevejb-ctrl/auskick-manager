// ─── Per-brand marketing copy ────────────────────────────────
// The marketing surface (/, /why-siren, /contact, footer) reads from
// this module so the same component tree renders differently on
// sirenfooty.com.au vs sirennetball.com.au.
//
// Each FeatureCopy entry matches the FEATURES shape consumed by
// ScrollingFeatures. Screenshots default to the AFL images for now;
// netball-specific images can be added under /public/marketing/netball/*.

import type { SportId } from "@/lib/sports/types";

/**
 * A heading split into three parts so a single word can render in
 * Instrument Serif italic — the defining type move of the marketing
 * site. `italic` may be empty, in which case the heading renders as
 * a single sans-serif line.
 */
export interface TitleParts {
  before: string;
  italic: string;
  after: string;
}

export interface FeatureCopy {
  id: string;
  eyebrow: string;
  title: TitleParts;
  body: string;
  bullets: string[];
  image: string;
  imageAlt: string;
}

export interface BrandCopy {
  /** Header product name ("Siren Footy" / "Siren Netball"). */
  productName: string;
  /** Tagline shown in the footer under the wordmark. */
  tagline: string;
  /** Two-message banner: prefix + alarm-orange link. */
  banner: { prefix: string; linkText: string };
  /** Hero eyebrow above the H1. Default-styled (ink-dim mono uppercase). */
  heroEyebrow: string;
  /** Hero H1 — TitleParts; italic may be empty (the prototype's hero is plain). */
  heroTitle: TitleParts;
  /** Hero subtitle paragraph. */
  heroSubtitle: string;
  /** Mini trust line under the hero CTAs (mono uppercase, ink-mute). */
  heroTrust: string;
  /** Page meta description. */
  metaDescription: string;
  /**
   * Trust band entries between hero and features. Each is a big
   * mono-numeral stat with a small uppercase label underneath, per the
   * design handoff (`MktTrustBand` in `marketing_handoff/prototype/sf/marketing.jsx`).
   */
  trustBand: readonly { stat: string; label: string }[];
  /**
   * Editorial centrepiece above the feature blocks. Two halves —
   * the right half renders Instrument Serif italic.
   */
  centerpiece: { left: string; right: string };
  /** Ordered feature blocks for ScrollingFeatures. */
  features: FeatureCopy[];
  /** Final CTA pieces — title is split for italic accent. */
  finalCtaEyebrow: string;
  finalCtaTitle: TitleParts;
  finalCtaBody: string;
}

// ─── AFL copy ────────────────────────────────────────────────────────
const AFL_COPY: BrandCopy = {
  productName: "Siren Footy",
  tagline: "Made for volunteer coaches.",
  banner: {
    prefix: "Free for the entire 2026 season.",
    linkText: "Sign up in under a minute →",
  },
  heroEyebrow: "Built for junior AFL",
  // Hero stays plain per the prototype source — italic accents are
  // reserved for features, the centrepiece, and the final CTA.
  heroTitle: { before: "Run game day. Keep your head up.", italic: "", after: "" },
  heroSubtitle:
    "Three-zone rotations. Fair game time across the quarters. Late arrivals, injuries, fill-ins. Siren knows the intricacies of junior AFL that generic sub-timers miss. So you can stop juggling a clipboard and watch your kid play.",
  heroTrust: "FREE 2026 SEASON · WORKS ON ANY PHONE · NO APP TO INSTALL",
  metaDescription:
    "Junior AFL game manager. Fair three-zone rotations, live score, late arrivals and fill-ins handled automatically.",
  trustBand: [
    { stat: "1,200+", label: "Coaches" },
    { stat: "38k", label: "Games tracked" },
    { stat: "4.9★", label: "Parent rating" },
    { stat: "0", label: "Clipboards" },
  ],
  centerpiece: { left: "Everything you need.", right: "Nothing you don’t." },
  finalCtaEyebrow: "Saturday morning is coming",
  finalCtaTitle: {
    before: "Set up your team in about ",
    italic: "five",
    after: " minutes.",
  },
  finalCtaBody:
    "Free for the entire 2026 season. Works on the phone you already have. No app download, no credit card.",
  features: [
    {
      id: "rotations",
      eyebrow: "Fair rotations",
      title: { before: "Every player gets a ", italic: "fair", after: " run." },
      body: "The rotation engine tracks minutes in each zone across every quarter and nudges you toward balanced playing time — without you having to count.",
      bullets: [
        "Per-zone minute bars visible at a glance",
        "Colour-coded fairness indicators",
        "Season totals carry across all games",
      ],
      image: "/marketing/screenshots/rotations.png",
      imageAlt: "Player rotation view showing zone minute bars",
    },
    {
      id: "scoring",
      eyebrow: "Score tracking",
      title: {
        before: "Keep the scoreboard ",
        italic: "honest",
        after: " — if you want to.",
      },
      body: "Scoring is completely optional. If you do use it, log goals and behinds for both sides with one tap. A goal song can play automatically — or not. Your call.",
      bullets: [
        "Score tracking is opt-in — skip it if you don’t need it",
        "Opponent score tracked alongside yours",
        "Optional goal song — enable it or leave it off",
      ],
      image: "/marketing/screenshots/scoring.png",
      imageAlt: "Score tracking with celebration chip visible",
    },
    {
      id: "availability",
      eyebrow: "Availability",
      title: {
        before: "Set your squad before you ",
        italic: "leave",
        after: " home.",
      },
      body: "Mark each player available or unavailable the night before. If the other team is running short, drop your numbers to match — Siren rebalances rotations automatically.",
      bullets: [
        "One tap to mark a player available or unavailable",
        "Run a smaller squad to match the opposition",
        "Last-minute changes and fill-ins handled on the day",
      ],
      image: "/marketing/screenshots/availability.png",
      imageAlt: "Pre-game availability list showing available and unavailable players",
    },
    {
      id: "flexibility",
      eyebrow: "Full control",
      title: {
        before: "Handle anything the game ",
        italic: "throws",
        after: " at you.",
      },
      body: "Long-press any player to lock them to a zone, flag an injury, or lend them to the opposition. Siren adapts mid-game without losing track of the rotation.",
      bullets: [
        "Lock a player always-on or to a specific zone",
        "Injured players skip the rotation automatically",
        "Lend a player to the opposition and track their time separately",
      ],
      image: "/marketing/screenshots/flexibility.png",
      imageAlt: "Player actions sheet showing lock, injury, and lend options",
    },
    {
      id: "quarterly",
      eyebrow: "Quarter breaks",
      title: {
        before: "Walk into every quarter with a ",
        italic: "plan",
        after: ".",
      },
      body: "At the break, Siren suggests a reshuffle to balance zone minutes. One tap to accept, or rearrange manually — the fairness score updates live as you adjust.",
      bullets: [
        "Suggested lineup based on zone equity",
        "One tap to accept or drag to customise",
        "Fairness score updates as you swap players",
      ],
      image: "/marketing/screenshots/quarterly.png",
      imageAlt: "Quarter break screen with suggested reshuffle and fairness bars",
    },
    {
      id: "share",
      eyebrow: "Share with parents",
      title: {
        before: "Hand scoring to any parent in ",
        italic: "one",
        after: " tap.",
      },
      body: "Send the run-link to a parent on the sideline and they become the scorer for the day — no app download, no account, no setup. A magic link gets them straight in.",
      bullets: [
        "Full scoring access via a single shareable link",
        "No app download or account needed",
        "Coach stays focused on the field",
      ],
      image: "/marketing/screenshots/share.png",
      imageAlt: "Public run-link scoring view for parents",
    },
    {
      id: "playhq",
      eyebrow: "PlayHQ integration",
      title: {
        before: "Fixtures imported ",
        italic: "automatically",
        after: ".",
      },
      body: "Connect your PlayHQ club URL and Siren pulls in your draw. Rounds, opponents, and results stay in sync so you never have to enter a game twice.",
      bullets: [
        "Fixtures imported from PlayHQ automatically",
        "Round results synced after each game",
        "Works alongside manually created games",
      ],
      image: "/marketing/screenshots/fixtures.png",
      imageAlt: "Fixtures list showing PlayHQ-imported rounds",
    },
    {
      id: "stats",
      eyebrow: "Season stats",
      title: { before: "See how the ", italic: "season", after: " is going." },
      body: "After every game, zone-minute stats update automatically. Spot who’s been stuck on the bench and fix it before next week.",
      bullets: [
        "Minutes equity across the whole squad",
        "Per-player zone breakdowns",
        "Top goal-kicker leaderboard",
      ],
      image: "/marketing/screenshots/stats.png",
      imageAlt: "Season stats dashboard with minutes equity and goal-kicker leaderboard",
    },
  ],
};

// ─── Netball copy ────────────────────────────────────────────────────
const NETBALL_COPY: BrandCopy = {
  productName: "Siren Netball",
  tagline: "Made for volunteer coaches.",
  banner: {
    prefix: "Free for the entire 2026 season.",
    linkText: "Sign up in under a minute →",
  },
  heroEyebrow: "Built for junior netball",
  heroTitle: {
    before: "Run the quarter break. Not the clipboard.",
    italic: "",
    after: "",
  },
  heroSubtitle:
    "Seven positions, three thirds, no rolling subs. Siren tracks who’s played what, respects the rules of play, and suggests a fair rotation for every quarter — so every kid gets a turn at GS, not just the same three all season.",
  heroTrust: "FREE 2026 SEASON · WORKS ON ANY PHONE · NO APP TO INSTALL",
  metaDescription:
    "Junior netball game manager. Fair position rotations, quarter-break lineup suggestions, rules-of-play enforced, live score tracking.",
  trustBand: [
    { stat: "300+", label: "Coaches" },
    { stat: "9k", label: "Games tracked" },
    { stat: "4.9★", label: "Parent rating" },
    { stat: "0", label: "Clipboards" },
  ],
  centerpiece: { left: "Everything you need.", right: "Nothing you don’t." },
  finalCtaEyebrow: "Saturday morning is coming",
  finalCtaTitle: {
    before: "Set up your team in about ",
    italic: "five",
    after: " minutes.",
  },
  finalCtaBody:
    "Free for the entire 2026 season. Works on the phone you already have. No app download, no credit card.",
  features: [
    {
      id: "rotations",
      eyebrow: "Fair rotations",
      title: {
        before: "Every kid gets a turn in the ",
        italic: "circle",
        after: ".",
      },
      body: "Siren counts how many times each player has rostered into each position across the season — GS through GK — and nudges you toward an even spread. No more ‘you were GS last week too’ arguments.",
      bullets: [
        "Per-position appearance counts, season and game",
        "Coefficient-of-variation fairness score (0–100)",
        "Suggests next-quarter lineup with one tap",
      ],
      // Same screenshot as the desktop hero phone. Reused here so
      // mobile visitors (where the hero phone is `hidden lg:block`)
      // see the live court as the first product visual instead of
      // a stats table. The rotations *story* still lands via the
      // copy + bullets above; the screenshot just primes recognition.
      image: "/marketing/screenshots/netball/live-game.png",
      imageAlt: "Netball live court — Bondi Bandits vs Tamarama Tigers, Q4 in progress, all 7 positions filled",
    },
    {
      // Mirrors AFL's "scoring" feature copy, with the only tweak
      // being "log goals for both sides" (netball is goals-only —
      // no behinds, no points calc) per Steve's "same as footy
      // tweaked for netball" direction.
      id: "scoring",
      eyebrow: "Score tracking",
      title: {
        before: "Keep the scoreboard ",
        italic: "honest",
        after: " — if you want to.",
      },
      body: "Scoring is completely optional. If you do use it, log goals for both sides with one tap. A goal song can play automatically — or not. Your call.",
      bullets: [
        "Score tracking is opt-in — skip it if you don’t need it",
        "Opponent score tracked alongside yours",
        "Optional goal song — enable it or leave it off",
      ],
      image: "/marketing/screenshots/netball/scoring.png",
      imageAlt: "Netball score view — tap +Goal for the home shooter, +G for the opposition",
    },
    {
      id: "quarterly",
      eyebrow: "Quarter breaks",
      title: {
        before: "Make the quarter break ",
        italic: "count",
        after: ".",
      },
      // Reframed from "Netball gives you four chances to rotate"
      // (which read as a hard rule) to a softer "most teams
      // rotate at quarter breaks" — acknowledges that some teams
      // do use mid-quarter subs, and the new third bullet pairs
      // with that. Body + bullets aligned to the actual product:
      // mid-quarter subs are supported.
      body: "Most teams rotate positions at quarter breaks. At every break, Siren lines up the next quarter’s suggested squad, weighted by who’s played least and who hasn’t had a turn at their preferred position.",
      bullets: [
        "One tap to accept the suggested lineup",
        "Drag-and-drop to rearrange manually",
        "Mid-quarter subs available if this is how you do it",
      ],
      image: "/marketing/screenshots/netball/quarterly.png",
      imageAlt: "Netball Q-break with the suggested-reshuffle toggle on, showing per-third lineup cards and time bars",
    },
    {
      // Mirrors AFL's "flexibility" feature copy verbatim (per
      // Steve's "make 04 the same as footy" direction). The
      // screenshot shows netball's player-actions sheet —
      // long-press a player → lock to position, mark injured,
      // lend to opposition — so the AFL "lock them to a zone"
      // wording reads slightly off-brand here ("position" is
      // netball's word) but the parity-with-footy intent wins.
      id: "flexibility",
      eyebrow: "Full control",
      title: {
        before: "Handle anything the game ",
        italic: "throws",
        after: " at you.",
      },
      body: "Long-press any player to lock them to a zone, flag an injury, or lend them to the opposition. Siren adapts mid-game without losing track of the rotation.",
      bullets: [
        "Lock a player always-on or to a specific zone",
        "Injured players skip the rotation automatically",
        "Lend a player to the opposition and track their time separately",
      ],
      image: "/marketing/screenshots/netball/flexibility.png",
      imageAlt: "Netball player-actions sheet over the live court — lock, injury, and lend options for the selected player",
    },
    {
      id: "availability",
      eyebrow: "Availability",
      title: {
        before: "Fix the team ",
        italic: "the night",
        after: " before.",
      },
      body: "Mark each player available or unavailable the night before. Fill-ins and late arrivals on game day are handled without breaking the rotation.",
      bullets: [
        "One tap to mark a player available",
        "Fill-ins added on game day don’t pollute season stats",
        "Late arrivals slotted in at the next break",
      ],
      image: "/marketing/screenshots/netball/availability.png",
      imageAlt: "Pre-game availability list — Bondi Bandits roster with available/unavailable chips and a fill-in row at the bottom",
    },
    {
      id: "share",
      eyebrow: "Share with parents",
      title: {
        before: "Hand scoring to any parent in ",
        italic: "one",
        after: " tap.",
      },
      body: "Send the run-link to a parent on the sideline — they become the scorer for the day. No app download, no account. A magic link gets them straight in.",
      bullets: [
        "Scoring access via a single shareable link",
        "No app download or account needed",
        "Coach stays focused on the court",
      ],
      image: "/marketing/screenshots/share.png",
      imageAlt: "Run link being shared to a parent",
    },
    {
      // Mirrors AFL's "playhq" feature — same body + bullets so
      // a coach who runs both sports gets identical messaging.
      // PlayHQ covers netball clubs in Australia, so the integration
      // story is sport-agnostic.
      id: "playhq",
      eyebrow: "PlayHQ integration",
      title: {
        before: "Fixtures imported ",
        italic: "automatically",
        after: ".",
      },
      body: "Connect your PlayHQ club URL and Siren pulls in your draw. Rounds, opponents, and results stay in sync so you never have to enter a game twice.",
      bullets: [
        "Fixtures imported from PlayHQ automatically",
        "Round results synced after each game",
        "Works alongside manually created games",
      ],
      image: "/marketing/screenshots/netball/fixtures.png",
      imageAlt: "Bondi Bandits Games tab — PlayHQ import card with the upcoming and completed netball fixtures listed below",
    },
    {
      id: "stats",
      eyebrow: "Season stats",
      title: { before: "See how the ", italic: "season", after: " is going." },
      body: "After every game, position-counts update automatically. Spot who’s been stuck at WD every week and fix it before next round.",
      bullets: [
        "Position variance across the whole squad",
        "Per-player breakdown of positions played",
        "Leading scorer across the season",
      ],
      image: "/marketing/screenshots/netball/stats.png",
      imageAlt: "Netball player-statistics table — games, minutes, and per-third %, with GS/GA/WA/etc. breakdowns under each",
    },
  ],
};

const COPY: Record<SportId, BrandCopy> = {
  afl: AFL_COPY,
  netball: NETBALL_COPY,
};

export function getBrandCopy(id: SportId): BrandCopy {
  return COPY[id] ?? AFL_COPY;
}
