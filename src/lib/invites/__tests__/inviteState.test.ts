// Invites are single-use (round 2 usability, 24 Oct 2026): a removed
// Manager re-opened their old /join link, tapped Accept and was a Manager
// again, because acceptance let the same person accept twice. And a
// second person was shown "Accept & join team" on a used link, then
// refused.

import { describe, expect, it } from "vitest";
import { INVITE_UNAVAILABLE, inviteState } from "@/lib/invites/inviteState";

const NOW = new Date("2026-10-24T09:00:00Z");
const open = {
  accepted_at: null,
  revoked_at: null,
  expires_at: "2026-11-07T09:00:00Z",
};

describe("inviteState", () => {
  it("is open until someone accepts it", () => {
    expect(inviteState(open, NOW)).toBe("open");
  });

  it("is used once anyone has accepted it, the same person included", () => {
    expect(inviteState({ ...open, accepted_at: "2026-10-24T08:00:00Z" }, NOW)).toBe("used");
  });

  it("is revoked when the coach cancels it or removes the person who used it", () => {
    expect(inviteState({ ...open, revoked_at: "2026-10-24T08:30:00Z" }, NOW)).toBe("revoked");
    expect(
      inviteState({ ...open, accepted_at: "2026-10-24T08:00:00Z", revoked_at: "2026-10-24T08:30:00Z" }, NOW),
    ).toBe("revoked");
  });

  it("is expired after its 14 days", () => {
    expect(inviteState({ ...open, expires_at: "2026-10-24T08:59:59Z" }, NOW)).toBe("expired");
  });

  it("says why a link no longer works, and what to do", () => {
    expect(INVITE_UNAVAILABLE.used).toMatch(/already been used/i);
    expect(INVITE_UNAVAILABLE.used).toMatch(/one person/i);
    expect(INVITE_UNAVAILABLE.revoked).toMatch(/cancelled/i);
    for (const copy of Object.values(INVITE_UNAVAILABLE)) {
      expect(copy).toMatch(/ask your coach/i);
    }
  });
});
