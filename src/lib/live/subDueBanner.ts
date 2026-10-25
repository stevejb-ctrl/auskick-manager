// ─── When the top-bar "Sub due" banner speaks ───────────────────
// The sub card is the alert while it has pairs (components/live/SubDue);
// the banner speaks only for a due sub with no card to show it, and only
// when a sub can actually be made: someone on the bench can come on (not
// fouled out, lent, hurt or sitting out), and in league the laws allow a
// swap (rugby_league/legalSwap). It used to fire with nobody to bring on,
// telling the coach to take a kid off for no one (round-3 edge testing,
// 24 Oct 2026: basketball with the bench all fouled out, or all lent).

export function subDueBannerShows(due: boolean, pairCount: number, benchCanComeOn: boolean): boolean {
  return due && pairCount === 0 && benchCanComeOn;
}
