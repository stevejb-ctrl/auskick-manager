"use client";

import { useEffect, useState, useTransition } from "react";
import {
  createInvite,
  removeMember,
  revokeInvite,
  sendInviteEmail,
  updateMemberRole,
} from "@/app/(app)/teams/[teamId]/settings/member-actions";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Label } from "@/components/ui/Label";
import { Badge } from "@/components/ui/Badge";
import { ROLE_LABEL, ROLE_OPTIONS, ROLE_SUMMARY } from "@/lib/roles";
import { isEmail } from "@/lib/email/validate";
import { publicOrigin } from "@/lib/platform";
import type { TeamRole } from "@/lib/types";

// Mirror of RESEND_THROTTLE_MS on the server. Used for the countdown
// display on the "Resend email" button so the disabled state matches
// what the server will actually accept.
const RESEND_THROTTLE_MS = 60_000;

export interface MemberRow {
  user_id: string;
  role: TeamRole;
  full_name: string | null;
  email: string | null;
  isSelf: boolean;
}

export interface PendingInvite {
  id: string;
  token: string;
  role: TeamRole;
  email_hint: string | null;
  invited_email: string | null;
  email_sent_at: string | null;
  email_send_count: number;
  created_at: string;
  expires_at: string;
}

interface TeamMembersSettingsProps {
  teamId: string;
  isAdmin: boolean;
  members: MemberRow[];
  invites: PendingInvite[];
}

export function TeamMembersSettings({
  teamId,
  isAdmin,
  members,
  invites,
}: TeamMembersSettingsProps) {
  return (
    <div className="rounded-lg border border-hairline bg-surface p-5 shadow-card">
      <div className="flex items-baseline justify-between">
        <h2 className="text-base font-semibold text-ink">Team members</h2>
        <span className="text-xs text-ink-mute">
          {members.length} {members.length === 1 ? "member" : "members"}
        </span>
      </div>

      <ul className="mt-4 divide-y divide-hairline">
        {members.map((m) => (
          <MemberRowItem
            key={m.user_id}
            teamId={teamId}
            member={m}
            canManage={isAdmin}
          />
        ))}
      </ul>

      {isAdmin && (
        <div className="mt-6 border-t border-hairline pt-5">
          <InviteSection teamId={teamId} invites={invites} />
        </div>
      )}
    </div>
  );
}

// ─── Individual member row ──────────────────────────────────────

function MemberRowItem({
  teamId,
  member,
  canManage,
}: {
  teamId: string;
  member: MemberRow;
  canManage: boolean;
}) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleRoleChange(newRole: TeamRole) {
    setError(null);
    if (newRole === member.role) return;
    startTransition(async () => {
      const res = await updateMemberRole(teamId, member.user_id, newRole);
      if (!res.success) setError(res.error);
    });
  }

  function handleRemove() {
    setError(null);
    const label = member.full_name ?? member.email ?? "this member";
    if (!confirm(`Remove ${label} from the team?`)) return;
    startTransition(async () => {
      const res = await removeMember(teamId, member.user_id);
      if (!res.success) setError(res.error);
    });
  }

  return (
    <li className="flex flex-wrap items-center gap-3 py-3">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p className="truncate text-sm font-medium text-ink">
            {member.full_name ?? member.email ?? "Unknown"}
            {member.isSelf && (
              <span className="ml-1.5 text-xs text-ink-mute">(you)</span>
            )}
          </p>
          <Badge variant={member.role}>{ROLE_LABEL[member.role]}</Badge>
        </div>
        {member.full_name && member.email && (
          <p className="truncate text-xs text-ink-mute">{member.email}</p>
        )}
        {error && (
          <p className="mt-1 text-xs text-danger" role="alert">
            {error}
          </p>
        )}
      </div>

      {canManage && (
        <div className="flex items-center gap-2">
          <select
            value={member.role}
            onChange={(e) => handleRoleChange(e.target.value as TeamRole)}
            disabled={isPending}
            className="rounded-md border border-hairline bg-surface px-2 py-1.5 text-sm text-ink shadow-card focus:border-brand-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-600 disabled:opacity-50"
            aria-label={`Role for ${member.full_name ?? "member"}`}
          >
            {ROLE_OPTIONS.map((r) => (
              <option key={r} value={r}>
                {ROLE_LABEL[r]}
              </option>
            ))}
          </select>
          <Button
            size="sm"
            variant="ghost"
            onClick={handleRemove}
            loading={isPending}
            className="text-danger hover:bg-danger/10 hover:text-danger"
          >
            Remove
          </Button>
        </div>
      )}
    </li>
  );
}

// ─── Invite section (admin-only) ────────────────────────────────

function InviteSection({
  teamId,
  invites,
}: {
  teamId: string;
  invites: PendingInvite[];
}) {
  const [showForm, setShowForm] = useState(false);

  return (
    <div className="space-y-4">
      <div className="flex items-baseline justify-between">
        <h3 className="text-sm font-semibold text-ink">Invites</h3>
        {!showForm && (
          <Button size="sm" onClick={() => setShowForm(true)}>
            Invite someone
          </Button>
        )}
      </div>

      {showForm && (
        <InviteForm
          teamId={teamId}
          onClose={() => setShowForm(false)}
        />
      )}

      {invites.length > 0 ? (
        <ul className="divide-y divide-hairline rounded-md border border-hairline">
          {invites.map((inv) => (
            <InviteRow key={inv.id} teamId={teamId} invite={inv} />
          ))}
        </ul>
      ) : (
        !showForm && (
          <p className="text-xs text-ink-mute">No pending invites.</p>
        )
      )}
    </div>
  );
}

type EmailStatus =
  | { kind: "none" }
  | { kind: "sent"; recipient: string }
  | { kind: "failed"; recipient: string; error: string };

function InviteForm({
  teamId,
  onClose,
}: {
  teamId: string;
  onClose: () => void;
}) {
  const [role, setRole] = useState<TeamRole>("game_manager");
  const [invitedEmail, setInvitedEmail] = useState("");
  const [isPending, startTransition] = useTransition();
  const [createdToken, setCreatedToken] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [emailStatus, setEmailStatus] = useState<EmailStatus>({ kind: "none" });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setEmailStatus({ kind: "none" });

    const trimmed = invitedEmail.trim();
    if (trimmed && !isEmail(trimmed)) {
      setError("Please use a valid email address, or leave the field blank.");
      return;
    }

    startTransition(async () => {
      const res = await createInvite(teamId, role, trimmed || null);
      if (!res.success) {
        setError(res.error);
        return;
      }
      setCreatedToken(res.token ?? null);

      // Auto-send if the admin filled in an email. The invite is already
      // saved, so a failed send just shows a red row — the copyable link
      // is still usable as a fallback.
      if (trimmed && res.inviteId) {
        const sendRes = await sendInviteEmail(teamId, res.inviteId);
        setEmailStatus(
          sendRes.success
            ? { kind: "sent", recipient: trimmed }
            : { kind: "failed", recipient: trimmed, error: sendRes.error }
        );
      }
    });
  }

  const url = createdToken ? `${publicOrigin()}/join/${createdToken}` : null;

  async function copyLink() {
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }

  if (createdToken && url) {
    return (
      <div
        className="space-y-3 rounded-md border border-brand-200 bg-brand-50 p-4"
        data-testid="invite-created"
      >
        <p className="text-sm font-semibold text-brand-700">
          Invite link ready — share it privately.
        </p>
        <p className="text-xs text-ink-dim">
          Anyone who opens this link can join as{" "}
          <span className="font-medium">{ROLE_LABEL[role]}</span>. Expires in 14
          days.
        </p>

        {emailStatus.kind === "sent" && (
          <p
            className="rounded border border-emerald-300 bg-emerald-50 px-3 py-2 text-sm text-emerald-800"
            role="status"
          >
            ✓ Invite emailed to <strong>{emailStatus.recipient}</strong>.
          </p>
        )}
        {emailStatus.kind === "failed" && (
          <p
            className="rounded border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger"
            role="alert"
          >
            Couldn’t email <strong>{emailStatus.recipient}</strong> ({emailStatus.error}).
            Copy the link below and share it manually.
          </p>
        )}

        <div className="flex items-center gap-2">
          <input
            readOnly
            value={url}
            className="flex-1 rounded border border-hairline bg-surface px-2 py-1 font-mono text-xs text-ink"
            onFocus={(e) => e.currentTarget.select()}
          />
          <Button type="button" size="sm" onClick={copyLink}>
            {copied ? "Copied!" : "Copy"}
          </Button>
        </div>
        <div className="flex gap-2 pt-1">
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={() => {
              setCreatedToken(null);
              setInvitedEmail("");
              setEmailStatus({ kind: "none" });
            }}
          >
            Create another
          </Button>
          <Button type="button" size="sm" variant="ghost" onClick={onClose}>
            Done
          </Button>
        </div>
      </div>
    );
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="space-y-3 rounded-md border border-hairline bg-surface-alt p-4"
    >
      <div className="space-y-1">
        <Label htmlFor="invite-role">Role</Label>
        <select
          id="invite-role"
          value={role}
          onChange={(e) => setRole(e.target.value as TeamRole)}
          disabled={isPending}
          className="block w-full rounded-md border border-hairline bg-surface px-3 py-2 text-sm text-ink shadow-card focus:border-brand-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-600 disabled:opacity-50"
        >
          {ROLE_OPTIONS.map((r) => (
            <option key={r} value={r}>
              {ROLE_LABEL[r]}
            </option>
          ))}
        </select>
        <p className="text-xs text-ink-mute">{ROLE_SUMMARY[role]}</p>
      </div>

      <div className="space-y-1">
        <Label htmlFor="invite-email">Email (optional)</Label>
        <Input
          id="invite-email"
          type="email"
          autoComplete="email"
          value={invitedEmail}
          onChange={(e) => setInvitedEmail(e.target.value)}
          placeholder="parent@example.com"
          disabled={isPending}
        />
        <p className="text-xs text-ink-mute">
          We’ll email a join link to this address. Leave blank to copy and share
          manually.
        </p>
      </div>

      {error && (
        <p className="text-sm text-danger" role="alert">
          {error}
        </p>
      )}

      <div className="flex gap-2">
        <Button type="submit" size="sm" loading={isPending}>
          {invitedEmail.trim() ? "Send invite" : "Create invite link"}
        </Button>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          onClick={onClose}
          disabled={isPending}
        >
          Cancel
        </Button>
      </div>
    </form>
  );
}

function InviteRow({
  teamId,
  invite,
}: {
  teamId: string;
  invite: PendingInvite;
}) {
  const [isPending, startTransition] = useTransition();
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resendNote, setResendNote] = useState<string | null>(null);

  // Ticks every second while we're inside the resend throttle window
  // so the button label can count down ("Sent 28s ago"). After the
  // window passes, the interval clears itself.
  const [nowMs, setNowMs] = useState(() => Date.now());
  useEffect(() => {
    if (!invite.email_sent_at) return;
    const elapsed = Date.now() - new Date(invite.email_sent_at).getTime();
    if (elapsed >= RESEND_THROTTLE_MS) return;
    const id = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(id);
  }, [invite.email_sent_at]);

  const url = `${publicOrigin()}/join/${invite.token}`;
  const recipient = invite.invited_email ?? invite.email_hint;
  const throttleRemainingMs = invite.email_sent_at
    ? Math.max(
        0,
        RESEND_THROTTLE_MS - (nowMs - new Date(invite.email_sent_at).getTime())
      )
    : 0;
  const throttled = throttleRemainingMs > 0;

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }

  function handleRevoke() {
    setError(null);
    if (!confirm("Revoke this invite? The link will stop working immediately."))
      return;
    startTransition(async () => {
      const res = await revokeInvite(teamId, invite.id);
      if (!res.success) setError(res.error);
    });
  }

  function handleResend() {
    setError(null);
    setResendNote(null);
    startTransition(async () => {
      const res = await sendInviteEmail(teamId, invite.id);
      if (!res.success) {
        setError(res.error);
        return;
      }
      setResendNote("Email re-sent.");
      setTimeout(() => setResendNote(null), 3000);
    });
  }

  return (
    <li className="flex flex-wrap items-center gap-3 px-3 py-2.5">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <Badge variant={invite.role}>{ROLE_LABEL[invite.role]}</Badge>
          {recipient && (
            <span className="truncate text-sm text-ink">{recipient}</span>
          )}
          {invite.email_send_count > 0 && (
            <span className="text-xs text-ink-mute">
              Emailed {invite.email_send_count}×
            </span>
          )}
        </div>
        <p className="text-xs text-ink-mute">
          Expires{" "}
          {new Date(invite.expires_at).toLocaleDateString(undefined, {
            day: "numeric",
            month: "short",
            year: "numeric",
          })}
        </p>
        {error && (
          <p className="mt-1 text-xs text-danger" role="alert">
            {error}
          </p>
        )}
        {resendNote && (
          <p className="mt-1 text-xs text-emerald-700" role="status">
            {resendNote}
          </p>
        )}
      </div>
      <div className="flex items-center gap-2">
        {invite.invited_email && (
          <Button
            type="button"
            size="sm"
            variant="secondary"
            onClick={handleResend}
            loading={isPending}
            disabled={isPending || throttled}
            title={
              throttled
                ? `Sent ${Math.ceil((RESEND_THROTTLE_MS - throttleRemainingMs) / 1000)}s ago`
                : undefined
            }
          >
            {throttled
              ? `Sent ${Math.ceil((RESEND_THROTTLE_MS - throttleRemainingMs) / 1000)}s ago`
              : invite.email_send_count > 0
                ? "Resend email"
                : "Send email"}
          </Button>
        )}
        <Button type="button" size="sm" variant="secondary" onClick={copy}>
          {copied ? "Copied!" : "Copy link"}
        </Button>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          onClick={handleRevoke}
          loading={isPending}
          className="text-danger hover:bg-danger/10 hover:text-danger"
        >
          Revoke
        </Button>
      </div>
    </li>
  );
}
