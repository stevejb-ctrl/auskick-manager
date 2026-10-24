// ─── gameWriteError ──────────────────────────────────────────
// What a coach reads when the database refuses a game write: never a
// constraint's name. A futsal team set to 3 on court got 'new row for
// relation "games" violates check constraint
// "games_on_field_size_check"' and nothing else (UX round 3, 24 Oct
// 2026). A check violation (23514) on the number on the field says so in
// the sport's words; any other check violation says a setting is out of
// range; anything else (a dropped connection) passes through. Pure.

export function gameWriteError(
  error: { code?: string | null; message: string },
  on?: { size: number; onSurface: string },
): string {
  if (error.code !== "23514") return error.message;
  if (/on_field_size/.test(error.message)) {
    const what = on ? `${on.size} ${on.onSurface}` : "that many on the field";
    return `Siren can't save a game with ${what}. Pick another number in Game settings, or in Team › Season.`;
  }
  return "Siren couldn't save that game: one of its settings is out of range.";
}
