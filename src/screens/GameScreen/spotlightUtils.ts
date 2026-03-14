/**
 * Minigame keys that skip the heavy SpotlightAnimation / CeremonyOverlay after a
 * win. These games cause DOM measurement or animation race conditions, so they
 * use the lightweight winner-apply path instead.
 *
 * Exported so tests can assert membership without duplicating the list.
 */
export const SPOTLIGHT_SKIP = new Set([
  'dontGoOver',
  'holdWall',
  'famousFigures',
  'biographyBlitz',
  'glass_bridge_brutal',
  'blackjackTournament',
]);

/** Returns true when the given minigame key should bypass SpotlightAnimation. */
export function shouldSkipSpotlight(minigameKey: string): boolean {
  return SPOTLIGHT_SKIP.has(minigameKey);
}
