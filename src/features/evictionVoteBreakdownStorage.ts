import type { Phase } from '../types'

const STORAGE_KEY = 'bb_eviction_vote_breakdown_v1'

export type EvictionVoteBreakdownStatus = 'available' | 'revealed' | 'declined'

export interface EvictionVoteBreakdownUnlock {
  /** Identifies the season/run that produced this unlock. */
  gameId?: string
  week: number
  phase: Phase
  votes: Record<string, string>
  nomineeIds: string[]
  evicteeId: string | null
  status: EvictionVoteBreakdownStatus
}

export interface EvictionVoteBreakdownRow {
  voterKey: string
  voterName: string
  targetName: string
}

export function buildEvictionVoteBreakdownPlayerNamesById(
  players: ReadonlyArray<{ id: string; name: string }>
): Record<string, string> {
  return Object.fromEntries(players.map((player) => [player.id, player.name]))
}

export function loadEvictionVoteBreakdownUnlock(): EvictionVoteBreakdownUnlock | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY)
    return raw ? (JSON.parse(raw) as EvictionVoteBreakdownUnlock) : null
  } catch {
    return null
  }
}

export function saveEvictionVoteBreakdownUnlock(unlock: EvictionVoteBreakdownUnlock): void {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(unlock))
  } catch {
    // Ignore storage failures in unsupported/private contexts.
  }
}

/**
 * Returns true when an eviction vote-breakdown unlock exists and is valid for
 * the current eviction day. The reveal remains available after the eviction
 * animation advances from eviction_results into week_end, but it expires once
 * the next day begins and the game enters week_start. Stored unlocks must
 * originate from eviction_results so unrelated same-week unlock data does not
 * accidentally become eligible.
 */
export function isEvictionVoteBreakdownActive(
  unlock: EvictionVoteBreakdownUnlock | null,
  week: number,
  phase: Phase,
  gameId?: string
): unlock is EvictionVoteBreakdownUnlock {
  return Boolean(
    unlock &&
    // Older unlocks predate per-game scoping. Keep those session-local records
    // usable, while still isolating records that explicitly identify another
    // game.
    (!gameId || !unlock.gameId || unlock.gameId === gameId) &&
    unlock.week === week &&
    unlock.phase === 'eviction_results' &&
    (phase === 'eviction_results' || phase === 'week_end')
  )
}

export function updateEvictionVoteBreakdownStatus(
  status: EvictionVoteBreakdownStatus
): EvictionVoteBreakdownUnlock | null {
  const current = loadEvictionVoteBreakdownUnlock()
  if (!current) return null
  const next = { ...current, status }
  saveEvictionVoteBreakdownUnlock(next)
  return next
}

export function buildEvictionVoteBreakdownRows(
  votes: Record<string, string>,
  playerNamesById: Record<string, string>
): EvictionVoteBreakdownRow[] {
  return Object.entries(votes).map(([voterKey, targetId]) => {
    const voteKeyParts = voterKey.split('__')
    const voterId = voteKeyParts[0]
    const extraVoteKey = voteKeyParts.length > 1 ? voteKeyParts[1] : null
    const voterName = playerNamesById[voterId] ?? voterId
    const targetName = playerNamesById[targetId] ?? targetId

    return {
      voterKey,
      voterName: extraVoteKey === 'dv2' ? `${voterName} (Vote 2)` : voterName,
      targetName,
    }
  })
}
