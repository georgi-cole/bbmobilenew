import { applyRealityRelationshipDelta, pushIncomingInteraction } from './socialSlice'
import { maybeSpreadStrategyMisinformation } from './socialStrategyDeception'
import {
  activeStrategyPlayers,
  isActiveStrategyNemesis,
  seededUnit,
  sortScoredPlayers,
  strategyAffinity,
  strategyHumanPlayer,
  strategyTags,
  type BehaviorPressure,
  type DayEndPlan,
  type StrategyApi,
  type StrategyState,
} from './socialStrategyShared'

const MIN_STRATEGY_DAY = 3
const COMPETITION_EXIT_THRESHOLD = 3
const QUIET_STREAK_THRESHOLD = 2
const STRATEGY_WARNING_COOLDOWN_DAYS = 2
const MAX_OBSERVERS = 3

function manualActionCountForDay(
  state: StrategyState,
  humanId: string,
  day: number
): number {
  const history = state.social.actionHistory ?? state.social.sessionLogs ?? []
  return history.filter(
    (entry) =>
      entry.actorId === humanId &&
      entry.source !== 'system' &&
      (entry.week ?? state.game.week) === day
  ).length
}

function getQuietStreak(state: StrategyState, humanId: string): number {
  let streak = 0
  for (let day = state.game.week; day >= 1 && streak < 5; day -= 1) {
    if (manualActionCountForDay(state, humanId, day) > 0) break
    streak += 1
  }
  return streak
}

function getPartialExitCount(state: StrategyState, humanId: string): number {
  return (state.challenge?.history ?? []).filter(
    (run) => run.partial === true && (run.participants ?? []).includes(humanId)
  ).length
}

export function deriveBehaviorPressure(input: {
  partialExitCount: number
  quietStreak: number
}): BehaviorPressure {
  const exitPressure =
    input.partialExitCount >= COMPETITION_EXIT_THRESHOLD
      ? Math.min(3, input.partialExitCount - COMPETITION_EXIT_THRESHOLD + 1)
      : 0
  const quietPressure =
    input.quietStreak >= QUIET_STREAK_THRESHOLD
      ? Math.min(3, input.quietStreak - QUIET_STREAK_THRESHOLD + 1)
      : 0
  return {
    partialExitCount: input.partialExitCount,
    quietStreak: input.quietStreak,
    exitPressure,
    quietPressure,
    total: exitPressure + quietPressure,
  }
}

function chooseSuspicionObservers(
  state: StrategyState,
  humanId: string,
  count: number
) {
  return activeStrategyPlayers(state)
    .filter((player) => player.id !== humanId && !player.isUser)
    .map((player) => {
      const tags = strategyTags(state, player.id, humanId)
      let score = -strategyAffinity(state, player.id, humanId)
      if (isActiveStrategyNemesis(state, player.id, humanId)) score += 90
      if (tags.has('target')) score += 50
      if (tags.has('rivalry')) score += 42
      if (tags.has('betrayal')) score += 35
      if (tags.has('alliance')) score -= 55
      score +=
        seededUnit(
          state.game.seed ?? 0,
          `social-strategy-observer:${state.game.week}:${player.id}`
        ) * 14
      return { player, score }
    })
    .sort(sortScoredPlayers)
    .slice(0, count)
    .map((entry) => entry.player)
}

function applyBehaviorPressure(
  api: StrategyApi,
  state: StrategyState,
  humanId: string,
  pressure: BehaviorPressure
): string[] {
  if (pressure.total <= 0) return []

  const observerCount = Math.min(
    MAX_OBSERVERS,
    1 + Math.floor((pressure.total - 1) / 2)
  )
  const observers = chooseSuspicionObservers(state, humanId, observerCount)
  for (const observer of observers) {
    const edge = state.social.reality?.relationships?.[observer.id]?.[humanId]
    if ((edge?.suspicion ?? 0) >= 78) continue
    api.dispatch(
      applyRealityRelationshipDelta({
        sourceId: observer.id,
        targetId: humanId,
        day: state.game.week,
        phase: state.game.phase,
        eventId: `social-strategy:behavior:${state.game.week}:${observer.id}:${humanId}`,
        meaningful: false,
        deltas: {
          suspicion: 5 + pressure.total * 2,
          perceivedThreat: 1 + pressure.total,
          trust: -Math.min(5, pressure.total + pressure.exitPressure),
          reliability:
            pressure.exitPressure > 0 ? -Math.min(6, pressure.exitPressure * 2) : 0,
          warmth: pressure.quietPressure > 0 ? -Math.min(3, pressure.quietPressure) : 0,
        },
      })
    )
  }
  return observers.map((observer) => observer.id)
}

function warningText(pressure: BehaviorPressure): string {
  if (pressure.exitPressure > 0 && pressure.quietPressure > 0) {
    return "People are starting to connect the dots: leaving competitions early and keeping your distance looks deliberate. I thought you should know before 'secret agenda' becomes the easy story about you."
  }
  if (pressure.exitPressure > 0) {
    return "A few people have noticed how often you've left competitions early. They're starting to wonder whether you're hiding your real level."
  }
  return "You've been hard to read lately. Some people are starting to call it a secret agenda instead of a quiet game."
}

function maybeQueueBehaviorWarning(
  api: StrategyApi,
  state: StrategyState,
  humanId: string,
  pressure: BehaviorPressure
): void {
  if (pressure.total < 2) return

  const hasRecentWarning = (state.social.incomingInteractions ?? []).some(
    (interaction) =>
      interaction.payload?.source === 'social_strategy_warning' &&
      interaction.createdWeek >=
        Math.max(1, state.game.week - STRATEGY_WARNING_COOLDOWN_DAYS + 1)
  )
  if (hasRecentWarning) return

  const source = activeStrategyPlayers(state)
    .filter((player) => player.id !== humanId && !player.isUser)
    .filter((player) => {
      const tags = strategyTags(state, player.id, humanId)
      return !tags.has('target') && !tags.has('rivalry') && !tags.has('betrayal')
    })
    .map((player) => ({
      player,
      score: strategyAffinity(state, player.id, humanId),
    }))
    .filter((entry) => entry.score >= 15)
    .sort(sortScoredPlayers)[0]?.player
  if (!source) return

  api.dispatch(
    pushIncomingInteraction({
      id: `social-strategy-warning:${state.game.week}:${source.id}:${humanId}`,
      fromId: source.id,
      type: 'warning',
      text: warningText(pressure),
      payload: {
        source: 'social_strategy_warning',
        scenarioKey: 'betrayal_warning',
        partialExitCount: pressure.partialExitCount,
        quietStreak: pressure.quietStreak,
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

export function processSocialStrategyDayEnd(
  api: StrategyApi,
  state: StrategyState
): DayEndPlan | null {
  const human = strategyHumanPlayer(state)
  if (!human || state.game.mode === 'survival' || state.game.week < MIN_STRATEGY_DAY) {
    return null
  }
  if (activeStrategyPlayers(state).length <= 3) return null

  const pressure = deriveBehaviorPressure({
    partialExitCount: getPartialExitCount(state, human.id),
    quietStreak: getQuietStreak(state, human.id),
  })
  const observerIds = applyBehaviorPressure(api, state, human.id, pressure)
  maybeQueueBehaviorWarning(api, state, human.id, pressure)
  const misinformationListenerIds = maybeSpreadStrategyMisinformation(api, state, human.id)
  return { pressure, observerIds, misinformationListenerIds }
}
