import type { Dispatch, Middleware, UnknownAction } from '@reduxjs/toolkit'
import type { GameState } from '../types'
import { addTvEvent } from '../store/gameSlice'
import type { CompetitionIntent } from './intelligenceSystem'
import {
  buildIntelFactFromSocialAction,
  formatFauxTvWhisper,
  makeIntelMemory,
  selectDiscoverableFact,
  selectFauxTvFact,
} from './intelligenceSystem'
import { learnRealityKnowledge, recordIntelligenceDelivery, recordRealityFact } from './socialSlice'
import type { RealityFact, RealityMemorySource } from './reality/types'
import type { SocialActionLogEntry, SocialState } from './types'

const INTEL_ACTIONS = new Set(['observe', 'read_the_room', 'snoop_around', 'eavesdrop'])
const SAFE_TV_PHASES = new Set(['social_1', 'social_2'])
type IntelligenceApi = { dispatch: Dispatch<UnknownAction> }
type IntelligenceRootState = {
  game: GameState
  social: SocialState
  challenge: {
    history: Array<{ competitionIntents?: Record<string, CompetitionIntent> }>
  }
}

function hash(source: string): number {
  let value = 2166136261
  for (const character of source) {
    value ^= character.charCodeAt(0)
    value = Math.imul(value, 16777619)
  }
  return value >>> 0
}

function isSocialSeason(state: IntelligenceRootState): boolean {
  return state.game.mode !== 'survival'
}

function learnFact(
  api: IntelligenceApi,
  fact: RealityFact,
  ownerId: string,
  sourceType: RealityMemorySource,
  sourceChain: string[],
  confidence: number,
  day: number,
  phase: string
) {
  api.dispatch(
    learnRealityKnowledge({
      ownerId,
      factId: fact.id,
      confidence,
      memory: makeIntelMemory({
        ownerId,
        fact,
        sourceType,
        sourceChain,
        confidence,
        day,
        phase,
      }),
    })
  )
}

function recordSocialFact(
  api: IntelligenceApi,
  state: IntelligenceRootState,
  entry: SocialActionLogEntry
) {
  const fact = buildIntelFactFromSocialAction(entry, state.game.players, state.game.phase)
  if (!fact || state.social.reality.facts[fact.id]) return
  api.dispatch(recordRealityFact(fact))
  for (const participantId of fact.participantIds) {
    learnFact(api, fact, participantId, 'DIRECT', [entry.actorId], 0.94, fact.day, fact.phase)
  }
  for (const witnessId of fact.witnessIds) {
    learnFact(api, fact, witnessId, 'WITNESSED', [entry.actorId], 0.8, fact.day, fact.phase)
  }
}

function revealFactFromIntelAction(
  api: IntelligenceApi,
  state: IntelligenceRootState,
  entry: SocialActionLogEntry
) {
  if (
    entry.source !== 'manual' ||
    entry.outcome !== 'success' ||
    !INTEL_ACTIONS.has(entry.actionId) ||
    (entry.week ?? state.game.week) < 3
  ) {
    return
  }
  const day = entry.week ?? state.game.week
  const privateDeliveriesToday = (state.social.intelligenceDeliveries ?? []).filter(
    (item) =>
      item.day === day &&
      item.recipientId === entry.actorId &&
      (item.channel === 'social_action' || item.channel === 'incoming')
  ).length
  if (privateDeliveriesToday >= 2) return
  const delivered = new Set(
    (state.social.intelligenceDeliveries ?? [])
      .filter((item) => item.channel === 'social_action' && item.recipientId === entry.actorId)
      .map((item) => item.factId)
  )
  const fact = selectDiscoverableFact(
    state.social.reality,
    entry.actorId,
    day,
    delivered,
    entry.actionId === 'observe' || entry.actionId === 'read_the_room'
  )
  if (!fact) return
  const sourceType: RealityMemorySource =
    entry.actionId === 'snoop_around'
      ? 'WITNESSED'
      : entry.actionId === 'eavesdrop'
        ? 'HEARSAY'
        : 'INFERRED'
  const confidence =
    entry.actionId === 'snoop_around' ? 0.8 : entry.actionId === 'eavesdrop' ? 0.6 : 0.66
  learnFact(
    api,
    fact,
    entry.actorId,
    sourceType,
    sourceType === 'HEARSAY' ? fact.witnessIds.slice(0, 1) : [entry.actorId],
    confidence,
    day,
    entry.phase ?? state.game.phase
  )
  api.dispatch(
    recordIntelligenceDelivery({
      id: `intel-delivery:action:${entry.actorId}:${fact.id}`,
      factId: fact.id,
      channel: 'social_action',
      day,
      recipientId: entry.actorId,
    })
  )
}

function recordCompetitionSuspicion(
  api: IntelligenceApi,
  state: IntelligenceRootState,
  payload: {
    competitionIntents?: Record<string, CompetitionIntent>
    gameKey?: string
  }
) {
  if (!payload.competitionIntents || state.game.week < 3) return
  const activePlayers = state.game.players.filter(
    (player) => player.status !== 'evicted' && player.status !== 'jury'
  )
  for (const [playerId, intent] of Object.entries(payload.competitionIntents)) {
    if (intent !== 'throw') continue
    const historicalThrows = state.challenge.history.filter(
      (run) => run.competitionIntents?.[playerId] === 'throw'
    ).length
    if (historicalThrows < 2) continue
    const alreadyExists = Object.values(state.social.reality.facts).some(
      (fact) =>
        fact.propositionType === 'COMPETITION_THROW_SUSPICION' && fact.subjectIds.includes(playerId)
    )
    if (alreadyExists) continue

    const witnesses = activePlayers
      .filter((player) => player.id !== playerId)
      .sort(
        (left, right) =>
          hash(`${state.game.seed}:${state.game.week}:${playerId}:${left.id}`) -
          hash(`${state.game.seed}:${state.game.week}:${playerId}:${right.id}`)
      )
      .slice(0, 2)
      .map((player) => player.id)
    const fact: RealityFact = {
      id: `fact:intel:competition-throw:${playerId}:${state.game.week}`,
      propositionType: 'COMPETITION_THROW_SUSPICION',
      subjectIds: [playerId],
      objectId: payload.gameKey,
      value: historicalThrows,
      day: state.game.week,
      phase: state.game.phase,
      visibility: 'GROUP_VISIBLE',
      participantIds: [playerId],
      witnessIds: witnesses,
      viewerVisible: false,
      publicVisible: false,
      juryVisible: false,
      sourceEventId: `competition-pattern:${playerId}:${state.game.week}`,
    }
    api.dispatch(recordRealityFact(fact))
    for (const witnessId of witnesses) {
      learnFact(
        api,
        fact,
        witnessId,
        'INFERRED',
        [witnessId],
        0.66,
        state.game.week,
        state.game.phase
      )
    }
  }
}

function maybeBroadcastWhisper(
  api: IntelligenceApi,
  before: IntelligenceRootState,
  state: IntelligenceRootState
) {
  if (
    !isSocialSeason(state) ||
    state.game.week < 4 ||
    before.game.phase === state.game.phase ||
    !SAFE_TV_PHASES.has(state.game.phase)
  ) {
    return
  }
  if (
    (state.social.intelligenceDeliveries ?? []).some(
      (item) => item.channel === 'faux_tv' && item.day === state.game.week
    )
  ) {
    return
  }
  const deliveredFactIds = new Set(
    (state.social.intelligenceDeliveries ?? [])
      .filter((item) => item.channel === 'faux_tv')
      .map((item) => item.factId)
  )
  const fact = selectFauxTvFact(state.social.reality, state.game.week, deliveredFactIds)
  if (!fact) return
  const activeIds = new Set(
    state.game.players
      .filter((player) => player.status !== 'evicted' && player.status !== 'jury')
      .map((player) => player.id)
  )
  if (
    fact.subjectIds.some((id) => !activeIds.has(id)) ||
    (fact.propositionType === 'TARGETING' && fact.objectId && !activeIds.has(fact.objectId))
  ) {
    return
  }

  api.dispatch(
    addTvEvent({
      text: formatFauxTvWhisper(fact, state.game.players),
      type: 'social',
      source: 'system',
      channels: ['tv', 'mainLog'],
      meta: {
        forceOnTv: true,
        broadcastLevel: 'minor',
        broadcastOrder: 9500,
        intelligenceFactId: fact.id,
        week: state.game.week,
        phase: state.game.phase,
      },
    })
  )
  api.dispatch(
    recordIntelligenceDelivery({
      id: `intel-delivery:tv:${state.game.week}:${fact.id}`,
      factId: fact.id,
      channel: 'faux_tv',
      day: state.game.week,
    })
  )
}

export const intelligenceMiddleware: Middleware = (api) => (next) => (action) => {
  if (typeof action !== 'object' || action === null || !('type' in action)) return next(action)
  const before = api.getState() as IntelligenceRootState
  const result = next(action)
  const state = api.getState() as IntelligenceRootState
  if (!isSocialSeason(state)) return result

  const type = (action as { type: string }).type
  if (type === 'social/recordSocialAction') {
    const entry = (action as unknown as { payload: { entry: SocialActionLogEntry } }).payload.entry
    recordSocialFact(api, state, entry)
    const latest = api.getState() as IntelligenceRootState
    revealFactFromIntelAction(api, latest, entry)
  } else if (type === 'game/applyCompetitionSeasonUpdate') {
    recordCompetitionSuspicion(
      api,
      state,
      (
        action as unknown as {
          payload: { competitionIntents?: Record<string, CompetitionIntent>; gameKey?: string }
        }
      ).payload
    )
  }

  maybeBroadcastWhisper(api, before, api.getState() as IntelligenceRootState)
  return result
}
