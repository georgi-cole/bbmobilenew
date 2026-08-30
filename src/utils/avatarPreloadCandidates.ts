import type { Player } from '../types'
import { resolveAvatar } from './avatar'
import { resolvePresentationAvatarCandidates } from './presentationAvatar'

/** Candidate URLs warmed before presentation-heavy gameplay screens open. */
export function getPresentationAvatarPreloadUrls(
  players: Array<Pick<Player, 'id' | 'name'> & Partial<Pick<Player, 'avatar' | 'isUser'>>>
): string[] {
  return players.flatMap((player) =>
    resolvePresentationAvatarCandidates(resolveAvatar({ ...player, avatar: player.avatar ?? '' }))
  )
}
