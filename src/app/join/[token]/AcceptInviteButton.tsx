"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { acceptInvite } from "./actions";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Label } from "@/components/ui/Label";

interface AcceptInviteButtonProps {
  token: string;
  /**
   * The person's profile has no name (email sign-ups get a blank one):
   * ask for it, so the coach can tell who joined. The server insists.
   */
  needsName?: boolean;
}

export function AcceptInviteButton({ token, needsName = false }: AcceptInviteButtonProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState("");

  function handleAccept() {
    setError(null);
    startTransition(async () => {
      const res = await acceptInvite(token, needsName ? name : undefined);
      if (!res.success) {
        setError(res.error);
        return;
      }
      // Land on the Games tab specifically, not the team home. The
      // home tab surfaces setup affordances that can confuse a brand-
      // new parent into thinking they need to create something — the
      // games tab is the schedule view they actually came for. The
      // team layout's JoinedNotice says who they joined as.
      router.push(`/teams/${res.teamId}/games${res.role ? `?joined=${res.role}` : ""}`);
      router.refresh();
    });
  }

  return (
    <div className="space-y-3">
      {needsName && (
        <div className="space-y-1">
          <Label htmlFor="invite-your-name">Your name</Label>
          <Input
            id="invite-your-name"
            autoComplete="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            disabled={isPending}
            placeholder="First and last name"
          />
          <p className="text-xs text-ink-mute">So your coach knows who joined.</p>
        </div>
      )}
      <Button onClick={handleAccept} loading={isPending} className="w-full">
        Accept &amp; join team
      </Button>
      {error && (
        <p className="text-sm text-danger" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
