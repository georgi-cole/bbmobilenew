import type { Middleware, MiddlewareAPI } from '@reduxjs/toolkit'
import type { GameState } from '../../types'
import type { RelationshipsMap, SocialActionLogEntry } from '../../social/types'
import {
  consumeDepressionShockFightRoll,
  invertStrategicRelationshipRow,
  isDepressionShockActive,
  pickDepressionShockFightPair,
  shouldDepressionShockFlipInteraction,
  shouldDepressionShockTriggerSurpriseDecision,
} from './depressionShock'

type DepressionShockRootState = {
  game: GameState
  social?: {
    relationships?: RelationshipsMap
  }
}

type RelationshipCorrection = {
  source: string
  target: string
  correction: number
}

type DispatchApi = Pick<MiddlewareAPI, 'dispatch'>

let pendingSurprise:
  | { gameId: string; week: number; kind: 'nomination' | 'safety' }
  | null = null

function labelForDelta(delta: number): string {
  if (delta <= -5) return 'Bad'
  if (delta < 1) return 'Unmoved'
  if (delta < 4) return 'Good'
  return 'Great'
}

function activePlayers(game: GameState) {
  return game.players.filter((player) => player.status !== 'evicted' && player.status !== 'jury')
}

function dispatchRelationshipCorrections(
  api: DispatchApi,
  corrections: readonly RelationshipCorrection[]
) {
  corrections.forEach(({ source, target, correction }) => {
    if (!Number.isFinite(correction) || correction === 0 || source === target) return
    api.dispatch({
      type: 'social/updateRelationship',
      payload: {
        source,
        target,
        delta: correction,
        actionSource: 'system',
        depressionShockCorrection: true,
      },
    })
  })
}

function buildOppositeInteraction(
  entry: SocialActionLogEntry
): { entry: SocialActionLogEntry; corrections: RelationshipCorrection[] } {
  const targetDeltas = entry.targetDeltas
  if (targetDeltas && Object.keys(targetDeltas).length > 0) {
    const oppositeTargetDeltas = Object.fromEntries(
      Object.entries(targetDeltas).map(([targetId, delta]) => [targetId, -delta])
    )
    const corrections = Object.entries(targetDeltas).map(([targetId, delta]) => ({
      source: entry.actorId,
      target: targetId,
      correction: -2 * delta,
    }))
    const averageDelta =
      Object.values(oppositeTargetDeltas).reduce((sum, delta) => sum + delta, 0) /
      Math.max(1, Object.keys(oppositeTargetDeltas).length)
    return {
      entry: {
        ...entry,
        delta: averageDelta,
        targetDeltas: oppositeTargetDeltas,
        score: entry.score == null ? entry.score : -entry.score,
        label: labelForDelta(averageDelta),
        narrative: entry.narrative
          ? `${entry.narrative} The Depression Shock twisted the reaction into the opposite effect.`
          : 'The Depression Shock twisted the reaction into the opposite effect.',
      },
      corrections,
    }
  }

  const oppositeDelta = -entry.delta
  const corrections: RelationshipCorrection[] = [
    {
      source: entry.actorId,
      target: entry.targetId,
      correction: -2 * entry.delta,
    },
  ]

  // Alliance proposals normally write a reciprocal edge before the action log.
  // Reverse that side too so a backfired alliance cannot remain secretly mutual.
  if (entry.actionId === 'proposeAlliance' && entry.outcome === 'success') {
    corrections.push({
      source: entry.targetId,
      target: entry.actorId,
      correction: -2 * Math.max(1, Math.abs(entry.delta)),
    })
  }

  return {
    entry: {
      ...entry,
      delta: oppositeDelta,
      score: entry.score == null ? entry.score : -entry.score,
      label: labelForDelta(oppositeDelta),
      narrative: entry.narrative
        ? `${entry.narrative} The Depression Shock twisted the reaction into the opposite effect.`
        : 'The Depression Shock twisted the reaction into the opposite effect.',
    },
    corrections,
  }
}

function maybeDistortStrategicRelationships(
  state: DepressionShockRootState,
  payload: RelationshipsMap
): RelationshipsMap {
  const game = state.game
  if (!isDepressionShockActive(game)) return payload

  if (game.phase === 'nominations') {
    const voxActive = game.voxPopuli?.status === 'active'
    if (!voxActive) {
      const loh = game.lohId ? game.players.find((player) => player.id === game.lohId) : null
      if (!loh || loh.isUser) return payload
    }
    if (!shouldDepressionShockTriggerSurpriseDecision(game.gameId, game.week, 'nomination')) {
      return payload
    }

    let distorted = payload
    if (voxActive) {
      for (const player of activePlayers(game)) {
        if (!player.isUser) distorted = invertStrategicRelationshipRow(distorted, player.id)
      }
    } else if (game.lohId) {
      distorted = invertStrategicRelationshipRow(distorted, game.lohId)
    }
    pendingSurprise = { gameId: game.gameId, week: game.week, kind: 'nomination' }
    return distorted
  }

  if (game.phase === 'pos_ceremony_results') {
    const holder = game.posWinnerId
      ? game.players.find((player) => player.id === game.posWinnerId)
      : null
    if (!holder || holder.isUser) return payload
    if (!shouldDepressionShockTriggerSurpriseDecision(game.gameId, game.week, 'safety')) {
      return payload
    }
    pendingSurprise = { gameId: game.gameId, week: game.week, kind: 'safety' }
    return invertStrategicRelationshipRow(payload, holder.id)
  }

  return payload
}

function announceSurpriseDecision(
  api: DispatchApi,
  before: GameState,
  after: GameState,
  kind: 'nomination' | 'safety'
) {
  if (kind === 'nomination') {
    const names = after.nomineeIds
      .map((id) => after.players.find((player) => player.id === id)?.name)
      .filter((name): name is string => Boolean(name))
    const actorName =
      after.voxPopuli?.status === 'active'
        ? 'The house'
        : (after.players.find((player) => player.id === after.lohId)?.name ?? 'The LOH')
    api.dispatch({
      type: 'game/addTvEvent',
      payload: {
        text: `${actorName}'s depressed-state nominations caught everyone off guard${
          names.length > 0 ? `: ${names.join(', ')}` : ''
        }. Nobody seems to be thinking quite like themselves.`,
        type: 'twist',
        source: 'system',
        channels: ['tv', 'mainLog'],
        meta: { depressionShock: true, surpriseDecision: 'nomination', week: after.week },
      },
    })
    return
  }

  const holderName =
    after.players.find((player) => player.id === after.posWinnerId)?.name ?? 'The Safety holder'
  const savedIds = before.nomineeIds.filter((id) => !after.nomineeIds.includes(id))
  const savedNames = savedIds
    .map((id) => after.players.find((player) => player.id === id)?.name)
    .filter((name): name is string => Boolean(name))
  api.dispatch({
    type: 'game/addTvEvent',
    payload: {
      text: `${holderName} made an unexpectedly erratic Safety choice${
        savedNames.length > 0 ? `, saving ${savedNames.join(' and ')}` : ''
      }. The house is struggling to read the decision.`,
      type: 'twist',
      source: 'system',
      channels: ['tv', 'mainLog'],
      meta: { depressionShock: true, surpriseDecision: 'safety', week: after.week },
    },
  })
}

function maybeTriggerRandomFight(
  api: DispatchApi,
  state: DepressionShockRootState,
  previousPhase: string | undefined
) {
  const game = state.game
  if (
    !isDepressionShockActive(game) ||
    previousPhase === game.phase ||
    game.phase !== 'social_1'
  ) {
    return
  }
  if (!consumeDepressionShockFightRoll(game.gameId, game.week)) return

  const eligibleIds = activePlayers(game)
    .filter((player) => !player.isUser)
    .map((player) => player.id)
  const pair = pickDepressionShockFightPair(game.gameId, game.week, eligibleIds)
  if (!pair) return
  const [leftId, rightId] = pair
  const leftName = game.players.find((player) => player.id === leftId)?.name ?? leftId
  const rightName = game.players.find((player) => player.id === rightId)?.name ?? rightId

  api.dispatch({
    type: 'social/updateRelationship',
    payload: {
      source: leftId,
      target: rightId,
      delta: -14,
      tags: ['rivalry'],
      actionSource: 'system',
      depressionShockCorrection: true,
    },
  })
  api.dispatch({
    type: 'social/updateRelationship',
    payload: {
      source: rightId,
      target: leftId,
      delta: -12,
      tags: ['rivalry'],
      actionSource: 'system',
      depressionShockCorrection: true,
    },
  })
  api.dispatch({
    type: 'game/addTvEvent',
    payload: {
      text: `Out of nowhere, ${leftName} and ${rightName} erupted into a fight. The argument seemed to start over almost nothing — the mood in the House is getting volatile.`,
      type: 'social',
      source: 'system',
      channels: ['tv', 'mainLog'],
      meta: { depressionShock: true, randomFight: true, week: game.week },
    },
  })
}

/**
 * Cross-cutting gameplay effects for the two active Depression Shock days.
 * Scheduling/presentation live in DepressionShockController; this middleware
 * changes actual relationship and ceremony inputs rather than cosmetic copy.
 */
export const depressionShockMiddleware: Middleware = (api) => (next) => (action) => {
  if (typeof action !== 'object' || action === null || !('type' in action)) return next(action)
  const type = String((action as { type: string }).type)
  const stateBefore = api.getState() as DepressionShockRootState

  if (type === 'game/syncStrategicRelationships' && isDepressionShockActive(stateBefore.game)) {
    const payload = (action as unknown as { type: string; payload: RelationshipsMap }).payload
    return next({
      ...(action as object),
      payload: maybeDistortStrategicRelationships(stateBefore, payload),
    })
  }

  if (type === 'social/recordSocialAction' && isDepressionShockActive(stateBefore.game)) {
    const originalEntry = (
      action as unknown as { payload: { entry: SocialActionLogEntry } }
    ).payload.entry
    if (
      originalEntry.delta !== 0 &&
      shouldDepressionShockFlipInteraction(stateBefore.game.gameId, stateBefore.game.week)
    ) {
      const opposite = buildOppositeInteraction(originalEntry)
      const result = next({
        ...(action as object),
        payload: { entry: opposite.entry },
      })
      dispatchRelationshipCorrections(api, opposite.corrections)

      const targetName =
        stateBefore.game.players.find((player) => player.id === originalEntry.targetId)?.name ??
        originalEntry.targetId
      api.dispatch({
        type: 'game/addTvEvent',
        payload: {
          text: `Depression Shock: ${targetName}'s reaction landed in exactly the opposite way from what was expected.`,
          type: 'social',
          source: 'system',
          channels: ['mainLog'],
          meta: { suppressTv: true, depressionShock: true, interactionFlipped: true },
        },
      })
      return result
    }
  }

  if (type === 'game/advance') {
    const previousPhase = stateBefore.game.phase
    const result = next(action)
    const stateAfter = api.getState() as DepressionShockRootState

    if (
      pendingSurprise &&
      pendingSurprise.gameId === stateAfter.game.gameId &&
      pendingSurprise.week === stateAfter.game.week
    ) {
      announceSurpriseDecision(api, stateBefore.game, stateAfter.game, pendingSurprise.kind)
      pendingSurprise = null
    }

    maybeTriggerRandomFight(api, stateAfter, previousPhase)
    return result
  }

  return next(action)
}
