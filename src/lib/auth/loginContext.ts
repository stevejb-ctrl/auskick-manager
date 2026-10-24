// ─── Where a sign-in is headed ───────────────────────────────
// /login tells a coach's story ("Run your team's season… you'll set up
// a team"). Reached from an invite or the team-code page, it tells the
// joining story instead (round 2 usability, 24 Oct 2026).

export type LoginContext =
  | { kind: "invite"; token: string }
  | { kind: "code" }
  | { kind: "default" };

const INVITE = /^\/join\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\/?$/i;

export function loginContextFor(next: string): LoginContext {
  const path = next.split(/[?#]/)[0];
  const invite = INVITE.exec(path);
  if (invite) return { kind: "invite", token: invite[1] };
  if (path === "/join-team" || path === "/join-team/") return { kind: "code" };
  return { kind: "default" };
}
