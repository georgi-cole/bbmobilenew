import type { RootState } from '../../store/store'

export type RuntimeMusicMix = 'normal' | 'ducked' | 'muted'

export function resolveRuntimeMusicMix(
  game: Pick<
    RootState['game'],
    'phase' | 'evictionOverlayPlayerId' | 'battleBack' | 'voteResults' | 'twinShock'
  >
): RuntimeMusicMix {
  const evictionOverlayPlayerId = game.evictionOverlayPlayerId ?? null
  const battleBackReturnActive =
    evictionOverlayPlayerId != null &&
    game.battleBack?.used === true &&
    game.battleBack?.winnerId === evictionOverlayPlayerId
  // voteResults can persist beyond the visible tally. Only duck while the vote
  // reveal itself can own the presentation; later phases must return to full mix.
  const voteResultsRevealActive =
    game.voteResults != null && (game.phase === 'live_vote' || game.phase === 'eviction_results')
  const evictionCinematicActive = evictionOverlayPlayerId != null && !battleBackReturnActive
  const twinShockRevealActive = game.twinShock?.pendingRevealAnimation != null

  // Keep the phase bed running at zero volume so it can resume in place once
  // the Twin Shock cinematic hands audio ownership back to gameplay.
  if (twinShockRevealActive) return 'muted'

  return voteResultsRevealActive || evictionCinematicActive ? 'ducked' : 'normal'
}
