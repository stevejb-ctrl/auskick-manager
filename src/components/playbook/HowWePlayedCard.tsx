import type { GameReport } from "@/lib/playbook/gameReport";

const ICON = { ok: "✓", warn: "⚠", fail: "✕" } as const;
const TONE = { ok: "text-ok", warn: "text-warn", fail: "text-danger" } as const;

/**
 * How we played (UX plan 4.4): the game against the rules it kicked
 * off with — "Rules kept" or which were missed — and the season-balance
 * line. Shared by every sport's game summary.
 */
export function HowWePlayedCard({ report }: { report: GameReport }) {
  const missed = report.items.filter((i) => i.status !== "ok");
  return (
    <section aria-labelledby="how-we-played" className="space-y-2" data-testid="how-we-played">
      <h3 id="how-we-played" className="font-mono text-[11px] font-bold uppercase tracking-micro text-ink-dim">
        How we played
      </h3>
      <p className="text-sm font-semibold text-ink">
        {missed.length === 0 ? (
          <>
            <span aria-hidden className="text-ok">✓</span> Rules kept
          </>
        ) : (
          <>
            <span aria-hidden className="text-warn">⚠</span> {missed.length} rule{missed.length === 1 ? "" : "s"} missed
          </>
        )}
      </p>
      <ul className="space-y-1">
        {report.items.map((i) => (
          <li key={i.id} className="flex gap-2 text-sm">
            <span aria-hidden className={`font-bold ${TONE[i.status]}`}>
              {ICON[i.status]}
            </span>
            <span className={`min-w-0 break-words [overflow-wrap:anywhere] ${i.status === "ok" ? "text-ink-dim" : "text-ink"}`}>{i.text}</span>
          </li>
        ))}
      </ul>
      {report.seasonLine && <p className="break-words text-sm text-ink-dim [overflow-wrap:anywhere]">{report.seasonLine}</p>}
    </section>
  );
}
