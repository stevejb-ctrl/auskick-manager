"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { updateDisplayName } from "@/app/(app)/account/actions";
import { SFButton } from "@/components/sf";
import { Input } from "@/components/ui/Input";
import { Label } from "@/components/ui/Label";
import { InlineAlert } from "@/components/ui/InlineAlert";

/**
 * My account › Name: shown, and editable. The coach sees this name in
 * Team › People; without it they see your email.
 */
export function DisplayNameForm({ initialName }: { initialName: string | null }) {
  const router = useRouter();
  const [name, setName] = useState(initialName ?? "");
  const [shown, setShown] = useState(initialName ?? "");
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function save() {
    setError(null);
    startTransition(async () => {
      const res = await updateDisplayName(name);
      if (!res.success) {
        setError(res.error);
        return;
      }
      setShown(res.name ?? name);
      setName(res.name ?? name);
      setEditing(false);
      router.refresh();
    });
  }

  if (!editing) {
    return (
      <div className="mt-1 flex items-center justify-between gap-3">
        {shown ? <span className="text-ink">{shown}</span> : <span className="text-ink-mute">Not set</span>}
        <SFButton variant="ghost" size="sm" onClick={() => setEditing(true)}>
          {shown ? "Change name" : "Add your name"}
        </SFButton>
      </div>
    );
  }

  return (
    <div className="mt-1 space-y-2">
      <Label htmlFor="account-your-name">Your name</Label>
      <Input
        id="account-your-name"
        autoComplete="name"
        value={name}
        onChange={(e) => setName(e.target.value)}
        disabled={isPending}
        placeholder="First and last name"
      />
      <p className="text-xs text-ink-mute">Your coach sees this in the team&rsquo;s People list.</p>
      {error && <InlineAlert>{error}</InlineAlert>}
      <div className="flex gap-2">
        <SFButton variant="primary" size="sm" loading={isPending} onClick={save}>
          Save
        </SFButton>
        <SFButton
          variant="ghost"
          size="sm"
          disabled={isPending}
          onClick={() => {
            setEditing(false);
            setName(shown);
            setError(null);
          }}
        >
          Cancel
        </SFButton>
      </div>
    </div>
  );
}
