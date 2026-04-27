interface Score {
  goals: number;
  behinds: number;
}

interface ScoreBlockProps {
  score: Score;
  /** Bigger treatment for hero scoreboards. Default false. */
  emphasize?: boolean;
  /** Colour override — applied to the goals digit. Behinds always render in ink-dim. */
  className?: string;
}

function totalPoints(s: Score): number {
  return s.goals * 6 + s.behinds;
}

/**
 * Score numerals in the Field-Sunday treatment:
 *
 *   5 . 3
 *   ─────
 *   33 PTS
 *
 * Goals dominant, behinds in `ink-dim`, total points beneath as a
 * mono caption. Used on the Live banner, the Last-result card, and
 * the Game-detail final hero.
 */
export function ScoreBlock({ score, emphasize = false, className = "" }: ScoreBlockProps) {
  const pts = totalPoints(score);
  return (
    <div className={`inline-flex flex-col items-center font-mono leading-none text-ink ${className}`}>
      <div
        className="flex items-baseline font-bold"
        style={{ gap: emphasize ? 6 : 4, fontSize: emphasize ? 32 : 22 }}
      >
        <span>{score.goals}</span>
        <span
          className="font-medium text-ink-mute"
          style={{ fontSize: emphasize ? 22 : 16 }}
        >
          ·
        </span>
        <span className="text-ink-dim">{score.behinds}</span>
      </div>
      <div
        className="mt-1 font-semibold tracking-[0.06em] text-ink-dim"
        style={{ fontSize: emphasize ? 13 : 11 }}
      >
        {pts} PTS
      </div>
    </div>
  );
}
