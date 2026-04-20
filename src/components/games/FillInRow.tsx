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
    <li className="flex items-center justify-between bg-amber-50/40 px-4 py-3">
      <div className="flex items-center gap-3">
        <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-amber-100 text-xs font-semibold text-amber-800 tabular-nums">
          {jerseyNumber ?? "–"}
        </span>
        <span className="text-sm font-medium text-gray-800">{fullName}</span>
        <span className="rounded-full bg-amber-200/60 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-amber-800">
          Fill-in
        </span>
      </div>
      {canEdit && (
        <button
          type="button"
          onClick={handleRemove}
          disabled={isPending}
          className="rounded-full border border-gray-200 px-3 py-1 text-xs font-semibold text-gray-600 hover:border-red-200 hover:bg-red-50 hover:text-red-700 disabled:opacity-60"
        >
          {isPending ? "Removing…" : "Remove"}
        </button>
      )}
    </li>
  );
}
