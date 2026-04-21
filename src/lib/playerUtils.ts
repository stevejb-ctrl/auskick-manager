/** Returns "#7" for jersey 7, or "" when no jersey number is recorded. */
export function jerseyLabel(n: number | null | undefined): string {
  return n != null ? `#${n}` : "";
}
