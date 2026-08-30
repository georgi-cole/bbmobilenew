import type { Middleware, MiddlewareAPI } from '@reduxjs/toolkit'
import type { GameState, Player } from '../types'
import type { SurvivorModeState } from './modeTypes'
import { advance, consumeForcedShock, hydrateGame } from '../store/gameSlice'
import { getDefaultCompetitionSeasonState } from '../ai/competition'
import { drainEvictedPlayerSocial } from '../social/socialSlice'
import {
  buildReplacementRobo,
  createSurvivorModeState,
  isSurvivorHumanEliminated,
  isSurvivorRunTerminal,
  SURVIVOR_STARTING_CAST_SIZE,
  terminalizeSurvivorRun,
} from './survivorRun'
import { isSocialModeEnabled, shouldReplaceEvictedPlayers } from './gameModes'

const SURVIVOR_BLOCKED_SHOCK_ACTIONS = new Set([
  'game/activateBattleBack',
  'game/activateSpecialVeto',
  'game/activateDayStartShock',
  'game/activateDepressionShock',
  'game/activateDemocracia',
  'game/triggerSecretMission',
])

const SURVIVOR_BLOCKED_TERMINAL_ACTIONS = new Set([
  'game/advance',
  'game/finalizePendingEviction',
  'game/applyMinigameWinner',
  'game/applyF3MinigameWinner',
])

function isExited(player: Player | undefined): boolean {
  return player?.status === 'evicted' || player?.status === 'jury'
}

function isTerminalActionBlocked(actionType?: string): boolean {
  return Boolean(
    actionType &&
    (SURVIVOR_BLOCKED_TERMINAL_ACTIONS.has(actionType) || actionType.startsWith('challenge/'))
  )
}

function needsSurvivorTerminalHydration(game: GameState): boolean {
  return (
    isSurvivorHumanEliminated(game) &&
    (game.status !== 'failed' ||
      game.pendingEviction != null ||
      game.voteResults != null ||
      game.awaitingHumanVote === true ||
      game.awaitingTieBreak === true ||
      game.replacementNeeded === true ||
      game.awaitingNominations === true ||
      game.awaitingPovDecision === true ||
      game.awaitingPovSaveTarget === true ||
      game.pendingMinigame != null ||
      game.minigameResult != null ||
      game.awaitingFinal3Eviction === true ||
      game.awaitingFinal3Plea === true ||
      game.dayStartShock != null)
  )
}

function clearPendingChallenge(storeApi: MiddlewareAPI) {
  const state = storeApi.getState() as { challenge?: { pending?: unknown } }
  if (state.challenge?.pending != null) {
    storeApi.dispatch({ type: 'challenge/setPendingChallenge', payload: null })
  }
}

function getSurvivorState(game: GameState): SurvivorModeState {
  return game.modeSpecific?.kind === 'survival'
    ? game.modeSpecific
    : createSurvivorModeState(SURVIVOR_STARTING_CAST_SIZE)
}

function withSurvivorCompetitionState(
  game: GameState,
  players: Player[]
): GameState['competitionSeasonStateByPlayerId'] {
  const previous = game.competitionSeasonStateByPlayerId ?? {}
  return Object.fromEntries(
    players.map((player) => [player.id, previous[player.id] ?? getDefaultCompetitionSeasonState()])
  )
}

function normalizeSurvivorPlayer(player: Player, slot: number, currentDay: number): Player {
  if (player.isUser) {
    return {
      ...player,
      status: isExited(player) ? player.status : 'active',
      isUser: true,
      isRobo: false,
      survivorEntryDay: player.survivorEntryDay ?? 1,
      survivorSlot: 0,
    }
  }

  return {
    ...player,
    status: 'active',
    isRobo: true,
    survivorEntryDay: player.survivorEntryDay ?? currentDay,
    survivorSlot: player.survivorSlot ?? slot,
    stats: player.stats ?? { lohWins: 0, posWins: 0, timesNominated: 0 },
  }
}

function withNormalizedSurvivorCast(game: GameState): GameState | null {
  if (game.mode !== 'survival' || isSurvivorRunTerminal(game)) return null

  const modeSpecific = getSurvivorState(game)
  // During the deliberate eviction pause, preserve the evicted robo in its
  // original roster slot. Play commits the queued synthetic replacement.
  if (modeSpecific.replacementPending) return null
  const currentDay = Math.max(modeSpecific.currentDay, game.week)
  const human = game.players.find((player) => player.isUser)
  if (!human) return terminalizeSurvivorRun(game)

  const targetRoboCount = SURVIVOR_STARTING_CAST_SIZE - 1
  const activeRobos = game.players.filter((player) => !player.isUser && !isExited(player))
  const keptRobos = activeRobos
    .slice(0, targetRoboCount)
    .map((player, index) => normalizeSurvivorPlayer(player, index + 1, currentDay))

  let nextRoboIndex = Math.max(modeSpecific.nextRoboIndex, targetRoboCount)
  while (keptRobos.length < targetRoboCount) {
    const replacement = buildReplacementRobo(
      {
        ...game,
        modeSpecific: {
          ...modeSpecific,
          currentDay,
          startingCastSize: SURVIVOR_STARTING_CAST_SIZE,
          nextRoboIndex,
        },
      },
      keptRobos.length + 1
    )
    keptRobos.push(replacement)
    nextRoboIndex += 1
  }

  const players = [normalizeSurvivorPlayer(human, 0, currentDay), ...keptRobos]
  const validIds = new Set(players.map((player) => player.id))
  const normalizedModeSpecific: SurvivorModeState = {
    ...modeSpecific,
    currentDay,
    bestDayReached: Math.max(modeSpecific.bestDayReached, currentDay),
    startingCastSize: SURVIVOR_STARTING_CAST_SIZE,
    nextRoboIndex,
  }

  const unchanged =
    game.players.length === players.length &&
    game.players.every((player, index) => player.id === players[index]?.id) &&
    modeSpecific.startingCastSize === SURVIVOR_STARTING_CAST_SIZE &&
    modeSpecific.nextRoboIndex === nextRoboIndex &&
    modeSpecific.currentDay === currentDay &&
    game.players.every((player) => player.survivorEntryDay != null && player.survivorSlot != null)

  if (unchanged) return null

  return {
    ...game,
    players,
    lohId: game.lohId && validIds.has(game.lohId) ? game.lohId : null,
    prevHohId: game.prevHohId && validIds.has(game.prevHohId) ? game.prevHohId : null,
    posWinnerId: game.posWinnerId && validIds.has(game.posWinnerId) ? game.posWinnerId : null,
    nomineeIds: game.nomineeIds.filter((id) => validIds.has(id)),
    povProtectedIds: game.povProtectedIds?.filter((id) => validIds.has(id)) ?? [],
    competitionSeasonStateByPlayerId: withSurvivorCompetitionState(game, players),
    modeSpecific: normalizedModeSpecific,
    lastPlayedAt: Date.now(),
  }
}

function withReplacementIfNeeded(game: GameState, evicteeId: string): GameState | null {
  if (
    game.mode !== 'survival' ||
    isSurvivorRunTerminal(game) ||
    !shouldReplaceEvictedPlayers(game.mode)
  )
    return null
  const evicteeIndex = game.players.findIndex((player) => player.id === evicteeId)
  const evictee = evicteeIndex >= 0 ? game.players[evicteeIndex] : undefined
  if (!evictee || !isExited(evictee) || evictee.isUser) return null

  const modeSpecific = getSurvivorState(game)
  const activeCastSize = game.players.filter((player) => !isExited(player)).length
  if (activeCastSize >= SURVIVOR_STARTING_CAST_SIZE) return null

  const replacementSlot = evictee?.survivorSlot ?? evicteeIndex
  const replacement = buildReplacementRobo(game, replacementSlot)
  const nextCompetitionState = {
    ...(game.competitionSeasonStateByPlayerId ?? {}),
    [replacement.id]: getDefaultCompetitionSeasonState(),
  }
  const currentDay = Math.max(modeSpecific.currentDay, game.week)
  const startedAt = Date.now()
  const obsoleteEvictionIds = new Set(
    game.tvFeed
      .filter(
        (event) =>
          event.meta?.phase === game.phase &&
          event.meta?.week === game.week &&
          event.text.includes(evictee.name) &&
          event.text.includes('eliminated from The Big Eye')
      )
      .map((event) => event.id)
  )
  const tvFeed = game.tvFeed.map((event) =>
    obsoleteEvictionIds.has(event.id)
      ? { ...event, meta: { ...(event.meta ?? {}), broadcastConsumed: true } }
      : event
  )

  return {
    ...game,
    competitionSeasonStateByPlayerId: nextCompetitionState,
    modeSpecific: {
      ...modeSpecific,
      currentDay,
      bestDayReached: Math.max(modeSpecific.bestDayReached, currentDay),
      startingCastSize: SURVIVOR_STARTING_CAST_SIZE,
      nextRoboIndex: modeSpecific.nextRoboIndex + 1,
      replacementPending: {
        mode: 'survival',
        outgoingPlayerSnapshot: { ...evictee, status: 'evicted' },
        incomingPlayer: replacement,
        slot: replacementSlot,
        queuedAt: startedAt,
      },
      replacementTransition: null,
    },
    lastPlayedAt: startedAt,
    tvFeed,
    broadcastQueue: (game.broadcastQueue ?? []).filter((id) => !obsoleteEvictionIds.has(id)),
    lastPlainBroadcastEventId:
      game.lastPlainBroadcastEventId && obsoleteEvictionIds.has(game.lastPlainBroadcastEventId)
        ? null
        : game.lastPlainBroadcastEventId,
  }
}

function withSurvivorDaySync(game: GameState): GameState | null {
  if (game.mode !== 'survival' || isSurvivorRunTerminal(game)) return null
  const modeSpecific = getSurvivorState(game)
  const currentDay = Math.max(modeSpecific.currentDay, game.week)
  const bestDayReached = Math.max(modeSpecific.bestDayReached, currentDay)
  if (
    currentDay === modeSpecific.currentDay &&
    bestDayReached === modeSpecific.bestDayReached &&
    modeSpecific.startingCastSize === SURVIVOR_STARTING_CAST_SIZE
  )
    return null
  return {
    ...game,
    modeSpecific: {
      ...modeSpecific,
      startingCastSize: SURVIVOR_STARTING_CAST_SIZE,
      currentDay,
      bestDayReached,
    },
    lastPlayedAt: Date.now(),
  }
}

function drainSurvivorSocial(storeApi: MiddlewareAPI, game: GameState, actionType?: string) {
  if (actionType === drainEvictedPlayerSocial.type) return
  const humanPlayer = game.players.find((player) => player.isUser)
  if (!humanPlayer) return
  storeApi.dispatch(drainEvictedPlayerSocial({ playerId: humanPlayer.id, week: game.week }))
}

export const survivorMiddleware: Middleware = (storeApi) => (next) => (action) => {
  const typedAction = action as { type?: string; payload?: unknown }
  const stateBefore = storeApi.getState() as { game: GameState }

  if (
    stateBefore.game.mode === 'survival' &&
    isSurvivorRunTerminal(stateBefore.game) &&
    isTerminalActionBlocked(typedAction.type)
  ) {
    if (needsSurvivorTerminalHydration(stateBefore.game)) {
      storeApi.dispatch(hydrateGame(terminalizeSurvivorRun(stateBefore.game)))
    }
    clearPendingChallenge(storeApi)
    return undefined
  }

  if (
    stateBefore.game.mode === 'survival' &&
    typedAction.type?.startsWith('social/') &&
    typedAction.type !== drainEvictedPlayerSocial.type
  ) {
    return undefined
  }

  if (
    stateBefore.game.mode === 'survival' &&
    typedAction.type &&
    SURVIVOR_BLOCKED_SHOCK_ACTIONS.has(typedAction.type)
  ) {
    if (
      stateBefore.game.pendingForcedShock?.type &&
      stateBefore.game.pendingForcedShock.type !== 'doubleEviction'
    ) {
      storeApi.dispatch(consumeForcedShock())
    }
    return undefined
  }

  const result = next(action)
  const stateAfter = storeApi.getState() as { game: GameState }
  const game = stateAfter.game

  if (game.mode !== 'survival') return result

  if (isSurvivorHumanEliminated(game)) {
    if (needsSurvivorTerminalHydration(game)) {
      storeApi.dispatch(hydrateGame(terminalizeSurvivorRun(game)))
    }
    clearPendingChallenge(storeApi)
    return result
  }

  if (isSurvivorRunTerminal(game)) {
    clearPendingChallenge(storeApi)
    return result
  }

  drainSurvivorSocial(storeApi, game, typedAction.type)

  if (
    typedAction.type === 'game/finalizePendingEviction' &&
    typeof typedAction.payload === 'string'
  ) {
    const nextGame = withReplacementIfNeeded(game, typedAction.payload)
    if (nextGame) {
      storeApi.dispatch(hydrateGame(nextGame))
      return result
    }
  }

  const normalized = withNormalizedSurvivorCast((storeApi.getState() as { game: GameState }).game)
  if (normalized) {
    storeApi.dispatch(hydrateGame(normalized))
    return result
  }

  if (typedAction.type === 'game/advance') {
    const advanced = (storeApi.getState() as { game: GameState }).game
    if (
      !isSocialModeEnabled(advanced.mode) &&
      (advanced.phase === 'social_1' || advanced.phase === 'social_2')
    ) {
      storeApi.dispatch(advance())
      return result
    }

    const synced = withSurvivorDaySync(advanced)
    if (synced) storeApi.dispatch(hydrateGame(synced))
  }

  return result
}
