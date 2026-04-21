"use client";

import { useRef, useState, useTransition } from "react";
import {
  saveSong,
  saveSongUrl,
  updateSongTiming,
  deleteSong,
} from "@/app/(app)/teams/[teamId]/settings/actions";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Label } from "@/components/ui/Label";
import { isYouTubeUrl, youtubeVideoId } from "@/lib/songUrl";

interface TeamSongSettingsProps {
  teamId: string;
  currentSongUrl: string | null;
  currentStartSeconds: number;
  currentDurationSeconds: number;
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
  currentDurationSeconds,
  isAdmin,
}: TeamSongSettingsProps) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [songUrl, setSongUrl] = useState<string | null>(currentSongUrl);
  const [startSecs, setStartSecs] = useState(currentStartSeconds);
  const [durationSecs, setDurationSecs] = useState(currentDurationSeconds);

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
    }, durationSecs * 1000);
  }

  // ── Save URL form ─────────────────────────────────────────────────────────

  function handleSaveUrl(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const trimmed = urlInput.trim();
    if (!trimmed) return;
    startTransition(async () => {
      const result = await saveSongUrl(teamId, trimmed, startSecs, durationSecs);
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
    fd.set("duration_seconds", String(durationSecs));
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

  // ── Update timing only (start + duration, no re-upload) ──────────────────

  function handleUpdateTiming(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await updateSongTiming(teamId, startSecs, durationSecs);
      if (!result.success) setError(result.error ?? null);
      else flash("Timing updated!");
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
      <div className="rounded-lg border border-hairline bg-surface p-5 shadow-card">
        <h2 className="mb-1 text-base font-semibold text-ink">Team song</h2>
        {songUrl ? (
          <p className="text-sm text-ink-dim">
            A team song is configured (start: {formatSeconds(startSecs)}, plays for {durationSecs}s).
          </p>
        ) : (
          <p className="text-sm text-ink-mute">No team song set up yet.</p>
        )}
        <p className="mt-2 text-xs text-ink-mute">Only admins can change the song.</p>
      </div>
    );
  }

  const ytVideoId = songUrl ? youtubeVideoId(songUrl) : null;

  return (
    <div className="rounded-lg border border-hairline bg-surface p-5 shadow-card">
      <div className="mb-4 flex items-start justify-between">
        <div>
          <h2 className="text-base font-semibold text-ink">Team song</h2>
          <p className="mt-0.5 text-sm text-ink-dim">
            Plays for {durationSecs} seconds from the start point whenever a goal is scored.
          </p>
        </div>
        <span className="text-2xl" aria-hidden>🎵</span>
      </div>

      {error && (
        <p className="mb-3 rounded-md bg-danger/10 px-3 py-2 text-sm text-danger" role="alert">
          {error}
        </p>
      )}
      {success && (
        <p className="mb-3 rounded-md bg-ok/10 px-3 py-2 text-sm text-ok" role="status">
          {success}
        </p>
      )}

      {/* ── Primary: URL input ─────────────────────────────────────────── */}
      <form onSubmit={handleSaveUrl} className="space-y-3">
        <div className="space-y-1">
          <Label htmlFor="song-url">Song URL</Label>
          <Input
            id="song-url"
            type="url"
            value={urlInput}
            onChange={(e) => setUrlInput(e.target.value)}
            placeholder="https://www.youtube.com/watch?v=… or direct audio URL"
          />
          <p className="mt-1 text-xs text-ink-mute">
            Paste a YouTube link or a direct audio URL (https only).
          </p>
        </div>

        {/* Start time */}
        <div className="space-y-1">
          <Label htmlFor="song-start">Start playback at</Label>
          <div className="flex items-center gap-3">
            <div className="w-24">
              <Input
                id="song-start"
                type="number"
                min={0}
                max={3600}
                value={startSecs}
                onChange={(e) =>
                  setStartSecs(Math.max(0, parseInt(e.target.value) || 0))
                }
                aria-label="Start seconds"
              />
            </div>
            <span className="text-sm text-ink-dim tabular-nums">
              {formatSeconds(startSecs)}
            </span>
            {songUrl && (
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={handlePreview}
              >
                {isCurrentYouTube
                  ? showYtPreview
                    ? "⏹ Hide preview"
                    : "▶ Preview"
                  : previewPlaying
                    ? "⏹ Stop"
                    : `▶ Preview ${durationSecs}s`}
              </Button>
            )}
          </div>
          <p className="mt-1 text-xs text-ink-mute">
            Seconds into the song to start playing from (e.g. the chorus).
          </p>
        </div>

        {/* Play duration */}
        <div className="space-y-1">
          <Label htmlFor="song-duration">Play for how long</Label>
          <div className="flex items-center gap-3">
            <div className="w-24">
              <Input
                id="song-duration"
                type="number"
                min={5}
                max={120}
                step={5}
                value={durationSecs}
                onChange={(e) =>
                  setDurationSecs(
                    Math.min(120, Math.max(5, parseInt(e.target.value) || 15))
                  )
                }
                aria-label="Duration seconds"
              />
            </div>
            <span className="text-sm text-ink-dim tabular-nums">
              {durationSecs} seconds
            </span>
          </div>
          <p className="mt-1 text-xs text-ink-mute">
            How many seconds of the song to play after each goal (5–120 s).
          </p>
        </div>

        {/* YouTube inline preview */}
        {showYtPreview && ytVideoId && (
          <div className="overflow-hidden rounded-md border border-hairline">
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
          <Button
            type="submit"
            loading={isPending}
            disabled={!urlInput.trim()}
            size="md"
          >
            Save song
          </Button>
          {songUrl && (
            <>
              <form onSubmit={handleUpdateTiming}>
                <Button
                  type="submit"
                  variant="secondary"
                  loading={isPending}
                  size="md"
                >
                  Save timing only
                </Button>
              </form>
              <Button
                type="button"
                variant="ghost"
                size="md"
                onClick={handleDelete}
                disabled={isPending}
                className="ml-auto text-danger hover:bg-danger/10 hover:text-danger"
              >
                Remove
              </Button>
            </>
          )}
        </div>
      </form>

      {/* ── Secondary: file upload (collapsible) ───────────────────────── */}
      <div className="mt-5 border-t border-hairline pt-4">
        <button
          type="button"
          onClick={() => setShowUpload((v) => !v)}
          className="flex items-center gap-1 text-sm font-medium text-ink-dim transition-colors duration-fast ease-out-quart hover:text-ink"
        >
          <span
            className={`inline-block transition-transform duration-fast ease-out-quart ${
              showUpload ? "rotate-90" : ""
            }`}
          >
            ▶
          </span>
          Or upload an audio file
        </button>

        {showUpload && (
          <form onSubmit={handleUpload} className="mt-3 space-y-3">
            <div className="space-y-1">
              <Label htmlFor="song-file">
                Audio file
                <span className="ml-1 font-normal text-ink-mute">
                  (MP3, M4A, AAC, WAV, OGG — max 20 MB)
                </span>
              </Label>
              <input
                ref={fileRef}
                id="song-file"
                name="song"
                type="file"
                accept="audio/*"
                required
                className="block w-full rounded-md border border-hairline bg-surface px-3 py-2 text-sm text-ink shadow-card file:mr-3 file:rounded file:border-0 file:bg-brand-50 file:px-3 file:py-1 file:text-sm file:font-medium file:text-brand-700 hover:file:bg-brand-100"
              />
            </div>
            <div className="flex gap-2">
              <Button type="submit" loading={isPending} size="md">
                Upload song
              </Button>
              <Button
                type="button"
                variant="secondary"
                size="md"
                onClick={() => setShowUpload(false)}
              >
                Cancel
              </Button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
