import type { ReactNode } from "react";

type Tone = "neutral" | "ok" | "warn" | "live" | "info" | "danger";

interface PillProps {
  tone?: Tone;
  children: ReactNode;
  className?: string;
}

const TONE_CLASSES: Record<Tone, string> = {
  neutral: "bg-surface-alt text-ink",
  ok: "bg-brand-50 text-brand-700",
  warn: "bg-warn-soft text-warn",
  live: "bg-alarm-soft text-alarm",
  info: "bg-surface-alt text-ink-dim border border-hairline",
  danger: "bg-loss-soft text-loss",
};

/**
 * Generic uppercase mono status pill. For game-status specifically use
 * `StatusPill` which encodes the live / upcoming / final tones and the
 * pulsing dot. Use this for arbitrary chips ("PARENT", "ADMIN", "Q3").
 */
export function Pill({ tone = "neutral", children, className = "" }: PillProps) {
  return (
    <span
      className={`
        inline-flex items-center rounded-full px-2.5 py-1
        font-mono text-[11px] font-bold uppercase tracking-[0.1em]
        ${TONE_CLASSES[tone]}
        ${className}
      `}
    >
      {children}
    </span>
  );
}
