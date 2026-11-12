import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { SPORT_HELP_CONTENT } from "@/components/help/sport/content";
import { SPORT_HELP, sportHelpBySlug } from "@/lib/help/sports";

// A sport's help hub: /help/netball, /help/rugby-league, … One per
// marketing sport slug (src/lib/sports/marketing-sports.ts); any other
// slug is a 404. The words are in src/components/help/sport/content/.
//
// Rendered per request like the other help pages: the help layout reads
// the session, so a signed-in coach gets "Back to Siren", not "Sign in".
export const dynamic = "force-dynamic";

export function generateStaticParams() {
  return SPORT_HELP.map((h) => ({ sport: h.sport.slug }));
}

export function generateMetadata({ params }: { params: { sport: string } }): Metadata {
  const hub = sportHelpBySlug(params.sport);
  if (!hub) return {};
  return {
    title: `${hub.title} · Help · Siren`,
    description: hub.description,
    alternates: { canonical: hub.href },
  };
}

export default function SportHelpPage({ params }: { params: { sport: string } }) {
  const hub = sportHelpBySlug(params.sport);
  if (!hub) notFound();
  const Content = SPORT_HELP_CONTENT[hub.sport.id];
  return <Content hub={hub} />;
}
