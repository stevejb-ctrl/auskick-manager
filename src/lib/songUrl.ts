/**
 * Helpers for handling team song URLs — YouTube links and direct audio URLs.
 */

/**
 * Extract the YouTube video ID from a YouTube URL, or return null if the URL
 * is not a recognised YouTube link.
 *
 * Supports:
 *   https://www.youtube.com/watch?v=XXXXXXXXXXX
 *   https://youtube.com/watch?v=XXXXXXXXXXX
 *   https://youtu.be/XXXXXXXXXXX
 *   URLs with extra query params (e.g. &t=30)
 */
export function youtubeVideoId(url: string): string | null {
  const m = url.match(
    /(?:youtube\.com\/watch\?(?:.*&)?v=|youtu\.be\/)([a-zA-Z0-9_-]{11})/
  );
  return m ? m[1] : null;
}

/** Returns true if the URL is a YouTube watch / short-link URL. */
export function isYouTubeUrl(url: string): boolean {
  return youtubeVideoId(url) !== null;
}
