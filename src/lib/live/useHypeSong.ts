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
import {
  reduceSongArm,
  type SongArmEvent,
  type SongArmState,
} from "@/lib/live/hypeSongController";

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

  // AUDIO-01 / B3: track whether the audio session is armed. iOS suspends the
  // session on backgrounding / period transitions; without re-arming, the song
  // plays in Q1 then goes silent. The pure `reduceSongArm` controller decides
  // what to do; this ref holds the state across renders.
  const armStateRef = useRef<SongArmState>("idle");
  function dispatchArm(event: SongArmEvent) {
    const result = reduceSongArm(armStateRef.current, event);
    armStateRef.current = result.state;
    return result.action;
  }

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
            dispatchArm("ready");
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

  // AUDIO-01 / B3: the missing re-arm trigger. iOS suspends the audio session
  // when the page is backgrounded (and around period transitions); the song
  // effect above only tears down on gameId/songUrl/hydrated change, so nothing
  // re-arms the suspended element/context. Mirror the sub-due beep, which
  // already re-attempts `ctx.resume()` when the context drifts back to
  // suspended (LiveGame.tsx). On the way back to the foreground we re-arm
  // eagerly — but never auto-play. For the direct-audio fallback, re-arming =
  // dropping the suspended element so the next play builds a fresh one inside
  // the gesture. The YT iframe can't be silently re-armed, so it's woken at
  // the next goal (rearm-then-play in playSong) rather than here.
  useEffect(() => {
    if (typeof document === "undefined") return;
    function onVisibility() {
      const event: SongArmEvent = document.hidden ? "hidden" : "visible";
      const action = dispatchArm(event);
      if (action === "rearm" && songUrl && !isYouTubeUrl(songUrl)) {
        songAudioRef.current = null;
      }
    }
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [songUrl]);

  function playSong() {
    if (!songUrl) return;
    // Decide whether to play as-is or re-arm first (the session may have been
    // suspended since the last goal). A `play` while suspended returns
    // `rearm-then-play` rather than no-op'ing — this is the post-Q1-on-iOS fix.
    const action = dispatchArm("play");
    const needsRearm = action === "rearm-then-play";
    try {
      if (songTimerRef.current !== null) {
        clearTimeout(songTimerRef.current);
        songTimerRef.current = null;
      }
      if (isYouTubeUrl(songUrl)) {
        if (!ytReadyRef.current || !ytPlayerRef.current) return;
        // seekTo + playVideo also wakes a suspended iframe, so the re-arm for
        // YT is the play itself. There is no play() promise here, so treat a
        // successful call as success and rely on `visibilitychange` to flag a
        // later suspension.
        ytPlayerRef.current.seekTo(songStartSeconds, true);
        ytPlayerRef.current.playVideo();
        dispatchArm("playSucceeded");
        songTimerRef.current = setTimeout(() => {
          ytPlayerRef.current?.pauseVideo();
          songTimerRef.current = null;
        }, songDurationSeconds * 1000);
      } else {
        // Direct-audio fallback. On re-arm, drop the (suspended) element so the
        // next line builds a fresh one inside this gesture.
        if (needsRearm) songAudioRef.current = null;
        const audio = songAudioRef.current ?? new Audio(songUrl);
        songAudioRef.current = audio;
        audio.currentTime = songStartSeconds;
        audio
          .play()
          .then(() => dispatchArm("playSucceeded"))
          .catch((err) => {
            // Surface (no longer swallow): a rejected play means the audio
            // session is suspended — flag it so the next goal re-arms.
            dispatchArm("playFailed");
            if (process.env.NODE_ENV !== "production") {
              console.warn(
                "[useHypeSong] play rejected (audio session likely suspended) — will re-arm on the next goal",
                err,
              );
            }
          });
        songTimerRef.current = setTimeout(() => {
          audio.pause();
          songTimerRef.current = null;
        }, songDurationSeconds * 1000);
      }
    } catch (err) {
      // Surface synchronous audio-API errors instead of swallowing them, and
      // flag the session for re-arming on the next goal.
      dispatchArm("playFailed");
      if (process.env.NODE_ENV !== "production") {
        console.warn("[useHypeSong] playSong threw — flagging for re-arm", err);
      }
    }
  }

  return { containerRef, playSong };
}
