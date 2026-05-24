// Builds the subject + plain-text + HTML body for the team-invite
// emails. Kept as a standalone module rather than inlined into the
// action so the e2e tests (and any future unit test) can import the
// pure builder without dragging Resend along.
//
// Two flavours:
//   - buildInviteEmail: classic invite with a /join/{token} CTA for
//     users who don't yet have a Siren account or aren't known to
//     the admin.
//   - buildMemberAddedEmail: notification for users who were added
//     directly (admin matched their email to an existing profile),
//     so there's no token to accept — they're already in. CTA goes
//     straight to the team's Games tab.
//
// Style follows the contact form's inline-HTML pattern — minimal
// styling, no template engine, no external assets. The CTA is a
// styled anchor (not a button element — Gmail and Outlook strip
// most button styling) and there's a literal-URL fallback for clients
// that won't render the anchor.

export interface InviteEmailInput {
  teamName: string;
  inviterName: string;
  /** Human-readable role label, e.g. "Game manager". */
  roleLabel: string;
  /** One-line description of what the role can do. */
  roleSummary: string;
  /** Full URL to /join/{token}. */
  joinUrl: string;
}

export interface InviteEmail {
  subject: string;
  text: string;
  html: string;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function buildInviteEmail(input: InviteEmailInput): InviteEmail {
  const { teamName, inviterName, roleLabel, roleSummary, joinUrl } = input;

  const subject = `${inviterName} invited you to ${teamName} on Siren Footy`;

  const text = [
    `${inviterName} added you to ${teamName} on Siren Footy as ${roleLabel}.`,
    "",
    roleSummary,
    "",
    "Join here (link expires in 14 days):",
    joinUrl,
    "",
    "If you didn't expect this email, ignore it — the link only works once.",
    "",
    "— Siren Footy",
  ].join("\n");

  const html = `<!doctype html>
<html>
  <body style="margin:0;padding:24px;background:#f7f5f1;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#1f2937;line-height:1.5;">
    <div style="max-width:520px;margin:0 auto;background:#ffffff;border:1px solid #e5e7eb;border-radius:8px;padding:32px 28px;">
      <h2 style="margin:0 0 12px;font-size:22px;font-weight:700;color:#111827;">${escapeHtml(teamName)}</h2>
      <p style="margin:0 0 8px;font-size:15px;">
        ${escapeHtml(inviterName)} added you as <strong>${escapeHtml(roleLabel)}</strong>.
      </p>
      <p style="margin:0 0 24px;color:#6b7280;font-size:14px;">
        ${escapeHtml(roleSummary)}
      </p>
      <p style="margin:0 0 24px;">
        <a href="${escapeHtml(joinUrl)}"
           style="display:inline-block;background:#16a34a;color:#ffffff;padding:12px 22px;border-radius:6px;text-decoration:none;font-weight:600;font-size:15px;">
          Join team
        </a>
      </p>
      <p style="margin:0 0 8px;color:#6b7280;font-size:13px;">
        If the button doesn't work, copy this link into your browser:
      </p>
      <p style="margin:0 0 24px;word-break:break-all;font-size:13px;">
        <a href="${escapeHtml(joinUrl)}" style="color:#16a34a;">${escapeHtml(joinUrl)}</a>
      </p>
      <hr style="border:none;border-top:1px solid #e5e7eb;margin:0 0 16px;" />
      <p style="margin:0;color:#9ca3af;font-size:12px;">
        Link expires in 14 days. If you didn't expect this email, just ignore it.
      </p>
      <p style="margin:16px 0 0;color:#9ca3af;font-size:12px;">
        — Siren Footy
      </p>
    </div>
  </body>
</html>`;

  return { subject, text, html };
}

export interface MemberAddedEmailInput {
  teamName: string;
  /** Display name of the admin who added them. */
  adminName: string;
  /** Human-readable role label, e.g. "Game manager". */
  roleLabel: string;
  /** One-line description of what the role can do. */
  roleSummary: string;
  /** Full URL to /teams/{id}/games — where the email's CTA lands. */
  teamUrl: string;
}

export function buildMemberAddedEmail(input: MemberAddedEmailInput): InviteEmail {
  const { teamName, adminName, roleLabel, roleSummary, teamUrl } = input;

  const subject = `${adminName} added you to ${teamName} on Siren Footy`;

  const text = [
    `${adminName} added you to ${teamName} on Siren Footy as ${roleLabel}.`,
    "",
    roleSummary,
    "",
    "Open the team:",
    teamUrl,
    "",
    "Didn't expect this? You can leave the team from the team's settings page.",
    "",
    "— Siren Footy",
  ].join("\n");

  const html = `<!doctype html>
<html>
  <body style="margin:0;padding:24px;background:#f7f5f1;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#1f2937;line-height:1.5;">
    <div style="max-width:520px;margin:0 auto;background:#ffffff;border:1px solid #e5e7eb;border-radius:8px;padding:32px 28px;">
      <h2 style="margin:0 0 12px;font-size:22px;font-weight:700;color:#111827;">${escapeHtml(teamName)}</h2>
      <p style="margin:0 0 8px;font-size:15px;">
        ${escapeHtml(adminName)} added you as <strong>${escapeHtml(roleLabel)}</strong>. You're already a member — no need to accept anything.
      </p>
      <p style="margin:0 0 24px;color:#6b7280;font-size:14px;">
        ${escapeHtml(roleSummary)}
      </p>
      <p style="margin:0 0 24px;">
        <a href="${escapeHtml(teamUrl)}"
           style="display:inline-block;background:#16a34a;color:#ffffff;padding:12px 22px;border-radius:6px;text-decoration:none;font-weight:600;font-size:15px;">
          Open team
        </a>
      </p>
      <p style="margin:0 0 8px;color:#6b7280;font-size:13px;">
        If the button doesn't work, copy this link into your browser:
      </p>
      <p style="margin:0 0 24px;word-break:break-all;font-size:13px;">
        <a href="${escapeHtml(teamUrl)}" style="color:#16a34a;">${escapeHtml(teamUrl)}</a>
      </p>
      <hr style="border:none;border-top:1px solid #e5e7eb;margin:0 0 16px;" />
      <p style="margin:0;color:#9ca3af;font-size:12px;">
        Didn't expect this? You can leave the team from its settings page.
      </p>
      <p style="margin:16px 0 0;color:#9ca3af;font-size:12px;">
        — Siren Footy
      </p>
    </div>
  </body>
</html>`;

  return { subject, text, html };
}
