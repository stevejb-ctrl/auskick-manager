"use client";

import { useRef, useState, useTransition } from "react";
import {
  saveSong,
  saveSongUrl,
  updateSongStart,
  deleteSong,
} from "@/app/(app)/teams/[teamId]/settings/actions";
import { isYouTubeUrl, youtubeVideoId } from "@/lib/songUrl";

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

  // URL input form state
  const [urlInput, setUrlInput] = useState(currentSongUrl ?? "");

  // File upload section
  const [showUpload, setShowUpload] = useState(false);
  const fileRef = useRef<HTMLInputElement | null>(null);

  // YouTube preview toggle
  const [showYtPreview, setShowYtPreview] = useState(false);

  // HTML5 Audio preview
  const previewRef = useRef<HTMLAudioElement | null>(null);
  const [previewPlaying, setPreviewPlaying] = useState(false);

  function flash(msg: string) {
    setSuccess(msg);
    setTimeout(() => setSuccess(null), 3000);
  }

  const isCurrentYouTube = songUrl ? isYouTubeUrl(songUrl) : false;

  // ── Preview ──────────────────────────────────────────────────────────────

  function handlePreview() {
    if (!songUrl) return;
    if (isCurrentYouTube) {
      setShowYtPreview((v) => !v);
      return;
    }
    // HTML5 Audio preview
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
    }, 15_000);
  }

  // ── Save URL form ─────────────────────────────────────────────────────────

  function handleSaveUrl(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const trimmed = urlInput.trim();
    if (!trimmed) return;
    startTransition(async () => {
      const result = await saveSongUrl(teamId, trimmed, startSecs);
      if (!result.success) {
        setError(result.error ?? null);
      } else {
        setSongUrl(result.song_url ?? trimmed);
        setShowYtPreview(false);
        previewRef.current = null;
        flash("Song saved!");
      }
    });
  }

  // ── Upload form ───────────────────────────────────────────────────────────

  function handleUpload(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const fd = new FormData(e.currentTarget);
    fd.set("start_seconds", String(startSecs));
    startTransition(async () => {
      const result = await saveSong(teamId, fd);
      if (!result.success) {
        setError(result.error ?? null);
      } else {
        const newUrl = result.song_url ?? null;
        setSongUrl(newUrl);
        setUrlInput(newUrl ?? "");
        setShowUpload(false);
        previewRef.current = null;
        flash("Song saved!");
      }
    });
  }

  // ── Update start time only ────────────────────────────────────────────────

  function handleUpdateStart(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await updateSongStart(teamId, startSecs);
      if (!result.success) setError(result.error ?? null);
      else flash("Start time updated!");
    });
  }

  // ── Delete ────────────────────────────────────────────────────────────────

  function handleDelete() {
    if (!confirm("Remove team song?")) return;
    setError(null);
    startTransition(async () => {
      const result = await deleteSong(teamId);
      if (!result.success) {
        setError(result.error ?? null);
      } else {
        setSongUrl(null);
        setUrlInput("");
        setStartSecs(0);
        setShowUpload(false);
        setShowYtPreview(false);
        previewRef.current = null;
        flash("Song removed.");
      }
    });
  }

  // ── Non-admin read-only view ──────────────────────────────────────────────

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

  const ytVideoId = songUrl ? youtubeVideoId(songUrl) : null;

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
      <div className="mb-4 flex items-start justify-between">
        <div>
          <h2 className="text-base font-semibold text-gray-900">Team song</h2>
          <p className="mt-0.5 text-sm text-gray-500">
            Plays for 15 seconds from the start point whenever a goal is scored.
          </p>
        </div>
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

      {/* ── Primary: URL input ─────────────────────────────────────────── */}
      <form onSubmit={handleSaveUrl} className="space-y-3">
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">
            Song URL
          </label>
          <input
            type="url"
            value={urlInput}
            onChange={(e) => setUrlInput(e.target.value)}
            placeholder="https://www.youtube.com/watch?v=… or direct audio URL"
            className="block w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder-gray-400 shadow-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
          />
          <p className="mt-1 text-xs text-gray-400">
            Paste a YouTube link or a direct audio URL (https only).
          </p>
        </div>

        {/* Start time */}
        <div>
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
                {isCurrentYouTube
                  ? showYtPreview ? "⏹ Hide preview" : "▶ Preview"
                  : previewPlaying ? "⏹ Stop" : "▶ Preview 15s"}
              </button>
            )}
          </div>
          <p className="mt-1 text-xs text-gray-400">
            Seconds into the song to start playing from (e.g. the chorus).
          </p>
        </div>

        {/* YouTube inline preview */}
        {showYtPreview && ytVideoId && (
          <div className="overflow-hidden rounded-lg border border-gray-200">
            <iframe
              src={`https://www.youtube-nocookie.com/embed/${ytVideoId}?autoplay=1&start=${startSecs}&rel=0`}
              allow="autoplay; encrypted-media"
              allowFullScreen
              className="aspect-video w-full"
              title="Song preview"
            />
          </div>
        )}

        <div className="flex flex-wrap gap-2">
          <button
            type="submit"
            disabled={isPending || !urlInput.trim()}
            className="rounded-md bg-brand-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-brand-700 disabled:opacity-60"
          >
            {isPending ? "Saving…" : "Save song"}
          </button>
          {songUrl && (
            <>
              <form onSubmit={handleUpdateStart}>
                <button
                  type="submit"
                  disabled={isPending}
                  className="rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 disabled:opacity-60"
                >
                  {isPending ? "Saving…" : "Save start time only"}
                </button>
              </form>
              <button
                type="button"
                onClick={handleDelete}
                disabled={isPending}
                className="ml-auto rounded-md px-3 py-2 text-sm font-medium text-red-600 transition-colors hover:bg-red-50 disabled:opacity-60"
              >
                Remove
              </button>
            </>
          )}
        </div>
      </form>

      {/* ── Secondary: file upload (collapsible) ───────────────────────── */}
      <div className="mt-5 border-t border-gray-100 pt-4">
        <button
          type="button"
          onClick={() => setShowUpload((v) => !v)}
          className="flex items-center gap-1 text-sm font-medium text-gray-500 hover:text-gray-700"
        >
          <span className={`inline-block transition-transform ${showUpload ? "rotate-90" : ""}`}>▶</span>
          Or upload an audio file
        </button>

        {showUpload && (
          <form onSubmit={handleUpload} className="mt-3 space-y-3">
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
              <button
                type="button"
                onClick={() => setShowUpload(false)}
                className="rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50"
              >
                Cancel
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
