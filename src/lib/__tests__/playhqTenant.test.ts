// PlayHQ import is per sport (cross-sport audit, 14 Oct 2026). Every
// request went out with AFL's tenant whatever the team played, and a
// netball team could import an AFL club's fixtures. The tenant now
// comes from the team page's own URL, and must be the team's sport's.

import { afterEach, describe, expect, it, vi } from "vitest";
import { PLAYHQ_TENANT, fetchPlayhqTeamPage, parsePlayhqUrl } from "@/lib/playhq";

const AFL_URL = "https://www.playhq.com/afl/org/kotara-jfc/1a2b3c4d/u10-2026/teams/kotara-u10/9f8e7d6c";
const NETBALL_URL =
  "https://www.playhq.com/netball-australia/org/st-agathas-netball-club/2d10864e/winter-2026/teams/st-agathas-9/71674821";

describe("parsePlayhqUrl", () => {
  it("reads the tenant from the team page's URL", () => {
    expect(parsePlayhqUrl(AFL_URL, "afl")).toEqual({ ok: true, teamId: "9f8e7d6c", tenant: "afl" });
    expect(parsePlayhqUrl(NETBALL_URL, "netball")).toEqual({
      ok: true,
      teamId: "71674821",
      tenant: "netball-australia",
    });
  });

  it("refuses another sport's team page", () => {
    const afl = parsePlayhqUrl(AFL_URL, "netball");
    expect(afl.ok).toBe(false);
    expect(!afl.ok && afl.reason).toMatch(/netball/i);
    const netball = parsePlayhqUrl(NETBALL_URL, "afl");
    expect(netball.ok).toBe(false);
    expect(!netball.ok && netball.reason).toMatch(/afl/i);
  });

  it("has no PlayHQ for league", () => {
    expect(PLAYHQ_TENANT.rugby_league).toBeNull();
    const parsed = parsePlayhqUrl(AFL_URL, "rugby_league");
    expect(parsed.ok).toBe(false);
    expect(!parsed.ok && parsed.reason).toMatch(/rugby league/i);
  });
});

describe("fetchPlayhqTeamPage", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("asks PlayHQ under the team's own tenant", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ errors: [{ message: "stop" }] })));
    vi.stubGlobal("fetch", fetchMock);
    await expect(fetchPlayhqTeamPage("71674821", "netball-australia")).rejects.toThrow("stop");
    const init = (fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1];
    expect((init.headers as Record<string, string>).tenant).toBe("netball-australia");
  });
});
