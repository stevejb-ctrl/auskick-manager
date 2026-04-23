"use client";

import { useState, useTransition } from "react";
import {
  createInvite,
  removeMember,
  revokeInvite,
  updateMemberRole,
} from "@/app/(app)/teams/[teamId]/settings/member-actions";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Label } from "@/components/ui/Label";
import { Badge } from "@/components/ui/Badge";
import { ROLE_LABEL, ROLE_OPTIONS, ROLE_SUMMARY } from "@/lib/roles";
import type { TeamRole } from "@/lib/types";

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

function InviteForm({
  teamId,
  onClose,
}: {
  teamId: string;
  onClose: () => void;
}) {
  const [role, setRole] = useState<TeamRole>("game_manager");
  const [emailHint, setEmailHint] = useState("");
  const [isPending, startTransition] = useTransition();
  const [createdToken, setCreatedToken] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const res = await createInvite(teamId, role, emailHint || null);
      if (!res.success) {
        setError(res.error);
        return;
      }
      setCreatedToken(res.token ?? null);
    });
  }

  const url =
    createdToken && typeof window !== "undefined"
      ? `${window.location.origin}/join/${createdToken}`
      : null;

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
      <div className="space-y-3 rounded-md border border-brand-200 bg-brand-50 p-4">
        <p className="text-sm font-semibold text-brand-700">
          Invite link ready — share it privately.
        </p>
        <p className="text-xs text-ink-dim">
          Anyone who opens this link can join as{" "}
          <span className="font-medium">{ROLE_LABEL[role]}</span>. Expires in 14
          days.
        </p>
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
              setEmailHint("");
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
        <Label htmlFor="invite-hint">Name or email (optional)</Label>
        <Input
          id="invite-hint"
          type="text"
          value={emailHint}
          onChange={(e) => setEmailHint(e.target.value)}
          placeholder="Just a label so you remember who this is for"
          disabled={isPending}
        />
      </div>

      {error && (
        <p className="text-sm text-danger" role="alert">
          {error}
        </p>
      )}

      <div className="flex gap-2">
        <Button type="submit" size="sm" loading={isPending}>
          Create invite link
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

  const url =
    typeof window !== "undefined"
      ? `${window.location.origin}/join/${invite.token}`
      : `/join/${invite.token}`;

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

  return (
    <li className="flex flex-wrap items-center gap-3 px-3 py-2.5">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <Badge variant={invite.role}>{ROLE_LABEL[invite.role]}</Badge>
          {invite.email_hint && (
            <span className="truncate text-sm text-ink">
              {invite.email_hint}
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
      </div>
      <div className="flex items-center gap-2">
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
