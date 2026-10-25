"use client";

import { useEffect, useRef, type RefObject } from "react";

// ─── useDialogFocus ──────────────────────────────────────────
// Keyboard focus for every dialog and sheet (Modal, SlotFillSheet,
// ActionSheet): on open it moves in, Tab and Shift+Tab stay inside,
// Escape closes, and on close it goes back to the control that opened
// it. UX round 3 (e4, 24 Oct 2026): only the clock menu took focus. With
// the scorer sheet open, Tab walked eight score buttons behind the
// backdrop, Escape did nothing and Cancel dropped focus on BODY.
//
// Dialogs stack (the scorer sheet opens over the break's score sheet),
// so only the top one answers Tab and Escape.

const stack: RefObject<HTMLElement>[] = [];

// What had focus lately, newest last: when the opener has gone by the
// time the dialog closes (the player dock's "Player actions" unmounts as
// its sheet opens), focus goes back to the latest that's still there —
// the tile that opened the dock. A control React drew again (the tile
// re-mounts when it's picked) is found again by its id or test id.
const recent: HTMLElement[] = [];
let tracking = false;
/**
 * Start keeping that history. A11yRoot calls it from the root layout:
 * dialogs load lazily, so from their own first import would be too late
 * to have seen the tile.
 */
export function trackFocus(): void {
  if (tracking || typeof document === "undefined") return;
  tracking = true;
  document.addEventListener("focusin", (e) => {
    if (!(e.target instanceof HTMLElement)) return;
    const i = recent.indexOf(e.target);
    if (i !== -1) recent.splice(i, 1);
    recent.push(e.target);
    if (recent.length > 12) recent.shift();
  });
}

function returnTarget(opener: HTMLElement | null, dialog: HTMLElement): HTMLElement | null {
  const usable = (el: HTMLElement): boolean =>
    el.isConnected && !dialog.contains(el) && !el.closest("[role=dialog]") && el !== document.body;
  const now = (el: HTMLElement): HTMLElement | null => {
    if (usable(el)) return el;
    const again = el.id
      ? document.getElementById(el.id)
      : el.dataset.testid
        ? document.querySelector<HTMLElement>(`[data-testid="${CSS.escape(el.dataset.testid)}"]`)
        : null;
    return again && usable(again) ? again : null;
  };
  for (const el of [opener, ...recent.slice().reverse()]) {
    const found = el && now(el);
    if (found) return found;
  }
  return null;
}

const FOCUSABLE = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled]):not([type=hidden])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "[tabindex]:not([tabindex='-1'])",
].join(",");

function focusables(root: HTMLElement): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
    (el) => el.getClientRects().length > 0 && !el.closest("[inert]"),
  );
}

/**
 * `ref` is the dialog element (give it tabIndex={-1}). `active` is false
 * until it's in the DOM (a portal mounts a frame late). `onEscape` is
 * the dialog's cancel; omit it for one that must be answered.
 *
 * Focus lands on the dialog itself, so a screen reader reads its name
 * and a held Enter can't pick its first row; an element marked
 * `data-autofocus` takes it instead.
 */
export function useDialogFocus(ref: RefObject<HTMLElement>, active: boolean, onEscape?: () => void): void {
  const escape = useRef(onEscape);
  escape.current = onEscape;

  useEffect(() => {
    const dialog = ref.current;
    if (!active || !dialog) return;
    trackFocus();
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    stack.push(ref);
    dialog.querySelector<HTMLElement>("[data-autofocus]")?.focus({ preventScroll: true });
    // A disabled autofocus row can't take it.
    if (!dialog.contains(document.activeElement)) dialog.focus({ preventScroll: true });

    const onKey = (e: KeyboardEvent) => {
      if (stack[stack.length - 1] !== ref) return;
      if (e.key === "Escape") {
        if (!escape.current) return;
        e.preventDefault();
        e.stopPropagation();
        escape.current();
        return;
      }
      if (e.key !== "Tab") return;
      // Moved by hand, so it's the same in every engine (WebKit's Tab
      // skips buttons unless the user opts in).
      const items = focusables(dialog);
      e.preventDefault();
      if (items.length === 0) {
        dialog.focus({ preventScroll: true });
        return;
      }
      const at = items.indexOf(document.activeElement as HTMLElement);
      const next = e.shiftKey
        ? at <= 0
          ? items[items.length - 1]
          : items[at - 1]
        : at === -1 || at === items.length - 1
          ? items[0]
          : items[at + 1];
      next.focus();
    };
    document.addEventListener("keydown", onKey, true);

    return () => {
      document.removeEventListener("keydown", onKey, true);
      const i = stack.lastIndexOf(ref);
      if (i !== -1) stack.splice(i, 1);
      // Back to the opener (or, if it's gone, what had focus before it),
      // unless something else has taken focus meanwhile (a dialog that
      // opens another).
      const now = document.activeElement;
      const leftInDialog = !now || now === document.body || dialog.contains(now);
      if (leftInDialog) returnTarget(opener, dialog)?.focus({ preventScroll: true });
    };
  }, [ref, active]);
}
