import type { Middleware, MiddlewareAPI } from '@reduxjs/toolkit'
import type { GameState } from '../../types'
import type { RelationshipsMap } from '../../social/types'
import {
  consumeDepressionShockFightRoll,
  invertStrategicRelationshipRow,
  isDepressionShockActive,
  pickDepressionShockFightPair,
  shouldDepressionShockTriggerSurpriseDecision,
} from './depressionShock'

type DepressionShockRootState = {
  game: GameState
  social?: {
    relationships?: RelationshipsMap
  }
}

type DispatchApi = Pick<MiddlewareAPI, 'dispatch'>

let pendingSurprise: { gameId: string; week: number; kind: 'nomination' | 'safety' } | null = null

function activePlayers(game: GameState) {
  return game.players.filter((player) => player.status !== 'evicted' && player.status !== 'jury')
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
  if (!isDepressionShockActive(game) || previousPhase === game.phase || game.phase !== 'social_1') {
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
 * Scheduling/presentation live in DepressionShockController. Social interaction
 * refusal/reversal is resolved once in SocialManeuvers against the controller's
 * derived compatibility mirror; this middleware owns only strategic ceremony
 * distortion and phase-triggered surprise moments.
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
