import { AflHelp } from "@/components/help/sport/content/afl";
import { BasketballHelp } from "@/components/help/sport/content/basketball";
import { FutsalHelp } from "@/components/help/sport/content/futsal";
import { HockeyHelp } from "@/components/help/sport/content/hockey";
import { LeagueHelp } from "@/components/help/sport/content/league";
import { NetballHelp } from "@/components/help/sport/content/netball";
import { OztagHelp } from "@/components/help/sport/content/oztag";
import { SoccerHelp } from "@/components/help/sport/content/soccer";
import { TouchHelp } from "@/components/help/sport/content/touch";
import { UnionHelp } from "@/components/help/sport/content/union";
import type { SportHelp } from "@/lib/help/sports";
import type { MarketingSportId } from "@/lib/sports/marketing-sports";

/** Each sport hub's page, by the site's sport id. */
export const SPORT_HELP_CONTENT: Record<MarketingSportId, (props: { hub: SportHelp }) => JSX.Element> = {
  netball: NetballHelp,
  afl: AflHelp,
  league: LeagueHelp,
  football: SoccerHelp,
  basketball: BasketballHelp,
  union: UnionHelp,
  touch: TouchHelp,
  oztag: OztagHelp,
  hockey: HockeyHelp,
  futsal: FutsalHelp,
};
