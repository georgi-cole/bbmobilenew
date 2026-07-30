import { getCupidPair, isCupidArrowActive } from '../../features/twists/cupidArrow'
import type { GameState, Player } from '../../types'

export interface ConfessionalDecisionUnit {
  id: string
  memberIds: string[]
  players: Player[]
  label: string
  pairColor?: string
  pairNumber?: string
}

export function buildConfessionalDecisionUnits(
  game: GameState,
  options: Player[]
): ConfessionalDecisionUnit[] {
  if (!isCupidArrowActive(game)) {
    return options.map((player) => ({
      id: player.id,
      memberIds: [player.id],
      players: [player],
      label: player.name,
    }))
  }

  const seen = new Set<string>()
  return options.flatMap((player) => {
    const pair = getCupidPair(game, player.id)
    const unitKey = pair?.id ?? `solo:${player.id}`
    if (seen.has(unitKey)) return []
    seen.add(unitKey)

    const unitPlayers = pair
      ? pair.memberIds
          .map((id) => game.players.find((candidate) => candidate.id === id))
          .filter(
            (candidate): candidate is Player =>
              Boolean(candidate) &&
              candidate?.status !== 'evicted' &&
              candidate?.status !== 'jury'
          )
      : [player]
    if (unitPlayers.length === 0) return []

    return [
      {
        id: unitPlayers[0].id,
        memberIds: unitPlayers.map((candidate) => candidate.id),
        players: unitPlayers,
        label: unitPlayers.map((candidate) => candidate.name).join(' & '),
        pairColor: pair?.color,
        pairNumber: pair?.id.replace('cupid-pair-', ''),
      },
    ]
  })
}
