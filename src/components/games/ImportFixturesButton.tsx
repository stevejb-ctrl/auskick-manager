"use client";

import { useState, useTransition } from "react";
import {
  importPlayhqFixtures,
  previewPlayhqFixtures,
} from "@/app/(app)/teams/[teamId]/games/playhq-actions";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Label } from "@/components/ui/Label";
import { Spinner } from "@/components/ui/Spinner";
import { FormattedDateTime } from "@/components/ui/FormattedDateTime";
import type { PlayHQFixture, PlayHQTeamMeta } from "@/lib/playhq";

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
type ButtonSize = "sm" | "md" | "lg";

interface Props {
  teamId: string;
  existingExternalIds: string[];
  initialUrl?: string;
  /** Trigger-button style. Defaults to `ghost` / `sm` to match the old inline usage. */
  variant?: ButtonVariant;
  size?: ButtonSize;
  className?: string;
}

export function ImportFixturesButton({
  teamId,
  existingExternalIds,
  initialUrl = "",
  variant = "ghost",
  size = "sm",
  className,
}: Props) {
  const [open, setOpen] = useState(false);
  const [url, setUrl] = useState(initialUrl);
  const [meta, setMeta] = useState<PlayHQTeamMeta | null>(null);
  const [fixtures, setFixtures] = useState<PlayHQFixture[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<
    { imported: number; updated: number; skipped: number } | null
  >(null);
  const [isPending, startTransition] = useTransition();

  const existingSet = new Set(existingExternalIds);

  function reset() {
    setUrl(initialUrl);
    setMeta(null);
    setFixtures([]);
    setSelected(new Set());
    setError(null);
    setResult(null);
  }

  function close() {
    reset();
    setOpen(false);
  }

  function handlePreview(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const res = await previewPlayhqFixtures(teamId, url);
      if (!res.success) {
        setError(res.error);
        return;
      }
      setMeta(res.meta ?? null);
      setFixtures(res.fixtures ?? []);
      setSelected(
        new Set(
          (res.fixtures ?? [])
            .filter((f) => !existingSet.has(f.externalId))
            .map((f) => f.externalId)
        )
      );
    });
  }

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function handleImport() {
    setError(null);
    startTransition(async () => {
      const res = await importPlayhqFixtures(teamId, url, Array.from(selected));
      if (!res.success) {
        setError(res.error);
        return;
      }
      setResult({
        imported: res.imported,
        updated: res.updated,
        skipped: res.skipped,
      });
    });
  }

  return (
    <>
      <Button
        type="button"
        variant={variant}
        size={size}
        className={className}
        onClick={() => setOpen(true)}
      >
        Import from PlayHQ
      </Button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4"
          onClick={close}
        >
          <div
            className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-lg border border-hairline bg-surface p-5 shadow-modal"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-start justify-between">
              <h3 className="text-lg font-semibold text-ink">
                Import fixtures from PlayHQ
              </h3>
              <button
                type="button"
                onClick={close}
                className="text-ink-mute transition-colors duration-fast ease-out-quart hover:text-ink"
                aria-label="Close"
              >
                ✕
              </button>
            </div>

            {result ? (
              <div className="space-y-4">
                <div className="rounded-md border border-ok/30 bg-ok/10 p-3 text-sm text-ok">
                  Imported {result.imported} new, updated {result.updated},
                  skipped {result.skipped} unchanged.
                </div>
                <Button type="button" onClick={close}>
                  Done
                </Button>
              </div>
            ) : !meta ? (
              <form onSubmit={handlePreview} className="space-y-3">
                <div className="space-y-1">
                  <Label htmlFor="phq-url">PlayHQ team URL</Label>
                  <Input
                    id="phq-url"
                    type="url"
                    value={url}
                    onChange={(e) => setUrl(e.target.value)}
                    placeholder="https://www.playhq.com/afl/org/..."
                    disabled={isPending}
                    autoFocus
                  />
                  <p className="text-xs text-ink-mute">
                    Go to <strong>playhq.com</strong>, navigate to your team&rsquo;s
                    page, and paste the URL here. It should look like:
                  </p>
                  <p className="mt-1 rounded bg-surface-alt px-2 py-1 font-mono text-xs text-ink-dim break-all">
                    playhq.com/afl/org/<em>club</em>/&hellip;/teams/<em>team-name</em>/<em>abc123</em>
                  </p>
                  <p className="mt-1 text-xs text-ink-mute">
                    The short code at the end is what identifies your team. If the
                    URL you&rsquo;re pasting ends with <code>/teams</code> and nothing
                    after it, open the team page first.
                  </p>
                </div>
                {error && (
                  <p className="text-sm text-danger" role="alert">
                    {error}
                  </p>
                )}
                <div className="flex gap-2">
                  <Button type="submit" loading={isPending} size="sm">
                    Preview fixtures
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={close}
                    disabled={isPending}
                  >
                    Cancel
                  </Button>
                </div>
              </form>
            ) : (
              <div className="space-y-3">
                <div className="rounded-md border border-hairline bg-surface-alt px-3 py-2 text-sm">
                  <div className="font-semibold text-ink">
                    {meta.teamName}
                  </div>
                  <div className="text-xs text-ink-dim">
                    {meta.clubName} · {meta.competition} · {meta.season}
                  </div>
                </div>

                {fixtures.length === 0 ? (
                  <p className="text-sm text-ink-mute">
                    No scheduled games found for this team yet.
                  </p>
                ) : (
                  <div className="max-h-96 overflow-y-auto rounded-md border border-hairline">
                    <table className="w-full text-sm">
                      <thead className="sticky top-0 bg-surface-alt text-[11px] font-bold uppercase tracking-micro text-ink-mute">
                        <tr>
                          <th className="px-3 py-2 text-left">
                            <input
                              type="checkbox"
                              checked={
                                selected.size ===
                                fixtures.filter(
                                  (f) => !existingSet.has(f.externalId)
                                ).length
                              }
                              onChange={(e) => {
                                if (e.target.checked) {
                                  setSelected(
                                    new Set(
                                      fixtures
                                        .filter(
                                          (f) => !existingSet.has(f.externalId)
                                        )
                                        .map((f) => f.externalId)
                                    )
                                  );
                                } else {
                                  setSelected(new Set());
                                }
                              }}
                              aria-label="Select all"
                            />
                          </th>
                          <th className="px-2 py-2 text-left">Round</th>
                          <th className="px-2 py-2 text-left">Date</th>
                          <th className="px-2 py-2 text-left">Opponent</th>
                          <th className="px-2 py-2 text-left">Venue</th>
                        </tr>
                      </thead>
                      <tbody>
                        {fixtures.map((f) => {
                          const already = existingSet.has(f.externalId);
                          return (
                            <tr
                              key={f.externalId}
                              className="border-t border-hairline"
                            >
                              <td className="px-3 py-2">
                                <input
                                  type="checkbox"
                                  checked={selected.has(f.externalId)}
                                  disabled={already}
                                  onChange={() => toggle(f.externalId)}
                                />
                              </td>
                              <td className="px-2 py-2 text-ink">
                                {f.round ?? f.roundName}
                              </td>
                              <td className="px-2 py-2 text-ink">
                                <FormattedDateTime
                                  iso={f.scheduledAt}
                                  mode="long"
                                />
                              </td>
                              <td className="px-2 py-2 text-ink">
                                {f.opponent}
                                {already && (
                                  <span className="ml-2 text-xs text-ink-mute">
                                    (already imported)
                                  </span>
                                )}
                              </td>
                              <td className="px-2 py-2 text-ink-dim">
                                {f.venue ?? "—"}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}

                {error && (
                  <p className="text-sm text-danger" role="alert">
                    {error}
                  </p>
                )}

                <div className="flex gap-2">
                  <Button
                    type="button"
                    size="sm"
                    onClick={handleImport}
                    loading={isPending}
                    disabled={selected.size === 0}
                  >
                    Import {selected.size} fixture{selected.size === 1 ? "" : "s"}
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setMeta(null);
                      setFixtures([]);
                      setSelected(new Set());
                    }}
                    disabled={isPending}
                  >
                    Back
                  </Button>
                </div>
              </div>
            )}

            {isPending && !meta && !result && (
              <div className="mt-3 flex items-center gap-2 text-xs text-ink-mute">
                <Spinner size="sm" /> Fetching from PlayHQ…
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
