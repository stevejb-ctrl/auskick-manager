"use client";

// ─── RoleHandoverCard ────────────────────────────────────────
// One kid holds a role for a period and hands it on at the break:
// league's First Receiver and Dummy Half vests, soccer's keeper top.
// The card is the shared picture of that handover. Each sport keeps
// its own rules (who may take the role, what the server records) and
// passes the card rows: the current holder with a Replace button, or
// an open picker of candidates.
//
// Extracted from league's VestAssignmentCard (CLAUDE.md: reuse before
// you fork) so soccer's keeper card reads like league's vest card.

import type { ReactNode } from "react";
import { SFButton, Guernsey } from "@/components/sf";
import { InlineAlert } from "@/components/ui/InlineAlert";
import type { Player } from "@/lib/types";

export interface HandoverCandidate {
  player: Player;
  /** The sport's suggestion for this role: marked on the button. */
  suggested?: boolean;
}

export interface HandoverRow {
  /** Stable key for the row (e.g. "fr", "dh", "gk"). */
  key: string;
  /** The role's badge, drawn beside the holder or the picker heading. */
  badge: ReactNode;
  /**
   * The current holder, shown with a Replace button. Null, or
   * `picking`, opens the picker instead.
   */
  holder: Player | null;
  /** The picker is open (no holder yet, Replace tapped, or the holder can't take it). */
  picking: boolean;
  /** Picker heading, e.g. "Assign First Receiver for half 2". */
  heading: string;
  /** Optional line under the heading, e.g. why the picker opened. */
  note?: string | null;
  /** Shown in place of the candidates when there are none. */
  emptyText: string;
  candidates: HandoverCandidate[];
  /** A pick for this row is saving: its buttons disable. */
  pending: boolean;
  /** Replace on the holder row. Omit to hide the button. */
  onReplace?: () => void;
  /** Cancel in the picker. Omit to hide the button. */
  onCancel?: () => void;
  onPick: (playerId: string) => void;
}

interface RoleHandoverCardProps {
  /** Accessible name for the card (e.g. "Vest assignment"). */
  ariaLabel: string;
  /** Small uppercase title (e.g. "Vests", "Keeper"). */
  title: string;
  /** The rule in a line (e.g. "Rotate each half — …"). */
  subtitle: string;
  error?: string | null;
  rows: HandoverRow[];
  /**
   * Inside a sheet that carries the title: no card of its own, the rule
   * as a plain line, and names that wrap rather than cut off.
   */
  bare?: boolean;
}

export function RoleHandoverCard({ ariaLabel, title, subtitle, error, rows, bare = false }: RoleHandoverCardProps) {
  return (
    <section
      aria-label={ariaLabel}
      className={bare ? "space-y-3" : "space-y-3 rounded-xl border border-hairline bg-surface p-3 shadow-card"}
    >
      {bare ? (
        <p className="text-xs text-ink-dim">{subtitle}</p>
      ) : (
        <header className="px-1">
          <h2 className="text-xs font-bold uppercase tracking-wide text-ink-dim">
            {title}
          </h2>
          <p className="text-xs text-ink-mute">{subtitle}</p>
        </header>
      )}
      {error && <InlineAlert kind="danger">{error}</InlineAlert>}
      {rows.map((row) => (
        <HandoverRowView key={row.key} row={row} wrapNames={bare} />
      ))}
    </section>
  );
}

function HandoverRowView({ row, wrapNames = false }: { row: HandoverRow; wrapNames?: boolean }) {
  if (row.holder && !row.picking) {
    return (
      <div className="flex items-center justify-between rounded-lg border border-hairline bg-surface px-3 py-2.5">
        <div className="flex items-center gap-2">
          {row.badge}
          <span className="text-sm font-medium text-ink">
            {row.holder.full_name}
          </span>
        </div>
        {row.onReplace && (
          <SFButton
            size="sm"
            variant="ghost"
            onClick={row.onReplace}
            disabled={row.pending}
          >
            Replace
          </SFButton>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-2 rounded-lg border border-brand-500/30 bg-brand-50 p-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {row.badge}
          <span className="text-sm font-semibold text-ink">{row.heading}</span>
        </div>
        {row.onCancel && (
          <SFButton
            size="sm"
            variant="ghost"
            onClick={row.onCancel}
            disabled={row.pending}
          >
            Cancel
          </SFButton>
        )}
      </div>
      {row.note && <p className="text-xs text-ink-dim">{row.note}</p>}

      {row.candidates.length === 0 ? (
        <p className="text-xs text-ink-mute">{row.emptyText}</p>
      ) : (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {row.candidates.map(({ player: p, suggested }) => (
            <button
              key={p.id}
              type="button"
              disabled={row.pending}
              onClick={() => row.onPick(p.id)}
              className={`flex items-center gap-2 rounded-lg border bg-surface px-2.5 py-2 text-left text-sm transition-colors hover:border-brand-600 active:scale-[0.97] disabled:opacity-50 ${
                suggested ? "border-brand-600" : "border-hairline"
              }`}
            >
              <Guernsey
                num={p.jersey_number != null ? String(p.jersey_number) : ""}
                size={26}
              />
              <span className={`min-w-0 flex-1 text-ink ${wrapNames ? "break-words" : "truncate"}`}>
                {p.full_name}
              </span>
              {suggested && (
                <span className="shrink-0 font-mono text-[10px] font-semibold uppercase tracking-micro text-brand-600">
                  Pick
                </span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
