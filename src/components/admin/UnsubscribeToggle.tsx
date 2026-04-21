"use client";

import { useState, useTransition } from "react";
import { Toggle } from "@/components/ui/Toggle";
import { setUnsubscribed } from "@/app/(app)/admin/actions";

interface UnsubscribeToggleProps {
  profileId: string;
  initialUnsubscribed: boolean;
}

/**
 * Manual unsubscribe toggle. Today this only persists the preference —
 * it becomes meaningful once the email layer ships and the send path
 * filters on `contact_preferences.unsubscribed_at`.
 */
export function UnsubscribeToggle({
  profileId,
  initialUnsubscribed,
}: UnsubscribeToggleProps) {
  const [unsubbed, setUnsubbed] = useState(initialUnsubscribed);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function onChange(next: boolean) {
    const prev = unsubbed;
    setUnsubbed(next);
    setError(null);
    startTransition(async () => {
      const res = await setUnsubscribed(profileId, next);
      if (!res.success) {
        setUnsubbed(prev);
        setError(res.error);
      }
    });
  }

  return (
    <div>
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="text-sm font-medium text-ink">Unsubscribed from email</div>
          <div className="text-xs text-ink-mute">
            Manual flag. Future broadcasts will skip this user.
          </div>
        </div>
        <Toggle checked={unsubbed} onChange={onChange} disabled={pending} />
      </div>
      {error && <p className="mt-1 text-xs text-danger">{error}</p>}
    </div>
  );
}
