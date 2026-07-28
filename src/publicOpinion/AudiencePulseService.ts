import type { SocialActionLogEntry } from '../social/types'

interface AudiencePulsePlayer {
  id: string
  status: string
}

export interface AudiencePulseReaction {
  playerId: string
  delta: number
  reason:
    | 'audience_social_warmth'
    | 'audience_strategy'
    | 'audience_conflict_fatigue'
    | 'audience_social_overexposure'
}

const WARM_ACTIONS = new Set(['compliment', 'reassure', 'apologize', 'repair_bond', 'protect'])
const STRATEGY_ACTIONS = new Set([
  'ally',
  'proposeAlliance',
  'share_intel',
  'trade_secrets',
  'pitch_target',
  'rally_votes_against',
])
const CONFLICT_ACTIONS = new Set([
  'betray',
  'rumor',
  'startFight',
  'confront',
  'public_callout',
  'break_alliance',
  'break_bromance',
])

export function computeAudiencePulse({
  players,
  actionHistory,
  week,
  maxReactions = 4,
}: {
  players: readonly AudiencePulsePlayer[]
  actionHistory: readonly SocialActionLogEntry[]
  week: number
  maxReactions?: number
}): AudiencePulseReaction[] {
  const activeIds = new Set(
    players
      .filter((player) => player.status !== 'evicted' && player.status !== 'jury')
      .map((player) => player.id),
  )
  const byActor = new Map<string, SocialActionLogEntry[]>()
  for (const entry of actionHistory) {
    if ((entry.week ?? week) !== week || !activeIds.has(entry.actorId)) continue
    byActor.set(entry.actorId, [...(byActor.get(entry.actorId) ?? []), entry])
  }

  const scored: Array<AudiencePulseReaction & { strength: number }> = []
  for (const [playerId, entries] of byActor) {
    const warmth = entries.filter(
      (entry) => entry.outcome === 'success' && entry.delta > 0 && WARM_ACTIONS.has(entry.actionId),
    ).length
    const strategy = entries.filter(
      (entry) => entry.outcome === 'success' && STRATEGY_ACTIONS.has(entry.actionId),
    ).length
    const conflict = entries.filter(
      (entry) => entry.delta < 0 || CONFLICT_ACTIONS.has(entry.actionId),
    ).length
    const failures = entries.filter((entry) => entry.outcome === 'failure').length
    const overexposed = entries.length >= 8
    const score = warmth * 0.7 + strategy * 0.5 - conflict * 0.75 - failures * 0.35 - (overexposed ? 0.8 : 0)
    if (Math.abs(score) < 0.75) continue
    const delta = Math.max(-2, Math.min(2, Math.round(score)))
    if (delta === 0) continue
    let reason: AudiencePulseReaction['reason']
    if (delta < 0 && overexposed) reason = 'audience_social_overexposure'
    else if (delta < 0) reason = 'audience_conflict_fatigue'
    else if (strategy > warmth) reason = 'audience_strategy'
    else reason = 'audience_social_warmth'
    scored.push({ playerId, delta, reason, strength: Math.abs(score) })
  }

  return scored
    .sort((left, right) => right.strength - left.strength || left.playerId.localeCompare(right.playerId))
    .slice(0, Math.max(0, maxReactions))
    .map(({ strength: _strength, ...reaction }) => reaction)
}
