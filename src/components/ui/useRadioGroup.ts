"use client";

// ─── useRadioGroup ───────────────────────────────────────────
// The WAI-ARIA radio group's keyboard, once, for every group of
// role="radio" buttons in the app (accessibility follow-up to UX round
// 3's R6, 25 Oct 2026): the break's Suggested / Rotate / Repeat /
// Manual, the settings toggles, the lineup pickers' shapes, the setup
// wizard's sports. Before, they only moved with Tab, one stop per
// option.
//
//   - The group is one Tab stop (roving tabindex): the checked radio,
//     or the first enabled one when none is checked.
//   - Arrow keys move to the next / previous radio and select it,
//     wrapping at the ends; Home and End jump to the first and last.
//     Disabled radios are skipped.
//   - Space and Enter are the button's own click.
//
// The caller keeps its markup and its click handler; it spreads
// `radioProps(value)` onto each radio.

import { useCallback, useRef, type KeyboardEvent } from "react";

/**
 * Where a key moves focus in a group of `count` radios from `index`, or
 * null when the key isn't the group's (or nothing is enabled).
 */
export function radioKeyTarget(
  key: string,
  index: number,
  count: number,
  isDisabled: (i: number) => boolean = () => false,
): number | null {
  if (count <= 0) return null;
  const step = (from: number, dir: 1 | -1): number | null => {
    for (let n = 1; n <= count; n++) {
      const i = (((from + dir * n) % count) + count) % count;
      if (!isDisabled(i)) return i;
    }
    return null;
  };
  switch (key) {
    case "ArrowRight":
    case "ArrowDown":
      return step(index, 1);
    case "ArrowLeft":
    case "ArrowUp":
      return step(index, -1);
    case "Home":
      return step(-1, 1);
    case "End":
      return step(count, -1);
    default:
      return null;
  }
}

/** The radio that holds the group's one Tab stop. */
export function rovingIndex<T>(values: readonly T[], value: T | null | undefined, isDisabled: (i: number) => boolean = () => false): number {
  // The checked radio keeps the stop even while the group waits (a save
  // in flight disables its keys), so Tab still lands on it.
  const checked = value === null || value === undefined ? -1 : values.indexOf(value);
  if (checked >= 0) return checked;
  return Math.max(0, values.findIndex((_, i) => !isDisabled(i)));
}

export interface RadioGroupOptions<T> {
  /** The radios' values, in their visual order. */
  values: readonly T[];
  /** The checked value; null or undefined for none. */
  value: T | null | undefined;
  /** Select a value (arrow keys, Home, End). Not called for the one already checked. */
  onChange: (value: T) => void;
  /**
   * A radio (or, with `true`, the whole group) can't be chosen: the
   * arrow keys skip it (or do nothing, e.g. while a save is in flight).
   */
  disabled?: boolean | ((value: T) => boolean);
}

export interface RadioProps {
  ref: (el: HTMLElement | null) => void;
  tabIndex: number;
  onKeyDown: (e: KeyboardEvent<HTMLElement>) => void;
}

export function useRadioGroup<T>({ values, value, onChange, disabled = false }: RadioGroupOptions<T>) {
  const refs = useRef(new Map<number, HTMLElement>());
  const isDisabled = (i: number) => (typeof disabled === "function" ? disabled(values[i]) : disabled);
  const roving = rovingIndex(values, value, isDisabled);

  const setRef = useCallback(
    (i: number) => (el: HTMLElement | null) => {
      if (el) refs.current.set(i, el);
      else refs.current.delete(i);
    },
    [],
  );

  function radioProps(v: T): RadioProps {
    const i = values.indexOf(v);
    return {
      ref: setRef(i),
      tabIndex: i === roving ? 0 : -1,
      onKeyDown: (e) => {
        if (e.altKey || e.ctrlKey || e.metaKey) return;
        const target = radioKeyTarget(e.key, i, values.length, isDisabled);
        if (target === null) return;
        e.preventDefault();
        if (values[target] !== value) onChange(values[target]);
        refs.current.get(target)?.focus();
      },
    };
  }

  return { radioProps };
}
