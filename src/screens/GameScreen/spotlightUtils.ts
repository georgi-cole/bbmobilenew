/**
 * Minigame keys that skip the heavy SpotlightAnimation / CeremonyOverlay after
 * a win.  Add a key here only when there is a concrete DOM-measurement or
 * animation race that cannot be resolved in the ceremony path itself.
 *
 * The former entries (holdWall, glass_bridge_brutal, silentSaboteur, etc.) were
 * removed once the root-cause winner-identity mismatch was fixed: GameScreen's
 * onDone callback now reads the canonical winner from the live Redux store via
 * storeRef, so it always uses the same winnerId that the feature thunk applied
 * via applyMinigameWinner — regardless of whether game.phase has already
 * advanced before the callback fires.
 *
 * Exported so tests can assert membership without duplicating the list.
 */
export const SPOTLIGHT_SKIP = new Set<string>([
  // empty — no games currently require skipping the SpotlightAnimation
]);

/** Returns true when the given minigame key should bypass SpotlightAnimation. */
export function shouldSkipSpotlight(minigameKey: string): boolean {
  return SPOTLIGHT_SKIP.has(minigameKey);
}
