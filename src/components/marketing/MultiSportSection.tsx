"use client";

import { useCallback, useEffect, useState } from "react";
import {
  DEFAULT_MARKETING_SPORT,
  getMarketingSport,
  isMarketingSportId,
  MARKETING_SPORTS,
  type MarketingSportConfig,
  type MarketingSportId,
} from "@/lib/sports/marketing-sports";
import {
  AflOvalField,
  LeagueRectField,
  NetballCourtField,
  RugbyUnionField,
} from "@/components/marketing/sport-fields";

const LS_KEY = "siren.sport";

/** Pick the right field SVG for a sport. Switch reads as exhaustive
 *  — adding a new sport here is the one place TypeScript will yell
 *  at me if I forget to wire up the SVG. */
function FieldForSport({
  sport,
  tintOpacity,
}: {
  sport: MarketingSportConfig;
  tintOpacity: number;
}) {
  switch (sport.id) {
    case "afl":
      return <AflOvalField accent={sport.accent} tintOpacity={tintOpacity} />;
    case "league":
      return (
        <LeagueRectField accent={sport.accent} tintOpacity={tintOpacity} />
      );
    case "union":
      return (
        <RugbyUnionField accent={sport.accent} tintOpacity={tintOpacity} />
      );
    case "netball":
      return (
        <NetballCourtField accent={sport.accent} tintOpacity={tintOpacity} />
      );
  }
}

/**
 * Full-bleed dark "pick your sport" section per Claude Design v3:
 *
 *   ─────────────────────────────────────────────────────────────────
 *   │  PICK YOUR SPORT                          AFL · 4 QUARTERS   │
 *   │                                                              │
 *   │  See Siren in afl mode.                                      │
 *   │                                                              │
 *   │  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐         │
 *   │  │   AFL    │ │   NRL    │ │    RU    │ │    NB    │         │
 *   │  │  [oval]  │ │ [pitch]  │ │ [pitch]  │ │ [court]  │         │
 *   │  │  AFL     │ │ Rugby    │ │ Rugby    │ │ Netball  │         │
 *   │  │  Junior  │ │ League   │ │ Union    │ │ Junior   │         │
 *   │  │          │ │ Junior   │ │ Junior   │ │          │         │
 *   │  └──────────┘ └──────────┘ └──────────┘ └──────────┘         │
 *   ─────────────────────────────────────────────────────────────────
 *
 * Edge-to-edge near-black surface; content constrained to max-w-6xl
 * inside. Active card fills with the sport's accent colour. Inactive
 * cards = solid card surface (#1A1C1F) with a faint field-SVG
 * decoration. Headline word + top-right period label both pick up
 * the active accent.
 *
 * State + localStorage persistence live here (one client island for
 * the whole section). Default sport = AFL on first load.
 */
export function MultiSportSection() {
  const [sportId, setSportId] = useState<MarketingSportId>(
    DEFAULT_MARKETING_SPORT,
  );

  // Hydrate from localStorage after mount. Wrapped in try/catch
  // because Safari Private Browsing throws on localStorage access
  // when quota is zero.
  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(LS_KEY);
      if (stored && isMarketingSportId(stored) && stored !== sportId) {
        setSportId(stored);
      }
    } catch {
      // Silently fall back to the default — picker still works,
      // just doesn't survive page reloads for this user.
    }
    // Intentionally run once on mount; we don't want changes during
    // the session to trigger a re-read of localStorage.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSelect = useCallback((next: MarketingSportId) => {
    setSportId(next);
    try {
      window.localStorage.setItem(LS_KEY, next);
    } catch {
      // No-op — see the read site above.
    }
  }, []);

  const active = getMarketingSport(sportId);

  return (
    <section
      // Full-bleed near-black surface — edge-to-edge horizontally so
      // the dark plate dominates the homepage rhythm without a
      // floating-card frame around it. The CSS variable cascades to
      // headline word + period label for the accent transition.
      style={
        {
          "--sport-accent": active.accent,
          backgroundColor: "#0E0F11",
          color: "#F2EEE4",
        } as React.CSSProperties
      }
      aria-labelledby="multi-sport-heading"
    >
      <div className="mx-auto max-w-6xl px-4 py-14 sm:px-6 sm:py-20 lg:py-24">
        {/* Header strip: eyebrow + headline (left), period label (right). */}
        <div className="flex items-start justify-between gap-6">
          <div>
            <p
              className="font-mono text-[11px] font-bold uppercase tracking-[0.18em]"
              style={{ color: "rgba(242,238,228,0.55)" }}
            >
              Pick your sport
            </p>
            <h2
              id="multi-sport-heading"
              className="
                mt-3 text-3xl font-bold leading-[1.05] tracking-tightest
                [text-wrap:balance]
                sm:text-4xl md:text-5xl lg:text-[3.25rem]
              "
            >
              See Siren in{" "}
              <span
                className="transition-colors duration-[240ms] ease-[cubic-bezier(0.2,0.8,0.2,1)] motion-reduce:transition-none"
                style={{ color: "var(--sport-accent)" }}
              >
                {active.modeWord}
              </span>{" "}
              mode.
            </h2>
          </div>

          {/* Period label — small uppercase tag in the top-right.
              Hidden on phone (no room next to the headline); shows
              from sm+. Picks up the active accent. */}
          <p
            className="
              hidden shrink-0 pt-2 font-mono text-[11px] font-bold uppercase tracking-[0.18em]
              transition-colors duration-[240ms] ease-[cubic-bezier(0.2,0.8,0.2,1)] motion-reduce:transition-none
              sm:block
            "
            style={{ color: "var(--sport-accent)" }}
          >
            {active.code} · {active.periods}
          </p>
        </div>

        {/* Picker grid — 2 cols on phone, 4 cols on lg+. */}
        <div className="mt-10 grid grid-cols-2 gap-3 sm:mt-12 sm:gap-4 lg:grid-cols-4">
          {MARKETING_SPORTS.map((sport) => {
            const isActive = sport.id === active.id;
            return (
              <button
                key={sport.id}
                type="button"
                role="tab"
                aria-selected={isActive}
                aria-label={`Show Siren in ${sport.label} mode`}
                data-testid={`sport-card-${sport.id}`}
                onClick={() => handleSelect(sport.id)}
                style={{
                  // Inactive cards use a single dark surface; active
                  // cards fill with the sport accent. The cropped
                  // field illustration in the bottom-right gives the
                  // sport-specific "feel" once the colour swap lands.
                  backgroundColor: isActive ? sport.accent : "#1A1C1F",
                }}
                className="
                  group relative h-[110px] overflow-hidden rounded-lg
                  text-left
                  transition-colors duration-[240ms] ease-[cubic-bezier(0.2,0.8,0.2,1)]
                  focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-[#0E0F11]
                  sm:h-[130px]
                "
              >
                {/* Field decoration — anchored bottom-right and
                    deliberately overflowing the top of the card so
                    only the lower portion of the field is visible.
                    The card's overflow-hidden crops the rest.
                    Container is ~50% of card width so the markings
                    cluster on the right; the left half stays clear
                    for the text.

                    pointer-events-none so the SVG never intercepts
                    the click. Low opacity so the decoration reads as
                    a watermark behind the text. */}
                <div
                  aria-hidden="true"
                  className={`
                    pointer-events-none absolute bottom-0 right-0 h-[200%] w-[55%]
                    transition-opacity duration-[240ms] ease-[cubic-bezier(0.2,0.8,0.2,1)]
                    ${
                      isActive
                        ? "opacity-30"
                        : "opacity-40 group-hover:opacity-60"
                    }
                  `}
                >
                  <FieldForSport
                    sport={sport}
                    // tintOpacity 0 = transparent SVG; the card
                    // surface (accent or #1A1C1F) shows through and
                    // the field markings render in cream on top.
                    tintOpacity={0}
                  />
                </div>

                {/* Text overlay — eyebrow top-left, name + Junior
                    bottom-left. Inset padding keeps the text away
                    from the card edge. */}
                <div className="absolute inset-0 flex flex-col justify-between p-4 sm:p-5">
                  <p
                    className="font-mono text-[10px] font-bold uppercase tracking-[0.18em]"
                    style={{
                      color: isActive
                        ? "rgba(255,255,255,0.75)"
                        : "rgba(242,238,228,0.55)",
                    }}
                  >
                    {sport.code}
                  </p>
                  <div>
                    <p
                      className="text-xl font-bold leading-tight tracking-tightest sm:text-2xl"
                      style={{ color: isActive ? "#FFFFFF" : "#F2EEE4" }}
                    >
                      {sport.label}
                    </p>
                    <p
                      className="mt-0.5 text-xs"
                      style={{
                        color: isActive
                          ? "rgba(255,255,255,0.75)"
                          : "rgba(242,238,228,0.55)",
                      }}
                    >
                      Junior
                    </p>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </section>
  );
}
