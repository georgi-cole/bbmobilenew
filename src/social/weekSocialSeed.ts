/**
 * weekSocialSeed — initializes new relationships and consolidates recent social memory.
 *
 * New pairs receive a deterministic starting chemistry value. Existing pairs
 * receive a small continuity adjustment plus a light deterministic background
 * shift. The latter represents indirect conversations, observation, ordinary
 * mood, and off-screen house life without inventing a major event.
 */

import {
  applyRealityAmbientMood,
  applyRealityAmbientRelationship,
  updateRelationship,
} from './socialSlice'
import HOUSEGUESTS from '../data/houseguests'
import type { SocialMemoryEntry, SocialMemoryMap } from './types'

interface StoreAPI {
  dispatch: (action: unknown) => unknown
  getState: () => unknown
}

interface SeedState {
  game: {
    players: Array<{ id: string; status: string; isUser?: boolean }>
    seed: number
    week: number
    dramaSocialMode?: boolean
  }
  social: {
    relationships: Record<string, Record<string, { affinity: number; tags: string[] }>>
    socialMemory?: SocialMemoryMap
  }
  settings?: {
    gameUX?: { dramaMode?: boolean }
  }
}

function makeLcg(seed: number): () => number {
  let state = seed >>> 0
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0
    return state / 0x1_0000_0000
  }
}

const HOUSEGUEST_PROFILE_BY_ID = Object.fromEntries(
  HOUSEGUESTS.map((houseguest) => [houseguest.id, houseguest])
)

function seedStaticRelationshipChemistry(store: StoreAPI, activePlayerIds: string[]): void {
  const activeIds = new Set(activePlayerIds)
  for (const actorId of activePlayerIds) {
    const profile = HOUSEGUEST_PROFILE_BY_ID[actorId]
    if (!profile) continue
    profile.allies.forEach((targetId) => {
      if (!activeIds.has(targetId)) return
      store.dispatch(
        updateRelationship({ source: actorId, target: targetId, delta: 8, actionSource: 'system' })
      )
    })
    profile.enemies.forEach((targetId) => {
      if (!activeIds.has(targetId)) return
      store.dispatch(
        updateRelationship({ source: actorId, target: targetId, delta: -8, actionSource: 'system' })
      )
    })
  }
}

function seedStaticRelationshipTags(store: StoreAPI, activePlayerIds: string[]): void {
  const activeIds = new Set(activePlayerIds)
  for (const actorId of activePlayerIds) {
    const profile = HOUSEGUEST_PROFILE_BY_ID[actorId]
    if (!profile) continue
    profile.allies.forEach((targetId) => {
      if (!activeIds.has(targetId)) return
      store.dispatch(
        updateRelationship({
          source: actorId,
          target: targetId,
          delta: 0,
          tags: ['alliance'],
          actionSource: 'system',
        })
      )
    })
    profile.enemies.forEach((targetId) => {
      if (!activeIds.has(targetId)) return
      store.dispatch(
        updateRelationship({
          source: actorId,
          target: targetId,
          delta: 0,
          tags: ['target'],
          actionSource: 'system',
        })
      )
    })
  }
}

export function getRelationshipContinuityDelta(entry?: SocialMemoryEntry): number {
  if (!entry) return 0
  const positive = entry.gratitude * 0.7 + Math.max(0, entry.trustMomentum) * 1.1
  const negative =
    entry.resentment * 0.8 + entry.neglect * 0.55 + Math.max(0, -entry.trustMomentum) * 1.1
  const signal = positive - negative
  if (Math.abs(signal) < 2.5) return 0
  return Math.max(-2, Math.min(2, Math.round(signal / 4)))
}

export function getAmbientRelationshipDelta(
  roll: number,
  options: { humanInvolved?: boolean; week?: number } = {}
): number {
  const safeRoll = Math.max(0, Math.min(0.999_999, Number.isFinite(roll) ? roll : 0.5))
  const earlyHumanWarmth = options.humanInvolved === true && (options.week ?? 1) <= 3
  if (earlyHumanWarmth) {
    if (safeRoll < 0.07) return -2
    if (safeRoll < 0.22) return -1
    if (safeRoll < 0.55) return 0
    if (safeRoll < 0.87) return 1
    return 2
  }
  if (safeRoll < 0.12) return -2
  if (safeRoll < 0.32) return -1
  if (safeRoll < 0.68) return 0
  if (safeRoll < 0.88) return 1
  return 2
}

/**
 * Seed or refresh relationships at week start.
 *
 * - Week 1 keeps the established roster chemistry behavior.
 * - Brand-new pairs receive deterministic chemistry between -12 and +25.
 * - Existing pairs receive at most ±3 from memory plus low-amplitude ambient
 *   house life. Human-involved edges get a small early warmth bias, not immunity.
 * - Contestant mood, stress, and social energy settle a little each day.
 */
export function seedWeekRelationships(store: StoreAPI): void {
  const state = store.getState() as SeedState
  const players = state.game?.players ?? []
  const week = state.game?.week ?? 1
  const gameSeed = state.game?.seed ?? 0
  const relationships = state.social?.relationships ?? {}
  const socialMemory = state.social?.socialMemory ?? {}

  const active = players.filter((player) => player.status !== 'evicted' && player.status !== 'jury')
  if (active.length < 2) return

  if (week === 1) {
    const activeIds = active.map((player) => player.id)
    if (state.settings?.gameUX?.dramaMode === true || state.game.dramaSocialMode === true) {
      seedStaticRelationshipChemistry(store, activeIds)
    } else {
      seedStaticRelationshipTags(store, activeIds)
    }
  }

  const rng = makeLcg(gameSeed ^ (week * 2654435761))

  for (let actorIndex = 0; actorIndex < active.length; actorIndex += 1) {
    for (let targetIndex = 0; targetIndex < active.length; targetIndex += 1) {
      if (actorIndex === targetIndex) continue
      const actor = active[actorIndex]
      const target = active[targetIndex]
      const existing = relationships[actor.id]?.[target.id]
      const delta = existing
        ? Math.max(
            -3,
            Math.min(
              3,
              getRelationshipContinuityDelta(socialMemory[actor.id]?.[target.id]) +
                getAmbientRelationshipDelta(rng(), {
                  humanInvolved: actor.isUser === true || target.isUser === true,
                  week,
                })
            )
          )
        : Math.round(-12 + rng() * 37)

      if (delta !== 0) {
        store.dispatch(
          updateRelationship({
            source: actor.id,
            target: target.id,
            delta,
            actionSource: 'system',
          })
        )
        if (existing) {
          store.dispatch(
            applyRealityAmbientRelationship({
              sourceId: actor.id,
              targetId: target.id,
              socialDelta: delta,
              day: week,
            })
          )
        }
      }
    }
  }

  for (const player of active) {
    store.dispatch(
      applyRealityAmbientMood({
        actorId: player.id,
        valenceDelta: Math.round((rng() - 0.48) * 10),
        arousalDelta: Math.round((rng() - 0.5) * 8),
        stressDelta: Math.round((rng() - 0.52) * 6),
        socialEnergyDelta: Math.round((rng() - 0.5) * 8),
      })
    )
  }
}
