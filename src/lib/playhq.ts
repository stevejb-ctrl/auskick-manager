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

// Combine YYYY-MM-DD + HH:MM:SS into an ISO string. PlayHQ returns times in
// the venue's local time without an offset, so we treat the combination as
// local and let the browser render it in the user's zone.
function combineDateTime(date: string | null, time: string | null): string | null {
  if (!date) return null;
  if (!time) return new Date(`${date}T00:00:00`).toISOString();
  return new Date(`${date}T${time}`).toISOString();
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
