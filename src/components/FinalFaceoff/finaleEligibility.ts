import type { Player } from '../../types'

/**
 * Extraordinary removals persist `tribunalEligible = false`; normal evictees
 * remain eligible for Tribunal membership or parity promotion.
 */
export function isTribunalEligiblePlayer(player: Player): boolean {
  return player.tribunalEligible !== false
}

export function splitFinalePlayers(players: Player[]): {
  finalists: Player[]
  jurors: Player[]
  preJury: Player[]
} {
  return {
    finalists: players.filter((player) => player.status !== 'evicted' && player.status !== 'jury'),
    jurors: players.filter(
      (player) => player.status === 'jury' && isTribunalEligiblePlayer(player)
    ),
    preJury: players.filter(
      (player) => player.status === 'evicted' && isTribunalEligiblePlayer(player)
    ),
  }
}
