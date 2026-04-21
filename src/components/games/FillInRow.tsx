"use client";

import { useTransition } from "react";
import { removeFillIn } from "@/app/(app)/teams/[teamId]/games/[gameId]/actions";
import type { LiveAuth } from "@/lib/types";

interface FillInRowProps {
  auth: LiveAuth;
  gameId: string;
  fillInId: string;
  fullName: string;
  jerseyNumber: number | null;
  canEdit: boolean;
}

export function FillInRow({
  auth,
  gameId,
  fillInId,
  fullName,
  jerseyNumber,
  canEdit,
}: FillInRowProps) {
  const [isPending, startTransition] = useTransition();

  function handleRemove() {
    if (!canEdit || isPending) return;
    startTransition(async () => {
      await removeFillIn(auth, gameId, fillInId);
    });
  }

  return (
    <li className="flex items-center justify-between bg-warn-soft/40 px-4 py-3">
      <div className="flex items-center gap-3">
        <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-warn-soft text-xs font-semibold text-warn tabular-nums">
          {jerseyNumber ?? "–"}
        </span>
        <span className="text-sm font-medium text-ink">{fullName}</span>
        <span className="rounded-full bg-warn-soft px-2 py-0.5 text-[10px] font-bold uppercase tracking-micro text-warn">
          Fill-in
        </span>
      </div>
      {canEdit && (
        <button
          type="button"
          onClick={handleRemove}
          disabled={isPending}
          className="rounded-full border border-hairline px-3 py-1 text-xs font-semibold text-ink-dim transition-colors duration-fast ease-out-quart hover:border-danger/30 hover:bg-danger/10 hover:text-danger disabled:opacity-60"
        >
          {isPending ? "Removing…" : "Remove"}
        </button>
      )}
    </li>
  );
}
