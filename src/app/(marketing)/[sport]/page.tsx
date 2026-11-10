import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AppStoreBadge } from "@/components/marketing/AppStoreBadge";
import { BAND_ACCENT } from "@/components/marketing/bandStyles";
import { FieldBand } from "@/components/marketing/FieldBand";
import { FinalCTA } from "@/components/marketing/FinalCTA";
import { GameTour } from "@/components/marketing/GameTour";
import { MarketingAuthCTAs } from "@/components/marketing/MarketingAuthCTAs";
import { PhoneFrame } from "@/components/marketing/PhoneFrame";
import { SportChips } from "@/components/marketing/SportChips";
import { TitleAccent } from "@/components/marketing/TitleAccent";
import { sportPageCopy } from "@/lib/marketing/sportPages";
import { PRICE, SIREN_SPORTS } from "@/lib/siren-facts";
import {
  MARKETING_SPORTS,
  TOUR_SHOTS,
  type MarketingSportConfig,
  marketingSportBySlug,
  sportPagePath,
  sportShot,
} from "@/lib/sports/marketing-sports";

// One page per sport, at /<slug> (/netball, /afl, /rugby-league, /soccer,
// …). Built at deploy for the ten sports; any other slug is a 404 (the
// middleware sends unlisted paths to /login before they get here).
export const dynamicParams = false;

export function generateStaticParams() {
  return MARKETING_SPORTS.map((sport) => ({ sport: sport.slug }));
}

interface SportPageProps {
  params: { sport: string };
}

export function generateMetadata({ params }: SportPageProps): Metadata {
  const sport = marketingSportBySlug(params.sport);
  if (!sport) return {};
  const copy = sportPageCopy(sport.sport);
  return {
    title: copy.metaTitle,
    description: copy.metaDescription,
    alternates: { canonical: sportPagePath(sport) },
    openGraph: { title: copy.metaTitle, description: copy.metaDescription, url: sportPagePath(sport) },
  };
}

/** "netball", "AFL", "football (soccer)": the sport as prose names it. */
function proseName(sport: MarketingSportConfig): string {
  return SIREN_SPORTS.find((s) => s.id === sport.sport)?.name ?? sport.label;
}

/**
 * A sport's page, on its own ground (docs/marketing/V3-SITE-DESIGN.md):
 *
 *   hero         its surface marked out in chalk, the pitch, the phone
 *   knows        the chalk page: three rules Siren carries for it
 *   tour         its surface again: one game in six screens from the app
 *   other sports the chalk page
 *   sign-up      its surface
 *
 * Same shape and components for all ten, fed by the sport's data
 * (CLAUDE.md: reuse before you fork). The sport's accent colour shows
 * on the chalk page only; on its surface the surface is the identity.
 */
export default function SportPage({ params }: SportPageProps) {
  const sport = marketingSportBySlug(params.sport);
  if (!sport) notFound();
  const copy = sportPageCopy(sport.sport);
  const name = proseName(sport);
  // "Junior netball · 4 quarters · 7 positions": the format, as plates.
  const plates = copy.eyebrow.split(" · ").slice(1);
  const steps = TOUR_SHOTS.map((shot) => ({ key: shot, image: sportShot(sport, shot), ...copy.tour[shot] }));

  return (
    <main>
      <FieldBand surface={sport.surface} marks={sport.sport} drawIn labelledBy="sport-hero-heading">
        <div className="mx-auto max-w-6xl px-4 pb-16 pt-6 sm:px-6 sm:pb-20 sm:pt-8">
          <nav aria-label="Breadcrumb" className="text-[0.9375rem] text-mark/80">
            <Link href="/#sports" className="underline-offset-4 hover:text-mark hover:underline">
              Sports
            </Link>
            <span aria-hidden="true" className="mx-2">
              /
            </span>
            <span aria-current="page" className="font-semibold text-mark">
              {sport.label}
            </span>
          </nav>

          <div className="mt-8 grid grid-cols-1 items-center gap-12 sm:mt-10 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
            <div>
              <ul aria-label={`Junior ${name}`} className="flex flex-wrap gap-2">
                {plates.map((plate) => (
                  <li
                    key={plate}
                    className="rounded-[8px] bg-mark/[0.1] px-2.5 py-1.5 font-display text-[0.875rem] font-extrabold uppercase leading-none tracking-[0.06em] text-mark stretch-72"
                  >
                    {plate}
                  </li>
                ))}
              </ul>
              <h1
                id="sport-hero-heading"
                className="mt-5 font-display text-[clamp(2.75rem,6.4vw,5rem)] font-extrabold leading-[0.96] tracking-[-0.01em] stretch-80 [text-wrap:balance]"
              >
                <TitleAccent parts={copy.heroTitle} accentColor={BAND_ACCENT} />
              </h1>
              <p className="mt-6 max-w-xl text-lg leading-relaxed text-mark/85 sm:text-xl">{copy.heroSubtitle}</p>
              <div className="mt-8 flex flex-wrap items-center gap-3">
                <AppStoreBadge theme="dark" />
                <MarketingAuthCTAs variant="hero" />
                {sport.hasDemo && (
                  <Link
                    href="/demo"
                    className="inline-flex h-12 items-center gap-2 px-2 text-base font-semibold text-mark underline decoration-mark/40 underline-offset-4 hover:decoration-mark"
                  >
                    Try the {name} demo
                  </Link>
                )}
              </div>
            </div>

            <div className="mx-auto w-full max-w-[252px] lg:max-w-[292px]">
              <PhoneFrame on="band">
                <Image
                  src={sportShot(sport, "live")}
                  alt={copy.tour.live.alt}
                  fill
                  priority
                  sizes="(min-width: 1024px) 292px, 252px"
                  className="object-cover object-top"
                />
              </PhoneFrame>
            </div>
          </div>
        </div>
      </FieldBand>

      <section aria-labelledby="knows-heading" className="py-16 sm:py-24">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <h2
            id="knows-heading"
            className="max-w-3xl font-display text-[clamp(2.25rem,4.6vw,3.5rem)] font-extrabold leading-[1] text-ink stretch-80 [text-wrap:balance]"
          >
            Junior {name}, the way it&apos;s played.
          </h2>
          <ul className="mt-10 grid grid-cols-1 gap-x-10 gap-y-10 md:grid-cols-3">
            {copy.knows.map((item) => (
              <li key={item.title} className="border-t-2 pt-5" style={{ borderColor: sport.accent }}>
                <p className="font-display text-[2.5rem] font-extrabold leading-none stretch-75" style={{ color: sport.accent }}>
                  {item.stat}
                </p>
                <h3 className="mt-4 text-lg font-bold text-ink">{item.title}</h3>
                <p className="mt-2 max-w-[34ch] text-[0.9375rem] leading-relaxed text-ink-dim">{item.body}</p>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <FieldBand id="features" surface={sport.surface} marks={sport.sport} markOpacity={0.1} labelledBy="tour-heading">
        <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-24">
          <h2
            id="tour-heading"
            className="max-w-3xl font-display text-[clamp(2.25rem,4.6vw,3.5rem)] font-extrabold leading-[1] stretch-80 [text-wrap:balance]"
          >
            <TitleAccent parts={copy.tourHeading} accentColor={BAND_ACCENT} />
          </h2>
          <div className="mt-12 lg:mt-4">
            <GameTour steps={steps} />
          </div>
        </div>
      </FieldBand>

      <section className="py-14 sm:py-16">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <SportChips label="Coach another sport too?" except={sport.id} />
        </div>
      </section>

      <FinalCTA
        surface={sport.surface}
        marks={sport.sport}
        copy={{
          finalCtaEyebrow: "Saturday morning is coming",
          finalCtaTitle: { before: `Set up your ${name} team in about `, italic: "five", after: " minutes." },
          finalCtaBody: `Pick your age group, add your kids, and you're set. ${PRICE.line}, on the phone you already have.`,
        }}
        showAppStoreBadge
      />
    </main>
  );
}
