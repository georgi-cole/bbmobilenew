import { findByName, getById } from '../../data/houseguests'
import type { Player } from '../../types'

export function getDayStartShockObjectPronoun(
  player: Pick<Player, 'id' | 'name'>
): 'him' | 'her' | 'them' {
  const profile = getById(player.id) ?? findByName(player.name)
  const sex = profile?.sex?.trim().toLowerCase()

  if (sex === 'female' || sex === 'woman') return 'her'
  if (sex === 'male' || sex === 'man') return 'him'
  return 'them'
}
