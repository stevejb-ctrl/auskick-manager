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
      router.push(`/teams/${res.teamId}`);
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
