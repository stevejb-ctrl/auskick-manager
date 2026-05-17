// ─── useHypeSong ──────────────────────────────────────────────
// Hype-song playback hook used by both AFL and netball live games.
//
// History: the YouTube IFrame embed + audio-fallback + playSong()
// trigger lived inline in `src/components/live/LiveGame.tsx` for
// most of the AFL build. Netball never had it — so a coach who
// configured `team.song_url` on a netball team got the same data
// stored but no playback. Stagehand audit (2026-05-16) flagged it
// as drift; this hook lifts the AFL implementation out unchanged
// so both sports can call it identically. Steve.
//
// Usage:
//   const { containerRef, playSong } = useHypeSong({
//     songUrl, songStartSeconds, songDurationSeconds,
//     hydrated, gameId,
//   });
//   // Render the hidden iframe container somewhere in the tree:
//   {songUrl && isYouTubeUrl(songUrl) && (
//     <div ref={containerRef} className="…hidden…" aria-hidden />
//   )}
//   // Call playSong() on goal commit (or whatever sirenic moment).
//
// Notes preserved verbatim from the AFL version:
//   - YT iframe is forced to 1×1 so it doesn't bleed page width
//   - Direct-audio fallback uses an <Audio> element with the same
//     start-offset + auto-pause-after-N-seconds rhythm
//   - Cleanup destroys the YT player on unmount / gameId change

"use client";

import { useEffect, useRef } from "react";
import { isYouTubeUrl, youtubeVideoId } from "@/lib/songUrl";

interface YTPlayer {
  seekTo(seconds: number, allowSeekAhead: boolean): void;
  playVideo(): void;
  pauseVideo(): void;
  destroy(): void;
}
declare global {
  interface Window {
    YT: { Player: new (el: string | HTMLElement, opts: object) => YTPlayer };
    onYouTubeIframeAPIReady: () => void;
  }
}

interface UseHypeSongArgs {
  songUrl: string | null | undefined;
  songStartSeconds: number;
  songDurationSeconds: number;
  /** Whether the live store has rehydrated (mirrors the existing AFL guard). */
  hydrated: boolean;
  /** Tear down + rebuild when the active game changes. */
  gameId: string;
}

export function useHypeSong({
  songUrl,
  songStartSeconds,
  songDurationSeconds,
  hydrated,
  gameId,
}: UseHypeSongArgs) {
  const songAudioRef = useRef<HTMLAudioElement | null>(null);
  const songTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const ytPlayerRef = useRef<YTPlayer | null>(null);
  const ytReadyRef = useRef(false);
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!hydrated || !songUrl || !isYouTubeUrl(songUrl)) return;
    const videoId = youtubeVideoId(songUrl);
    if (!videoId || !containerRef.current) return;

    const playerDiv = document.createElement("div");
    containerRef.current.appendChild(playerDiv);

    function createPlayer() {
      ytPlayerRef.current = new window.YT.Player(playerDiv, {
        // Force a 1×1 iframe — the YT API defaults to 640×360, which
        // otherwise bleeds past the viewport and inflates page scroll
        // area by ~125 px wide × 192 px tall.
        width: "1",
        height: "1",
        videoId,
        playerVars: { autoplay: 0, controls: 0, fs: 0, rel: 0, playsinline: 1 },
        events: {
          onReady: () => {
            ytReadyRef.current = true;
          },
        },
      });
    }

    if (window.YT?.Player) {
      createPlayer();
    } else {
      window.onYouTubeIframeAPIReady = createPlayer;
      if (
        !document.querySelector('script[src="https://www.youtube.com/iframe_api"]')
      ) {
        const tag = document.createElement("script");
        tag.src = "https://www.youtube.com/iframe_api";
        document.head.appendChild(tag);
      }
    }

    return () => {
      ytPlayerRef.current?.destroy();
      ytPlayerRef.current = null;
      ytReadyRef.current = false;
      playerDiv.remove();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [songUrl, gameId, hydrated]);

  function playSong() {
    if (!songUrl) return;
    try {
      if (songTimerRef.current !== null) {
        clearTimeout(songTimerRef.current);
        songTimerRef.current = null;
      }
      if (isYouTubeUrl(songUrl)) {
        if (!ytReadyRef.current || !ytPlayerRef.current) return;
        ytPlayerRef.current.seekTo(songStartSeconds, true);
        ytPlayerRef.current.playVideo();
        songTimerRef.current = setTimeout(() => {
          ytPlayerRef.current?.pauseVideo();
          songTimerRef.current = null;
        }, songDurationSeconds * 1000);
      } else {
        const audio = songAudioRef.current ?? new Audio(songUrl);
        songAudioRef.current = audio;
        audio.currentTime = songStartSeconds;
        audio.play().catch(() => {});
        songTimerRef.current = setTimeout(() => {
          audio.pause();
          songTimerRef.current = null;
        }, songDurationSeconds * 1000);
      }
    } catch {
      // ignore any audio API errors
    }
  }

  return { containerRef, playSong };
}
