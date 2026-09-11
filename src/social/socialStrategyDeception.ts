import type { Player } from '../types'
import { applyRealityRelationshipDelta, pushIncomingInteraction } from './socialSlice'
import {
  activeStrategyPlayers,
  isActiveStrategyNemesis,
  seededUnit,
  sortScoredPlayers,
  strategyAffinity,
  strategyTags,
  type StrategyApi,
  type StrategyState,
} from './socialStrategyShared'

const MISINFORMATION_COOLDOWN_DAYS = 2

function hasRecentMisinformation(state: StrategyState): boolean {
  return (state.social.incomingInteractions ?? []).some(
    (interaction) =>
      interaction.payload?.source === 'social_strategy_misinformation' &&
      interaction.createdWeek >= Math.max(1, state.game.week - MISINFORMATION_COOLDOWN_DAYS + 1)
  )
}

function chooseHostileSource(state: StrategyState, humanId: string): Player | null {
  return (
    activeStrategyPlayers(state)
      .filter((player) => player.id !== humanId && !player.isUser)
      .map((player) => {
        const tags = strategyTags(state, player.id, humanId)
        const nemesis = isActiveStrategyNemesis(state, player.id, humanId)
        let score = Math.max(0, -strategyAffinity(state, player.id, humanId))
        if (nemesis) score += 100
        if (tags.has('rivalry')) score += 45
        if (tags.has('target')) score += 45
        if (tags.has('betrayal')) score += 30
        return { player, score, nemesis }
      })
      .filter((entry) => entry.nemesis || entry.score >= 55)
      .sort(sortScoredPlayers)[0]?.player ?? null
  )
}

function chooseListeners(
  state: StrategyState,
  humanId: string,
  hostileId: string,
  count: number
): Player[] {
  return activeStrategyPlayers(state)
    .filter(
      (player) => player.id !== humanId && player.id !== hostileId && !player.isUser
    )
    .map((player) => {
      const tags = strategyTags(state, player.id, humanId)
      let score = 20 - strategyAffinity(state, player.id, humanId)
      if (tags.has('alliance')) score -= 70
      if (tags.has('romance') || tags.has('bromance')) score -= 60
      if (tags.has('suspicious')) score += 25
      score +=
        seededUnit(
          state.game.seed ?? 0,
          `misinformation-listener:${state.game.week}:${player.id}`
        ) * 12
      return { player, score }
    })
    .filter((entry) => entry.score > -25)
    .sort(sortScoredPlayers)
    .slice(0, count)
    .map((entry) => entry.player)
}

function chooseFalseTarget(
  state: StrategyState,
  humanId: string,
  hostileId: string
): Player | null {
  return (
    activeStrategyPlayers(state)
      .filter(
        (player) => player.id !== humanId && player.id !== hostileId && !player.isUser
      )
      .map((player) => ({
        player,
        affinity: strategyAffinity(state, player.id, humanId),
        tags: strategyTags(state, player.id, humanId),
      }))
      .filter(
        (entry) =>
          entry.affinity >= 20 &&
          !entry.tags.has('target') &&
          !entry.tags.has('rivalry') &&
          !entry.tags.has('betrayal')
      )
      .sort(
        (left, right) =>
          right.affinity - left.affinity || left.player.id.localeCompare(right.player.id)
      )[0]?.player ?? null
  )
}

export function maybeSpreadStrategyMisinformation(
  api: StrategyApi,
  state: StrategyState,
  humanId: string
): string[] {
  if (state.game.week < 4 || hasRecentMisinformation(state)) return []

  const hostile = chooseHostileSource(state, humanId)
  if (!hostile) return []

  const nemesis = isActiveStrategyNemesis(state, hostile.id, humanId)
  const chance = nemesis ? 0.48 : 0.24
  const draw = seededUnit(
    state.game.seed ?? 0,
    `social-strategy-misinformation:${state.game.week}:${hostile.id}:${humanId}`
  )
  if (draw >= chance) return []

  const listeners = chooseListeners(state, humanId, hostile.id, nemesis ? 2 : 1)
  for (const listener of listeners) {
    api.dispatch(
      applyRealityRelationshipDelta({
        sourceId: listener.id,
        targetId: humanId,
        day: state.game.week,
        phase: state.game.phase,
        eventId: `social-strategy:lie:${state.game.week}:${hostile.id}:${listener.id}:${humanId}`,
        meaningful: false,
        deltas: {
          suspicion: nemesis ? 13 : 9,
          perceivedThreat: nemesis ? 7 : 4,
          trust: nemesis ? -5 : -3,
          reliability: nemesis ? -4 : -2,
          warmth: -2,
        },
      })
    )
  }

  const falseTarget = chooseFalseTarget(state, humanId, hostile.id)
  if (falseTarget) {
    api.dispatch(
      pushIncomingInteraction({
        id: `social-strategy-misinformation:${state.game.week}:${hostile.id}:${humanId}`,
        fromId: hostile.id,
        type: 'gossip',
        text: `Just so you know, ${falseTarget.name} has been quietly pushing your name. Do what you want with that.`,
        payload: {
          source: 'social_strategy_misinformation',
          scenarioKey: 'generic_gossip',
          allegedSourceId: falseTarget.id,
          deception: true,
        },
        createdAt: Date.now(),
        createdWeek: state.game.week,
        expiresAtWeek: state.game.week + 1,
        read: false,
        requiresResponse: true,
        resolved: false,
      })
    )
  }

  return listeners.map((listener) => listener.id)
}
