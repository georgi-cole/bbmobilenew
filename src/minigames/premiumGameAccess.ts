import { getGame, type GameRegistryEntry } from './registry'

/** Resolves a canonical competition entry without changing its saved game key. */
export function resolvePremiumGameForAccess(
  game: GameRegistryEntry,
  hasPremiumChallengesAccess: boolean
): GameRegistryEntry {
  if (!hasPremiumChallengesAccess || !game.premiumReplacementKey) return game
  return getGame(game.premiumReplacementKey) ?? game
}
