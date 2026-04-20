"use client";

import { useRef, useState, useTransition } from "react";
import {
  saveSong,
  updateSongStart,
  deleteSong,
} from "@/app/(app)/teams/[teamId]/settings/actions";

interface TeamSongSettingsProps {
  teamId: string;
  currentSongUrl: string | null;
  currentStartSeconds: number;
  isAdmin: boolean;
}

function formatSeconds(s: number): string {
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${r.toString().padStart(2, "0")}`;
}

export function TeamSongSettings({
  teamId,
  currentSongUrl,
  currentStartSeconds,
  isAdmin,
}: TeamSongSettingsProps) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [songUrl, setSongUrl] = useState<string | null>(currentSongUrl);
  const [startSecs, setStartSecs] = useState(currentStartSeconds);
  const [showUpload, setShowUpload] = useState(!currentSongUrl);
  const [previewPlaying, setPreviewPlaying] = useState(false);
  const previewRef = useRef<HTMLAudioElement | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);

  function flash(msg: string) {
    setSuccess(msg);
    setTimeout(() => setSuccess(null), 3000);
  }

  function handlePreview() {
    if (!songUrl) return;
    if (previewPlaying) {
      previewRef.current?.pause();
      setPreviewPlaying(false);
      return;
    }
    const audio = previewRef.current ?? new Audio(songUrl);
    previewRef.current = audio;
    audio.currentTime = startSecs;
    audio.play().catch(() => {});
    setPreviewPlaying(true);
    setTimeout(() => {
      audio.pause();
      setPreviewPlaying(false);
    }, 15000);
  }

  function handleUpload(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const fd = new FormData(e.currentTarget);
    fd.set("start_seconds", String(startSecs));
    startTransition(async () => {
      const result = await saveSong(teamId, fd);
      if (!result.success) {
        setError(result.error);
      } else {
        setSongUrl(result.song_url ?? null);
        setShowUpload(false);
        previewRef.current = null;
        flash("Song saved!");
      }
    });
  }

  function handleUpdateStart(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await updateSongStart(teamId, startSecs);
      if (!result.success) setError(result.error);
      else flash("Start time updated!");
    });
  }

  function handleDelete() {
    if (!confirm("Remove team song?")) return;
    setError(null);
    startTransition(async () => {
      const result = await deleteSong(teamId);
      if (!result.success) setError(result.error);
      else {
        setSongUrl(null);
        setStartSecs(0);
        setShowUpload(true);
        previewRef.current = null;
        flash("Song removed.");
      }
    });
  }

  // Non-admins can only see the read-only state
  if (!isAdmin) {
    return (
      <div className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
        <h2 className="mb-1 text-base font-semibold text-gray-900">Team song</h2>
        {songUrl ? (
          <p className="text-sm text-gray-500">
            A team song is configured (start: {formatSeconds(startSecs)}).
          </p>
        ) : (
          <p className="text-sm text-gray-400">No team song set up yet.</p>
        )}
        <p className="mt-2 text-xs text-gray-400">Only admins can change the song.</p>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
      <div className="mb-4 flex items-start justify-between">
        <div>
          <h2 className="text-base font-semibold text-gray-900">Team song</h2>
          <p className="mt-0.5 text-sm text-gray-500">
            Plays for 15 seconds from the start point whenever a goal is scored.
          </p>
        </div>
        {/* Musical note emoji */}
        <span className="text-2xl" aria-hidden>🎵</span>
      </div>

      {error && (
        <p className="mb-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">
          {error}
        </p>
      )}
      {success && (
        <p className="mb-3 rounded-md bg-green-50 px-3 py-2 text-sm text-green-700" role="status">
          {success}
        </p>
      )}

      {/* ── Start time (shared between upload and update forms) ── */}
      <div className="mb-4">
        <label className="mb-1 block text-sm font-medium text-gray-700">
          Start playback at
        </label>
        <div className="flex items-center gap-3">
          <input
            type="number"
            min={0}
            max={3600}
            value={startSecs}
            onChange={(e) => setStartSecs(Math.max(0, parseInt(e.target.value) || 0))}
            className="w-24 rounded-md border border-gray-300 px-3 py-1.5 text-sm shadow-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
            aria-label="Start seconds"
          />
          <span className="text-sm text-gray-500">{formatSeconds(startSecs)}</span>
          {songUrl && (
            <button
              type="button"
              onClick={handlePreview}
              className="inline-flex items-center gap-1 rounded-md border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50"
            >
              {previewPlaying ? "⏹ Stop" : "▶ Preview 15s"}
            </button>
          )}
        </div>
        <p className="mt-1 text-xs text-gray-400">
          Seconds into the song to start playing from (e.g. the chorus).
        </p>
      </div>

      {/* ── Existing song ── */}
      {songUrl && !showUpload && (
        <div className="space-y-3">
          <div className="flex items-center gap-2 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2.5">
            <span className="text-lg" aria-hidden>🎶</span>
            <span className="flex-1 truncate text-sm font-medium text-gray-700">
              Song loaded
            </span>
            <a
              href={songUrl}
              target="_blank"
              rel="noreferrer"
              className="text-xs text-brand-600 hover:underline"
            >
              Open ↗
            </a>
          </div>
          {/* Update start time */}
          <form onSubmit={handleUpdateStart} className="flex gap-2">
            <button
              type="submit"
              disabled={isPending}
              className="rounded-md bg-brand-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-brand-700 disabled:opacity-60"
            >
              {isPending ? "Saving…" : "Save start time"}
            </button>
            <button
              type="button"
              onClick={() => setShowUpload(true)}
              className="rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50"
            >
              Replace file
            </button>
            <button
              type="button"
              onClick={handleDelete}
              disabled={isPending}
              className="ml-auto rounded-md px-3 py-2 text-sm font-medium text-red-600 transition-colors hover:bg-red-50 disabled:opacity-60"
            >
              Remove
            </button>
          </form>
        </div>
      )}

      {/* ── Upload form ── */}
      {(!songUrl || showUpload) && (
        <form onSubmit={handleUpload} className="space-y-3">
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">
              Audio file
              <span className="ml-1 font-normal text-gray-400">(MP3, M4A, AAC, WAV, OGG — max 20 MB)</span>
            </label>
            <input
              ref={fileRef}
              name="song"
              type="file"
              accept="audio/*"
              required
              className="block w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-700 file:mr-3 file:rounded file:border-0 file:bg-brand-50 file:px-3 file:py-1 file:text-sm file:font-medium file:text-brand-700 hover:file:bg-brand-100"
            />
          </div>
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={isPending}
              className="rounded-md bg-brand-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-brand-700 disabled:opacity-60"
            >
              {isPending ? "Uploading…" : "Upload song"}
            </button>
            {songUrl && showUpload && (
              <button
                type="button"
                onClick={() => setShowUpload(false)}
                className="rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50"
              >
                Cancel
              </button>
            )}
          </div>
        </form>
      )}
    </div>
  );
}
