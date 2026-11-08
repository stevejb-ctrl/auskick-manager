"use client";

// ─── InfoLine ────────────────────────────────────────────────
// Live v3's one line about the next sub, between the score and the field
// (Steve, 8 Nov 2026). It's where the countdown lives: the kids just say
// "Off next" / "On next", and this says when.
//
//   Next sub 2:10 · 3 swaps                    ›   Plan Q3
//   ◯ Sub due — 3 swaps · rotate a player off  ›             (hi-vis ring)
//
// Plain text on the chalk. The ring shows only when the sub is close (the
// last 30 s) or due; due, the ring goes hi-vis and the line is a
// screen-reader alert. Tap it for the pairs (PairsSheet). The Plan Q{n+1}
// chip sits at the right end when the next period can be planned.
//
// Sport-agnostic: the sport says how far off the sub is and how many
// swaps; `periodWord` names its periods ("quarter", "half").

import type { ReactNode } from "react";

export type InfoLineState = "idle" | "soft" | "due";

export interface InfoLineProps {
  state: InfoLineState;
  /** ms to the next sub; null when it isn't counting (no subs left this period). */
  msUntilDue: number | null;
  subIntervalMs: number;
  /** Planned swaps. */
  swaps: number;
  /** Kids at risk of the game-time minimum (" · 3 under 50%"). */
  under?: { count: number; minPct: number } | null;
  /** The period's last sub, pinned, falls past the siren: make it now or it carries. */
  carry?: boolean;
  /** "quarter", "half". */
  periodWord?: string;
  /** Nobody can come on (everyone on the bench is hurt or lent). */
  noBench?: boolean;
  /** Opens the pairs; omitted when there are none. */
  onOpen?: () => void;
  /** The Plan Q{n+1} chip, at the right. */
  plan?: ReactNode;
  /**
   * Plain words in place of the countdown, where subs don't roll on a
   * clock: netball's "Subs at the break · tap GS or GA to score". Not
   * a button. A due sub still says so over it.
   */
  hint?: ReactNode;
  /**
   * Words after the countdown in its last 30 s: basketball's "send them
   * to the table", touch's "make the change next time you have the ball".
   */
  softHint?: string;
  /**
   * What to do when the sub is due, in the sport's words, in place of
   * "rotate a player off": basketball's "send them to the table now".
   */
  dueHint?: string;
}

function mmss(ms: number): string {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? "" : "s"}`;

/** The countdown ring: an oval arc on a faint track, hi-vis round when due. */
function Ring({ progress, hot }: { progress: number; hot: boolean }) {
  const p = Math.max(0, Math.min(100, Math.round(progress * 100)));
  return (
    <span
      aria-hidden
      className="relative h-[18px] w-[18px] flex-none rounded-full"
      style={{
        background: hot ? "rgb(var(--c-hivis))" : `conic-gradient(rgb(var(--c-brand-600)) ${p}%, rgb(var(--l-hairline)) 0)`,
      }}
    >
      <span className="absolute inset-[4px] rounded-full bg-warm" />
    </span>
  );
}

const LINE = "flex min-h-[44px] min-w-0 flex-1 items-center gap-[7px] rounded-[12px] px-[2px] text-left text-[0.8125rem] text-ink-dim";
const CHEV = <span aria-hidden className="flex-none font-display text-[1.125rem] font-black text-ink-mute">›</span>;

export function InfoLine({
  state,
  msUntilDue,
  subIntervalMs,
  swaps,
  under = null,
  carry = false,
  periodWord = "quarter",
  noBench = false,
  onOpen,
  plan,
  hint,
  softHint,
  dueHint,
}: InfoLineProps) {
  const underText = under && under.count > 0 ? (
    <>
      {" · "}
      <b className="font-bold text-ink">{under.count}</b> under {under.minPct}%
    </>
  ) : null;

  let body: ReactNode;
  if (state === "due") {
    const text = (
      <>
        <Ring progress={1} hot />
        <span className="min-w-0 flex-1 truncate">
          <b className="font-bold text-ink">{swaps > 0 ? `Sub due — ${plural(swaps, "swap")}` : "Sub due"}</b>
          {carry ? ` · ${periodWord} ending: make now or it carries to the break` : ` · ${dueHint ?? "rotate a player off"}`}
        </span>
      </>
    );
    // Due: the line is an alert. It mounts as one, so it's announced once.
    body = (
      <div role="alert" className="flex min-w-0 flex-1">
        {onOpen && swaps > 0 ? (
          <button type="button" data-testid="info-line" onClick={onOpen} className={LINE}>
            {text}
            {CHEV}
          </button>
        ) : (
          <p data-testid="info-line" className={LINE}>
            {text}
          </p>
        )}
      </div>
    );
  } else if (hint) {
    body = (
      <p data-testid="info-line" className={LINE}>
        <span className="min-w-0 flex-1 truncate">{hint}</span>
      </p>
    );
  } else if (noBench) {
    body = (
      <p data-testid="info-line" className={LINE}>
        <span className="min-w-0 flex-1 truncate">Nobody on the bench can come on: no subs to make</span>
      </p>
    );
  } else if (msUntilDue !== null && swaps > 0 && onOpen) {
    const soft = state === "soft";
    body = (
      <button
        type="button"
        data-testid="info-line"
        onClick={onOpen}
        aria-label={`Next sub in ${mmss(msUntilDue)}, ${plural(swaps, "swap")}${under && under.count > 0 ? `, ${under.count} under ${under.minPct}%` : ""}. Open the pairs.`}
        className={LINE}
      >
        {soft && <Ring progress={subIntervalMs > 0 ? 1 - msUntilDue / subIntervalMs : 0} hot={false} />}
        <span className="min-w-0 flex-1 truncate">
          Next sub <b className="nums font-bold text-ink tabular-nums">{mmss(msUntilDue)}</b> · {plural(swaps, "swap")}
          {underText}
          {soft && softHint ? ` · ${softHint}` : null}
        </span>
        {CHEV}
      </button>
    );
  } else if (swaps > 0 && onOpen) {
    // A pinned sub with no countdown (it carries past the siren).
    body = (
      <button type="button" data-testid="info-line" onClick={onOpen} className={LINE}>
        <span className="min-w-0 flex-1 truncate">
          <b className="font-bold text-ink">{plural(swaps, "swap")} planned</b>
          {carry ? ` · make now or it carries to the break` : ""}
          {underText}
        </span>
        {CHEV}
      </button>
    );
  } else {
    body = (
      <p data-testid="info-line" className={LINE}>
        <span className="min-w-0 flex-1 truncate">No more subs this {periodWord}{underText}</span>
      </p>
    );
  }

  return (
    <div className="flex min-w-0 items-center gap-[4px] px-[4px]">
      {body}
      {plan}
    </div>
  );
}
