// ─── Invite state ────────────────────────────────────────────
// A team invite is one person's, once. Accepting it consumes it, for
// everyone, the person who accepted included: re-opening the link never
// re-adds them (round 2 usability, 24 Oct 2026: a removed Manager tapped
// Accept on their old link and was a Manager again). Removing a member
// revokes the invites they used, so their link says it was cancelled.
//
// The join page and acceptInvite both read this, so the page never
// offers an Accept button the server will refuse.

export interface InviteTimes {
  accepted_at: string | null;
  revoked_at: string | null;
  expires_at: string;
}

export type InviteState = "open" | "used" | "revoked" | "expired";

/** Why a link no longer works, and what to do, in the coach's words. */
export const INVITE_UNAVAILABLE: Record<Exclude<InviteState, "open">, string> = {
  used: "This invite has already been used. Each link is for one person: ask your coach for a new one.",
  revoked: "This invite has been cancelled. If you still need to join, ask your coach for a new one.",
  expired: "This invite has expired. Ask your coach for a new one.",
};

export function inviteState(invite: InviteTimes, now: Date = new Date()): InviteState {
  if (invite.revoked_at) return "revoked";
  if (invite.accepted_at) return "used";
  if (new Date(invite.expires_at).getTime() < now.getTime()) return "expired";
  return "open";
}
