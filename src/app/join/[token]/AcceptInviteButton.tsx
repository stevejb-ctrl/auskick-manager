"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { acceptInvite } from "./actions";
import { Button } from "@/components/ui/Button";

interface AcceptInviteButtonProps {
  token: string;
}

export function AcceptInviteButton({ token }: AcceptInviteButtonProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleAccept() {
    setError(null);
    startTransition(async () => {
      const res = await acceptInvite(token);
      if (!res.success) {
        setError(res.error);
        return;
      }
      // Land on the Games tab specifically, not the team home. The
       // home tab surfaces setup affordances that can confuse a brand-
       // new parent into thinking they need to create something — the
       // games tab is the schedule view they actually came for.
      router.push(`/teams/${res.teamId}/games`);
      router.refresh();
    });
  }

  return (
    <div className="space-y-3">
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
