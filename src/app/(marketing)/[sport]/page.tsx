import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AppStoreBadge } from "@/components/marketing/AppStoreBadge";
import { FinalCTA } from "@/components/marketing/FinalCTA";
import { MarketingAuthCTAs } from "@/components/marketing/MarketingAuthCTAs";
import { PhoneFrame } from "@/components/marketing/PhoneFrame";
import { ScrollingFeatures } from "@/components/marketing/ScrollingFeatures";
import { SharedFeatures } from "@/components/marketing/SharedFeatures";
import { SportChips } from "@/components/marketing/SportChips";
import { SportFieldGlyph } from "@/components/marketing/SportFieldGlyph";
import { TitleAccent } from "@/components/marketing/TitleAccent";
import { sportPageCopy } from "@/lib/marketing/sportPages";
import { PRICE, SIREN_SPORTS } from "@/lib/siren-facts";
import { sportTourCopy } from "@/lib/sports/brand-copy";
import {
  MARKETING_SPORTS,
  type MarketingSportConfig,
  marketingSportBySlug,
  sportPagePath,
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
 * A sport's page: what Siren does for that sport's junior rules, then
 * its feature tour, then the other sports and the sign-up. Same shape
 * and components for all ten, fed by the sport's data (CLAUDE.md:
 * reuse before you fork). The sport's colour shows only in large type,
 * its field drawing and its pale panels; small text stays ink.
 */
export default function SportPage({ params }: SportPageProps) {
  const sport = marketingSportBySlug(params.sport);
  if (!sport) notFound();
  const copy = sportPageCopy(sport.sport);
  const tour = sport.tour === "shared" ? null : sportTourCopy(sport.sport);
  const name = proseName(sport);

  return (
    <main>
      <section className="relative overflow-hidden border-b border-hairline">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -right-32 top-16 hidden h-[512px] w-[820px] opacity-[0.12] lg:block"
          style={{ color: sport.accent }}
        >
          <SportFieldGlyph sport={sport.sport} weight={1.5} className="h-full w-full" />
        </div>

        <div className="relative mx-auto max-w-6xl px-4 pb-16 pt-6 sm:px-6 sm:pb-20 sm:pt-8">
          <nav aria-label="Breadcrumb" className="text-sm text-ink-dim">
            <Link href="/#sports" className="hover:text-ink">
              Sports
            </Link>
            <span aria-hidden="true" className="mx-2">
              /
            </span>
            <span aria-current="page" className="font-semibold text-ink">
              {sport.label}
            </span>
          </nav>

          <div className="mt-8 grid grid-cols-1 items-center gap-12 sm:mt-10 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
            <div>
              <p className="flex items-center gap-2 font-mono text-[11px] font-bold uppercase tracking-[0.16em] text-ink-dim">
                <span aria-hidden="true" className="h-2 w-2 rounded-full" style={{ backgroundColor: sport.accent }} />
                {copy.eyebrow}
              </p>
              <h1 className="mt-4 text-[clamp(2.5rem,5.5vw,4.5rem)] font-bold leading-[1.02] tracking-tightest text-ink [text-wrap:balance]">
                <TitleAccent parts={copy.heroTitle} accentColor={sport.accent} />
              </h1>
              <p className="mt-6 max-w-xl text-lg leading-relaxed text-ink-dim sm:text-xl">{copy.heroSubtitle}</p>
              <div className="mt-8 flex flex-wrap items-center gap-3">
                <AppStoreBadge theme="light" />
                <MarketingAuthCTAs variant="hero" />
                {sport.hasDemo && (
                  <Link
                    href="/demo"
                    className="inline-flex h-11 items-center gap-2 px-2 text-base font-semibold text-ink underline-offset-4 hover:underline"
                  >
                    Try the {name} demo
                    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true" className="h-4 w-4">
                      <path d="M3 8h10M9 4l4 4-4 4" />
                    </svg>
                  </Link>
                )}
              </div>
            </div>

            <div className="mx-auto w-full max-w-[260px] lg:max-w-[290px]">
              <PhoneFrame tilt={2} className="relative">
                <Image
                  src={sport.liveScreenshot}
                  alt={sport.liveScreenshotAlt}
                  fill
                  priority
                  sizes="290px"
                  className="object-cover object-top"
                />
              </PhoneFrame>
            </div>
          </div>
        </div>
      </section>

      <section aria-labelledby="knows-heading" className="py-16 sm:py-20">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.16em] text-ink-dim">
            What Siren knows
          </p>
          <h2
            id="knows-heading"
            className="mt-3 text-[clamp(1.75rem,3.2vw,2.75rem)] font-bold leading-[1.08] tracking-tightest text-ink"
          >
            Junior {name}, the way it&apos;s played.
          </h2>
          <ul className="mt-9 grid grid-cols-1 gap-4 md:grid-cols-3 md:gap-5">
            {copy.knows.map((item) => (
              <li key={item.title} className="rounded-2xl border border-hairline bg-surface p-6">
                <p className="font-mono text-[22px] font-bold" style={{ color: sport.accent }}>
                  {item.stat}
                </p>
                <h3 className="mt-3 text-lg font-bold tracking-tight text-ink">{item.title}</h3>
                <p className="mt-2 text-[15px] leading-relaxed text-ink-dim">{item.body}</p>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {tour ? (
        <ScrollingFeatures
          features={
            sport.tour === "live"
              ? tour.features.map((f) => ({ ...f, image: sport.liveScreenshot, imageAlt: sport.liveScreenshotAlt }))
              : tour.features
          }
          centerpiece={tour.centerpiece}
          accent={sport.accent}
        />
      ) : (
        <SharedFeatures
          eyebrow="What Siren does"
          heading={{ before: "Everything you need to make game day a ", accent: "breeze", after: "." }}
          intro={`The same six things in every sport, ${name} included. Shown here in five of them.`}
          accent={sport.accent}
        />
      )}

      <section className="py-14 sm:py-16">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <SportChips label="Coach another sport too?" except={sport.id} />
        </div>
      </section>

      <FinalCTA
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
