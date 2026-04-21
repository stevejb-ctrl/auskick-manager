"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState, useTransition } from "react";
import type { ContactTag } from "@/lib/types";

interface UsersFilterBarProps {
  tags: ContactTag[];
}

/**
 * Lives entirely in URL params so filters are shareable and RSC pages can
 * read them server-side. No local state for the persisted values — just a
 * controlled search box that commits on submit/blur.
 */
export function UsersFilterBar({ tags }: UsersFilterBarProps) {
  const router = useRouter();
  const params = useSearchParams();
  const [pending, startTransition] = useTransition();

  const qNow = params.get("q") ?? "";
  const signupRange = params.get("signup") ?? "all";
  const tagParam = params.get("tags") ?? "";
  const selectedTagIds = new Set(tagParam.split(",").filter(Boolean));

  const [q, setQ] = useState(qNow);

  function push(nextParams: URLSearchParams) {
    // Reset cursor whenever filters change.
    nextParams.delete("cursor");
    startTransition(() => {
      const qs = nextParams.toString();
      router.replace(`/admin/users${qs ? `?${qs}` : ""}`);
    });
  }

  function commitSearch() {
    const next = new URLSearchParams(params.toString());
    if (q.trim()) next.set("q", q.trim());
    else next.delete("q");
    push(next);
  }

  function setSignup(value: string) {
    const next = new URLSearchParams(params.toString());
    if (value === "all") next.delete("signup");
    else next.set("signup", value);
    push(next);
  }

  function toggleTag(id: string) {
    const next = new URLSearchParams(params.toString());
    const copy = new Set(selectedTagIds);
    if (copy.has(id)) copy.delete(id);
    else copy.add(id);
    if (copy.size === 0) next.delete("tags");
    else next.set("tags", Array.from(copy).join(","));
    push(next);
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") commitSearch();
          }}
          onBlur={commitSearch}
          placeholder="Search email or name…"
          className="min-w-[220px] flex-1 rounded-md border border-hairline bg-surface px-3 py-1.5 text-sm text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600"
        />
        <select
          value={signupRange}
          onChange={(e) => setSignup(e.target.value)}
          className="rounded-md border border-hairline bg-surface px-2 py-1.5 text-sm text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600"
        >
          <option value="all">All signups</option>
          <option value="7d">Last 7 days</option>
          <option value="30d">Last 30 days</option>
          <option value="90d">Last 90 days</option>
        </select>
        {pending && <span className="text-xs text-ink-mute">Filtering…</span>}
      </div>
      {tags.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {tags.map((t) => {
            const active = selectedTagIds.has(t.id);
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => toggleTag(t.id)}
                className={`rounded-full px-2.5 py-0.5 text-xs font-medium transition-colors duration-fast ${
                  active
                    ? "bg-brand-600 text-warm"
                    : "bg-surface-alt text-ink-dim hover:text-ink"
                }`}
              >
                {t.name}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
