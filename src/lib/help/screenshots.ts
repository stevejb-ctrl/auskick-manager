// ─── Help screenshots, for next/image ───────────────────────
// next/image needs each screenshot's size to serve it resized (WebP,
// lazy-loaded below the fold) instead of the full 780px-wide PNGs
// (3 MB in all). Pages name a screenshot by its public path, and
// HelpFigure looks its size up here; the type makes an unknown path a
// compile error. Sizes are written out rather than read from static
// imports, which tsc can't type without Next's generated next-env.d.ts
// (CI typechecks before building). src/lib/__tests__/helpScreenshots.test.ts
// checks this list against public/help-screenshots/, sizes included.
export const HELP_SCREENSHOTS = {
  "/help-screenshots/games-create.png": { width: 780, height: 1688 },
  "/help-screenshots/games-detail.png": { width: 780, height: 1688 },
  "/help-screenshots/games-list.png": { width: 780, height: 1688 },
  "/help-screenshots/getting-started-add-players.png": { width: 780, height: 1688 },
  "/help-screenshots/getting-started-create-game.png": { width: 780, height: 1688 },
  "/help-screenshots/getting-started-create-team.png": { width: 780, height: 1688 },
  "/help-screenshots/getting-started-signup.png": { width: 780, height: 1688 },
  "/help-screenshots/live-game-field-clean.png": { width: 780, height: 1688 },
  "/help-screenshots/live-game-field.png": { width: 780, height: 1688 },
  "/help-screenshots/live-game-lineup-picker.png": { width: 780, height: 1688 },
  "/help-screenshots/live-game-quarter-break.png": { width: 780, height: 1688 },
  "/help-screenshots/live-game-quarter-end.png": { width: 780, height: 1688 },
  "/help-screenshots/live-game-scoring.png": { width: 780, height: 1688 },
  "/help-screenshots/live-game-sub-due.png": { width: 390, height: 280 },
  "/help-screenshots/overview-landing.png": { width: 780, height: 1688 },
  "/help-screenshots/rotations-player-tile.png": { width: 780, height: 520 },
  "/help-screenshots/rotations-swap-card.png": { width: 780, height: 520 },
  "/help-screenshots/rotations-zone-bar.png": { width: 780, height: 520 },
  "/help-screenshots/squads-add-player.png": { width: 780, height: 1688 },
  "/help-screenshots/squads-availability.png": { width: 780, height: 1688 },
  "/help-screenshots/squads-player-list.png": { width: 780, height: 1688 },
  "/help-screenshots/stats-combinations.png": { width: 780, height: 1688 },
  "/help-screenshots/stats-minutes-equity.png": { width: 780, height: 1688 },
  "/help-screenshots/stats-overview.png": { width: 780, height: 1688 },
  "/help-screenshots/teams-dashboard.png": { width: 780, height: 1688 },
  "/help-screenshots/teams-settings.png": { width: 780, height: 1688 },
  "/help-screenshots/track-scoring-player-tile.png": { width: 780, height: 1688 },
  "/help-screenshots/track-scoring-toggle.png": { width: 780, height: 1688 },
} as const satisfies Record<string, { width: number; height: number }>;

export type HelpScreenshotPath = keyof typeof HELP_SCREENSHOTS;
