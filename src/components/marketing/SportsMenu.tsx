"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";
import { SportFieldGlyph } from "@/components/marketing/SportFieldGlyph";
import { sportPageCopy } from "@/lib/marketing/sportPages";
import { SPORT_COUNT_WORD } from "@/lib/siren-facts";
import { MARKETING_SPORTS, sportPagePath } from "@/lib/sports/marketing-sports";

/**
 * The marketing header's Sports menu: a disclosure button that opens a
 * panel of every sport's page, in popularity order, each with its field
 * drawing and a few words on what Siren knows about it. Two columns of
 * five on wider screens, one list on a phone.
 *
 * Closes on Escape (focus back on the button), a click outside, or
 * moving to another page.
 */
export function SportsMenu() {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const pathname = usePathname();

  // A link in the panel navigates: close behind it.
  useEffect(() => setOpen(false), [pathname]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        buttonRef.current?.focus();
      }
    };
    const onPointer = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onPointer);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onPointer);
    };
  }, [open]);

  return (
    <div ref={rootRef} className="static sm:relative">
      <button
        ref={buttonRef}
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((v) => !v)}
        className={`inline-flex h-10 items-center gap-1.5 rounded-md px-3 text-sm font-medium transition-colors duration-fast ease-out-quart hover:bg-surface-alt hover:text-ink ${
          open ? "bg-surface-alt text-ink" : "text-ink-dim"
        }`}
      >
        Sports
        <svg
          viewBox="0 0 12 12"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
          aria-hidden="true"
          className={`h-3 w-3 transition-transform duration-fast ${open ? "rotate-180" : ""}`}
        >
          <path d="M3 4.5l3 3 3-3" />
        </svg>
      </button>

      <div
        id={panelId}
        hidden={!open}
        className="absolute inset-x-3 top-full z-30 mt-2 max-h-[calc(100dvh-5rem)] overflow-y-auto rounded-2xl border border-hairline bg-surface shadow-pop sm:inset-x-auto sm:left-0 sm:w-[min(44rem,calc(100vw-3rem))]"
      >
        <nav aria-label="Sports">
          <ul className="grid grid-cols-1 gap-0.5 p-3 sm:grid-flow-col sm:grid-cols-2 sm:grid-rows-5 sm:gap-x-4 sm:p-4">
            {MARKETING_SPORTS.map((sport) => (
              <li key={sport.id}>
                <Link
                  href={sportPagePath(sport)}
                  onClick={() => setOpen(false)}
                  className="group flex min-h-[52px] items-center gap-3 rounded-lg px-2 py-1.5 hover:bg-warm"
                >
                  <span className="flex h-[30px] w-12 shrink-0 items-center rounded-md bg-surface-alt px-1 py-0.5 text-ink group-hover:text-white group-hover:[background-color:var(--sport)]" style={{ "--sport": sport.accent } as React.CSSProperties}>
                    <SportFieldGlyph sport={sport.sport} weight={1.2} className="h-full w-full" />
                  </span>
                  <span className="flex min-w-0 flex-col">
                    <span className="text-[15px] font-semibold text-ink">{sport.label}</span>
                    <span className="truncate text-[13px] text-ink-dim">{sportPageCopy(sport.sport).menuLine}</span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </nav>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-hairline bg-warm/60 px-5 py-3.5 text-sm">
          <Link href="/#sports" onClick={() => setOpen(false)} className="font-semibold text-ink hover:text-brand-700">
            All {SPORT_COUNT_WORD} sports, side by side
          </Link>
          <span className="flex-1" />
          <span className="text-ink-dim">
            Not here?{" "}
            <Link href="/contact" onClick={() => setOpen(false)} className="font-semibold text-ink underline underline-offset-4 hover:text-brand-700">
              Tell us what you coach
            </Link>
          </span>
        </div>
      </div>
    </div>
  );
}
