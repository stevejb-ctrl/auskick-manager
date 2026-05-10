// Minimal PlayHQ client. Calls the same public GraphQL endpoint the playhq.com
// SPA uses (no API key). Works anonymously as long as we send browser-like
// headers (CloudFront blocks requests missing Origin / User-Agent).

const PLAYHQ_GRAPHQL = "https://api.playhq.com/graphql";
const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36";

// Trimmed from the real teamFixture query — only the fields we actually read.
const TEAM_FIXTURE_QUERY = `
query teamFixture($teamID: ID!) {
  discoverTeam(teamID: $teamID) {
    id
    name
    season { id name }
    grade { id name }
    organisation { id name }
  }
  discoverTeamFixture(teamID: $teamID) {
    id
    name
    fixture {
      games {
        id
        date
        allocation {
          time
          court {
            name
            venue { name address suburb }
          }
        }
        home { ... on DiscoverTeam { id name } ... on ProvisionalTeam { name } }
        away { ... on DiscoverTeam { id name } ... on ProvisionalTeam { name } }
        status { value }
      }
    }
  }
}`;

export interface PlayHQFixture {
  externalId: string;
  round: number | null;
  roundName: string;
  opponent: string;
  scheduledAt: string; // ISO 8601
  venue: string | null;
}

export interface PlayHQTeamMeta {
  teamId: string;
  teamName: string;
  clubName: string;
  competition: string; // grade name, e.g. "U10 Mixed Hunter"
  season: string; // e.g. "2026"
}

export interface PlayHQTeamPage {
  meta: PlayHQTeamMeta;
  fixtures: PlayHQFixture[];
}

export type ParsedPlayhqUrl =
  | { ok: true; teamId: string }
  | { ok: false; reason: string };

// Team URLs look like:
//   https://www.playhq.com/afl/org/<club-slug>/<orgId>/<comp-slug>/teams/<team-slug>/<teamId>
// The final path segment is the teamID the GraphQL API wants.
export function parsePlayhqUrl(raw: string): ParsedPlayhqUrl {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    return { ok: false, reason: "That doesn't look like a URL." };
  }
  if (!/playhq\.com$/i.test(url.hostname)) {
    return { ok: false, reason: "URL must be from playhq.com." };
  }
  const parts = url.pathname.split("/").filter(Boolean);
  const teamsIdx = parts.indexOf("teams");
  if (teamsIdx < 0 || teamsIdx + 2 >= parts.length) {
    return {
      ok: false,
      reason: "URL must be a team page (open the team on playhq.com first).",
    };
  }
  const teamId = parts[teamsIdx + 2];
  if (!/^[a-z0-9]{6,}$/i.test(teamId)) {
    return { ok: false, reason: "Couldn't find a team ID in that URL." };
  }
  return { ok: true, teamId };
}

interface GqlTeam {
  id?: string;
  name?: string;
}
interface GqlGame {
  id: string;
  date: string | null;
  allocation: {
    time: string | null;
    court: {
      name: string | null;
      venue: {
        name: string | null;
        address: string | null;
        suburb: string | null;
      } | null;
    } | null;
  } | null;
  home: GqlTeam | null;
  away: GqlTeam | null;
  status: { value: string } | null;
}
interface GqlRound {
  id: string;
  name: string;
  fixture: { games: GqlGame[] } | null;
}
interface GqlTeamFixtureResponse {
  data?: {
    discoverTeam: {
      id: string;
      name: string;
      season: { name: string } | null;
      grade: { name: string } | null;
      organisation: { name: string } | null;
    } | null;
    discoverTeamFixture: GqlRound[] | null;
  };
  errors?: { message: string }[];
}

function parseRoundNumber(name: string): number | null {
  const m = name.match(/\d+/);
  return m ? parseInt(m[0], 10) : null;
}

function formatVenue(g: GqlGame): string | null {
  const v = g.allocation?.court?.venue;
  const courtName = g.allocation?.court?.name;
  if (!v?.name && !courtName) return null;
  const parts = [courtName, v?.name, v?.suburb].filter(
    (p, i, arr) => p && arr.indexOf(p) === i
  );
  return parts.length ? parts.join(", ") : null;
}

// Default timezone for PlayHQ wall-clock times. PlayHQ's API returns times
// without an offset, but they're always venue-local. AFL + most junior
// netball runs in VIC/NSW/ACT/TAS which share the AEST/AEDT zone — anchor
// to Australia/Melbourne so DST is handled correctly. QLD users (UTC+10
// year-round, no DST) drift ~1h during AEDT months; a per-team timezone
// override is the right long-term fix and is tracked separately. Set
// here as a constant so a future caller can pipe through a team-specific
// override without further refactoring the helper signature.
const DEFAULT_PLAYHQ_TIMEZONE = "Australia/Melbourne";

// Convert wall-clock components (date + time, no offset) in the given IANA
// timezone to a UTC ISO string. PlayHQ returns "2026-05-17" + "10:00:00"
// meaning 10am venue-local; calling new Date("2026-05-17T10:00:00") parses
// it as the SERVER's local time (Vercel runs UTC/US zones), so the saved
// timestamp drifted ~10h east when the runtime didn't happen to be in
// the venue's zone. We use Intl.DateTimeFormat to back-solve the UTC
// instant whose wall-clock in `timeZone` matches the requested string;
// two iterations converge at DST transitions.
export function wallClockToUTC(
  date: string,
  time: string,
  timeZone: string,
): string {
  // Treat the wall-clock as if it were UTC to seed the search. The actual
  // UTC instant differs by the timezone's offset at that wall-clock.
  const naive = new Date(`${date}T${time}Z`).getTime();
  function wallClockMsInZone(instantMs: number): number {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone,
      hour12: false,
      year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", second: "2-digit",
    }).formatToParts(new Date(instantMs));
    const m: Record<string, string> = {};
    for (const p of parts) if (p.type !== "literal") m[p.type] = p.value;
    return Date.UTC(
      Number(m.year),
      Number(m.month) - 1,
      Number(m.day),
      // Intl can emit "24" at midnight for some locales; clamp to 0.
      Number(m.hour) % 24,
      Number(m.minute),
      Number(m.second),
    );
  }
  let utcGuess = naive;
  for (let i = 0; i < 2; i++) {
    const offsetMs = wallClockMsInZone(utcGuess) - utcGuess;
    utcGuess = naive - offsetMs;
  }
  return new Date(utcGuess).toISOString();
}

// Combine YYYY-MM-DD + HH:MM:SS into an ISO string anchored to the
// venue's timezone. PlayHQ returns wall-clock times only — the previous
// implementation used new Date(string).toISOString() which silently
// adopted the SERVER's local zone (Steve 2026-05-10: "imports as GMT,
// games show ~10 hours later"). Now resolves to the venue zone via
// wallClockToUTC.
function combineDateTime(date: string | null, time: string | null): string | null {
  if (!date) return null;
  if (!time) return wallClockToUTC(date, "00:00:00", DEFAULT_PLAYHQ_TIMEZONE);
  return wallClockToUTC(date, time, DEFAULT_PLAYHQ_TIMEZONE);
}

export async function fetchPlayhqTeamPage(teamId: string): Promise<PlayHQTeamPage> {
  const res = await fetch(PLAYHQ_GRAPHQL, {
    method: "POST",
    cache: "no-store",
    signal: AbortSignal.timeout(8000),
    headers: {
      "content-type": "application/json",
      "tenant": "afl",
      "origin": "https://www.playhq.com",
      "referer": "https://www.playhq.com/",
      "user-agent": UA,
      "accept": "*/*",
      "accept-language": "en-US,en;q=0.9",
    },
    body: JSON.stringify({
      operationName: "teamFixture",
      variables: { teamID: teamId },
      query: TEAM_FIXTURE_QUERY,
    }),
  });

  if (!res.ok) {
    throw new Error(`PlayHQ returned ${res.status}`);
  }
  const json = (await res.json()) as GqlTeamFixtureResponse;
  if (json.errors?.length) {
    throw new Error(`PlayHQ error: ${json.errors[0].message}`);
  }
  const team = json.data?.discoverTeam;
  const rounds = json.data?.discoverTeamFixture;
  if (!team || !rounds) {
    throw new Error("PlayHQ response missing fixture data.");
  }

  const meta: PlayHQTeamMeta = {
    teamId: team.id,
    teamName: team.name,
    clubName: team.organisation?.name ?? "",
    competition: team.grade?.name ?? "",
    season: team.season?.name ?? "",
  };

  const fixtures: PlayHQFixture[] = [];
  for (const round of rounds) {
    const roundNum = parseRoundNumber(round.name);
    for (const g of round.fixture?.games ?? []) {
      const isHome = g.home?.id === team.id;
      const opponent = (isHome ? g.away?.name : g.home?.name) ?? "TBD";
      const scheduledAt = combineDateTime(g.date, g.allocation?.time ?? null);
      if (!scheduledAt) continue; // skip rounds with no date yet
      fixtures.push({
        externalId: g.id,
        round: roundNum,
        roundName: round.name,
        opponent,
        scheduledAt,
        venue: formatVenue(g),
      });
    }
  }

  return { meta, fixtures };
}
