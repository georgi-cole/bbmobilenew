import type { GameState, Player } from '../../types'

export const DEPRESSION_SHOCK_ROLL_DAY = 7
export const DEPRESSION_SHOCK_LAST_ROLL_DAY = 10
export const DEPRESSION_SHOCK_CHANCE = 0.25
export const DEPRESSION_SHOCK_DURATION_DAYS = 2
export const DEPRESSION_SHOCK_MIN_ACTIVE_PLAYERS = 6
export const DEPRESSION_SHOCK_INTERACTION_FLIP_CHANCE = 0.5
export const DEPRESSION_SHOCK_TALK_REFUSAL_CHANCE = 0.18
export const DEPRESSION_SHOCK_RANDOM_FIGHT_CHANCE = 0.32
export const DEPRESSION_SHOCK_SURPRISE_DECISION_CHANCE = 0.35

const STORAGE_PREFIX = 'bbmobilenew:depressionShock:'

export type DepressionShockStatus = 'unrolled' | 'failed' | 'queued' | 'active' | 'completed'
export type DepressionShockVisualPhase = 'inactive' | 'day1' | 'day2' | 'sunbreak'
export type DepressionShockPortraitMode = 'normal' | 'sad'
export type DepressionShockPresentation = 'intro' | 'day2' | 'ending' | null

export interface DepressionShockState {
  version: 1
  gameId: string
  status: DepressionShockStatus
  rollDay: number
  lastRollDay: number | null
  rollPassed: boolean | null
  queuedDay: number | null
  activatedDay: number | null
  completedDay: number | null
  failureReason: string | null
  introSeen: boolean
  day2Seen: boolean
  endingSeen: boolean
  behaviorCounters: Record<string, number>
  stableRolls: Record<string, boolean>
  fightDays: number[]
}

export interface DepressionShockDayContext {
  gameId: string
  seed: number
  week: number
  eligibleMode: boolean
  activePlayerCount: number
  conflict: boolean
}

export interface DepressionShockEvaluation {
  state: DepressionShockState
  event: 'none' | 'rolled_failed' | 'queued' | 'activated' | 'cancelled'
}

type Subscriber = () => void

let visualPhase: DepressionShockVisualPhase = 'inactive'
const visualSubscribers = new Set<Subscriber>()
let portraitMode: DepressionShockPortraitMode = 'normal'
const portraitSubscribers = new Set<Subscriber>()
const memoryState = new Map<string, DepressionShockState>()

function storageKey(gameId: string): string {
  return `${STORAGE_PREFIX}${gameId}`
}

function hashText(value: string): number {
  let hash = 2166136261
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return hash >>> 0
}

export function depressionShockUnitRoll(value: string): number {
  return hashText(value) / 0x1_0000_0000
}

export function createInitialDepressionShockState(gameId: string): DepressionShockState {
  return {
    version: 1,
    gameId,
    status: 'unrolled',
    rollDay: DEPRESSION_SHOCK_ROLL_DAY,
    lastRollDay: null,
    rollPassed: null,
    queuedDay: null,
    activatedDay: null,
    completedDay: null,
    failureReason: null,
    introSeen: false,
    day2Seen: false,
    endingSeen: false,
    behaviorCounters: {},
    stableRolls: {},
    fightDays: [],
  }
}

function normalizeState(raw: Partial<DepressionShockState>, gameId: string): DepressionShockState {
  const base = createInitialDepressionShockState(gameId)
  return {
    ...base,
    ...raw,
    version: 1,
    gameId,
    rollDay: DEPRESSION_SHOCK_ROLL_DAY,
    behaviorCounters:
      raw.behaviorCounters && typeof raw.behaviorCounters === 'object' ? raw.behaviorCounters : {},
    stableRolls: raw.stableRolls && typeof raw.stableRolls === 'object' ? raw.stableRolls : {},
    fightDays: Array.isArray(raw.fightDays)
      ? raw.fightDays.filter((day): day is number => Number.isFinite(day))
      : [],
  }
}

export function loadDepressionShockState(gameId: string): DepressionShockState {
  const cached = memoryState.get(gameId)
  if (cached) return cached

  if (typeof window !== 'undefined') {
    try {
      const raw = window.localStorage.getItem(storageKey(gameId))
      if (raw) {
        const parsed = JSON.parse(raw) as Partial<DepressionShockState>
        const normalized = normalizeState(parsed, gameId)
        memoryState.set(gameId, normalized)
        return normalized
      }
    } catch {
      // A broken optional twist record must never stop the campaign from loading.
    }
  }

  const initial = createInitialDepressionShockState(gameId)
  memoryState.set(gameId, initial)
  return initial
}

export function saveDepressionShockState(state: DepressionShockState): DepressionShockState {
  const normalized = normalizeState(state, state.gameId)
  memoryState.set(state.gameId, normalized)
  if (typeof window !== 'undefined') {
    try {
      window.localStorage.setItem(storageKey(state.gameId), JSON.stringify(normalized))
    } catch {
      // Campaign play remains authoritative even if optional local persistence is unavailable.
    }
  }
  return normalized
}

/** Force the two-day sequence from the current day for explicit debug testing. */
export function activateDepressionShockForDebug(
  gameId: string,
  week: number
): DepressionShockState {
  return setDepressionShockStageForDebug(gameId, week, 'day1')
}

export function setDepressionShockStageForDebug(
  gameId: string,
  week: number,
  stage: 'day1' | 'day2' | 'recovery'
): DepressionShockState {
  const current = loadDepressionShockState(gameId)
  const activatedDay = stage === 'day1' ? week : stage === 'day2' ? week - 1 : week - 2
  return saveDepressionShockState({
    ...current,
    status: 'active',
    rollPassed: true,
    queuedDay: null,
    activatedDay,
    completedDay: null,
    failureReason: null,
    introSeen: stage !== 'day1',
    day2Seen: stage === 'recovery',
    endingSeen: false,
    behaviorCounters: {},
    stableRolls: {},
    fightDays: [],
  })
}

export function clearDepressionShockRuntimeForTests(gameId?: string): void {
  if (gameId) {
    memoryState.delete(gameId)
    if (typeof window !== 'undefined') window.localStorage.removeItem(storageKey(gameId))
    return
  }

  memoryState.clear()
}

export function isDepressionShockEligibleMode(
  game: Pick<GameState, 'mode' | 'expansionMode'>
): boolean {
  return (
    game.mode === 'classic' && (game.expansionMode == null || game.expansionMode === 'voxPopuli')
  )
}

export function getActiveDepressionShockPlayers(players: readonly Player[]): Player[] {
  return players.filter((player) => player.status !== 'evicted' && player.status !== 'jury')
}

/**
 * A Depression Shock occupies an entire day-start twist window. It gets one
 * independent 25% roll per day from Day 7 through Day 10, and a successful
 * roll waits rather than competing with an already scheduled/active shock.
 */
export function hasDepressionShockConflict(
  game: Pick<
    GameState,
    | 'twistActivatedThisWeek'
    | 'pendingForcedShock'
    | 'dayStartShock'
    | 'doubleEviction'
    | 'specialVeto'
    | 'democracia'
    | 'twinShock'
  >
): boolean {
  if (game.twistActivatedThisWeek === true) return true
  if (game.pendingForcedShock) return true
  if (game.dayStartShock) return true
  if (game.doubleEviction?.weekActive === true) return true
  if (game.specialVeto?.activeType != null) return true
  if (game.democracia?.active === true) return true
  if (game.twinShock?.promptStage) return true
  if (game.twinShock?.pendingRevealAnimation) return true
  return (
    game.twinShock?.status === 'day4_pending' ||
    game.twinShock?.status === 'day4_asked_no_correct_guess'
  )
}

export function buildDepressionShockDayContext(game: GameState): DepressionShockDayContext {
  return {
    gameId: game.gameId,
    seed: game.seed,
    week: game.week,
    eligibleMode: isDepressionShockEligibleMode(game),
    activePlayerCount: getActiveDepressionShockPlayers(game.players).length,
    conflict: hasDepressionShockConflict(game),
  }
}

/**
 * Pure scheduling rule. The probability is evaluated once per eligible day,
 * from Day 7 through Day 10. A passed roll can queue behind another shock;
 * a failed roll leaves the remaining daily window available.
 */
export function evaluateDepressionShockAtDayStart(
  current: DepressionShockState,
  context: DepressionShockDayContext,
  activationRoll = depressionShockUnitRoll(
    `${context.gameId}|${context.seed}|depression-shock|day-${context.week}`
  )
): DepressionShockEvaluation {
  if (
    current.status === 'completed' ||
    current.status === 'failed' ||
    current.status === 'active'
  ) {
    return { state: current, event: 'none' }
  }

  if (current.status === 'unrolled') {
    if (context.week < DEPRESSION_SHOCK_ROLL_DAY) return { state: current, event: 'none' }

    if (context.week > DEPRESSION_SHOCK_LAST_ROLL_DAY) {
      return {
        state: {
          ...current,
          status: 'failed',
          rollPassed: false,
          failureReason: 'roll_window_missed',
        },
        event: 'cancelled',
      }
    }

    // A day-start evaluation can be replayed by hydration or navigation.
    if (current.lastRollDay === context.week) return { state: current, event: 'none' }

    if (!context.eligibleMode) {
      return {
        state: {
          ...current,
          status: 'failed',
          rollPassed: false,
          failureReason: 'mode_not_eligible',
        },
        event: 'cancelled',
      }
    }

    if (context.activePlayerCount < DEPRESSION_SHOCK_MIN_ACTIVE_PLAYERS) {
      return {
        state: {
          ...current,
          status: 'failed',
          rollPassed: false,
          failureReason: 'not_enough_active_players_on_roll_day',
        },
        event: 'cancelled',
      }
    }

    const rollPassed = activationRoll < DEPRESSION_SHOCK_CHANCE
    if (!rollPassed) {
      return {
        state: {
          ...current,
          status: context.week === DEPRESSION_SHOCK_LAST_ROLL_DAY ? 'failed' : current.status,
          rollPassed: false,
          lastRollDay: context.week,
          failureReason:
            context.week === DEPRESSION_SHOCK_LAST_ROLL_DAY
              ? 'final_roll_failed'
              : 'daily_roll_failed',
        },
        event: context.week === DEPRESSION_SHOCK_LAST_ROLL_DAY ? 'cancelled' : 'rolled_failed',
      }
    }

    if (context.conflict) {
      return {
        state: {
          ...current,
          status: 'queued',
          rollPassed: true,
          queuedDay: context.week,
          failureReason: null,
        },
        event: 'queued',
      }
    }

    return {
      state: {
        ...current,
        status: 'active',
        rollPassed: true,
        queuedDay: context.week,
        activatedDay: context.week,
        failureReason: null,
      },
      event: 'activated',
    }
  }

  // A passed Day-5 roll waits for the first subsequent compatible free day.
  if (current.status === 'queued') {
    if (!context.eligibleMode) {
      return {
        state: { ...current, status: 'failed', failureReason: 'mode_no_longer_eligible' },
        event: 'cancelled',
      }
    }
    if (context.activePlayerCount < DEPRESSION_SHOCK_MIN_ACTIVE_PLAYERS) {
      return {
        state: {
          ...current,
          status: 'failed',
          failureReason: 'not_enough_players_before_activation',
        },
        event: 'cancelled',
      }
    }
    if (context.conflict) return { state: current, event: 'none' }

    return {
      state: {
        ...current,
        status: 'active',
        activatedDay: context.week,
        failureReason: null,
      },
      event: 'activated',
    }
  }

  return { state: current, event: 'none' }
}

export function isDepressionShockActiveOnDay(state: DepressionShockState, week: number): boolean {
  if (state.status !== 'active' || state.activatedDay == null) return false
  return week === state.activatedDay || week === state.activatedDay + 1
}

export function getDepressionShockPresentation(
  state: DepressionShockState,
  week: number,
  phase: string
): DepressionShockPresentation {
  if (state.status !== 'active' || state.activatedDay == null) return null
  if (week === state.activatedDay + 2 && phase === 'week_start' && !state.endingSeen)
    return 'ending'
  if (!isDepressionShockActiveOnDay(state, week)) return null
  if (week === state.activatedDay && !state.introSeen) return 'intro'
  if (week === state.activatedDay + 1 && !state.day2Seen) return 'day2'
  return null
}

export function getDepressionShockVisualPhase(
  state: DepressionShockState,
  week: number,
  _phase: string
): DepressionShockVisualPhase {
  if (state.status === 'completed' && state.completedDay === week) return 'sunbreak'
  if (state.status !== 'active' || state.activatedDay == null) return 'inactive'
  if (week === state.activatedDay + 2 && !state.endingSeen) return 'sunbreak'
  if (!isDepressionShockActiveOnDay(state, week)) return 'inactive'
  return week === state.activatedDay ? 'day1' : 'day2'
}

const DAY_ONE_MELANCHOLY = [
  'Rain keeps time against the glass, and nobody quite meets anyone’s eyes.',
  'The hub feels unusually quiet; even ordinary conversations trail into silence.',
  'Outside, the clouds hang low. Inside, every decision feels a little heavier.',
  'The storm lingers over the hub, softening voices and sharpening doubts.',
]

const DAY_TWO_MELANCHOLY = [
  'The colours are fading, and the long rain has made the hub feel smaller.',
  'Another grey hour passes; even small victories feel distant today.',
  'The windows are streaked with rain, and the players carry the same muted weight.',
  'Nothing feels quite bright enough today—not the lights, not the laughter, not the game.',
]

export function decorateDepressionShockFauxTvText(
  text: string,
  phase: DepressionShockVisualPhase,
  messageKey: string
): string {
  if (phase !== 'day1' && phase !== 'day2') return text
  const lines = phase === 'day1' ? DAY_ONE_MELANCHOLY : DAY_TWO_MELANCHOLY
  const suffix = lines[Math.floor(depressionShockUnitRoll(messageKey) * lines.length)]
  return `${text}\n\n${suffix}`
}

export function markDepressionShockPresentationSeen(
  current: DepressionShockState,
  presentation: Exclude<DepressionShockPresentation, null>,
  week: number
): DepressionShockState {
  if (presentation === 'intro') return saveDepressionShockState({ ...current, introSeen: true })
  if (presentation === 'day2') return saveDepressionShockState({ ...current, day2Seen: true })
  return saveDepressionShockState({
    ...current,
    endingSeen: true,
    status: 'completed',
    completedDay: week,
  })
}

export function isDepressionShockActive(game: Pick<GameState, 'gameId' | 'week'>): boolean {
  return isDepressionShockActiveOnDay(loadDepressionShockState(game.gameId), game.week)
}

function behaviorRollKey(state: DepressionShockState, week: number, namespace: string): string {
  return `${state.gameId}|${state.activatedDay ?? 'na'}|${week}|${namespace}`
}

/** Persistent sequential RNG used for per-interaction effects so reloads cannot reroll an outcome. */
export function consumeDepressionShockBehaviorChance(input: {
  gameId: string
  week: number
  namespace: string
  chance: number
}): boolean {
  const state = loadDepressionShockState(input.gameId)
  if (!isDepressionShockActiveOnDay(state, input.week)) return false
  const cursor = state.behaviorCounters[input.namespace] ?? 0
  const roll = depressionShockUnitRoll(
    `${behaviorRollKey(state, input.week, input.namespace)}|${cursor}`
  )
  saveDepressionShockState({
    ...state,
    behaviorCounters: {
      ...state.behaviorCounters,
      [input.namespace]: cursor + 1,
    },
  })
  return roll < Math.max(0, Math.min(1, input.chance))
}

/** Persistent one-shot RNG for a named decision on a named day. */
export function getDepressionShockStableChance(input: {
  gameId: string
  week: number
  namespace: string
  chance: number
}): boolean {
  const state = loadDepressionShockState(input.gameId)
  if (!isDepressionShockActiveOnDay(state, input.week)) return false
  const key = `${input.week}:${input.namespace}`
  const existing = state.stableRolls[key]
  if (typeof existing === 'boolean') return existing
  const passed =
    depressionShockUnitRoll(behaviorRollKey(state, input.week, input.namespace)) <
    Math.max(0, Math.min(1, input.chance))
  saveDepressionShockState({
    ...state,
    stableRolls: { ...state.stableRolls, [key]: passed },
  })
  return passed
}

export function shouldDepressionShockRefuseConversation(input: {
  gameId: string
  week: number
  actorId: string
  targetIds: readonly string[]
  actionId: string
}): boolean {
  if (input.targetIds.length === 0 || input.targetIds.every((id) => id === input.actorId))
    return false
  return consumeDepressionShockBehaviorChance({
    gameId: input.gameId,
    week: input.week,
    namespace: `talk-refusal:${input.actorId}:${input.actionId}:${[...input.targetIds].sort().join(',')}`,
    chance: DEPRESSION_SHOCK_TALK_REFUSAL_CHANCE,
  })
}

export function shouldDepressionShockFlipInteraction(gameId: string, week: number): boolean {
  return consumeDepressionShockBehaviorChance({
    gameId,
    week,
    namespace: 'interaction-flip',
    chance: DEPRESSION_SHOCK_INTERACTION_FLIP_CHANCE,
  })
}

export function shouldDepressionShockTriggerSurpriseDecision(
  gameId: string,
  week: number,
  kind: 'nomination' | 'safety'
): boolean {
  return getDepressionShockStableChance({
    gameId,
    week,
    namespace: `surprise-${kind}`,
    chance: DEPRESSION_SHOCK_SURPRISE_DECISION_CHANCE,
  })
}

export function consumeDepressionShockFightRoll(gameId: string, week: number): boolean {
  const state = loadDepressionShockState(gameId)
  if (!isDepressionShockActiveOnDay(state, week) || state.fightDays.includes(week)) return false
  const happens = getDepressionShockStableChance({
    gameId,
    week,
    namespace: 'random-fight',
    chance: DEPRESSION_SHOCK_RANDOM_FIGHT_CHANCE,
  })
  if (!happens) return false
  const fresh = loadDepressionShockState(gameId)
  saveDepressionShockState({ ...fresh, fightDays: [...new Set([...fresh.fightDays, week])] })
  return true
}

export function pickDepressionShockFightPair(
  gameId: string,
  week: number,
  playerIds: readonly string[]
): [string, string] | null {
  const ids = [...new Set(playerIds)].sort()
  if (ids.length < 2) return null
  const firstIndex = Math.floor(depressionShockUnitRoll(`${gameId}|${week}|fight-a`) * ids.length)
  const first = ids[firstIndex]
  const remaining = ids.filter((id) => id !== first)
  const secondIndex = Math.floor(
    depressionShockUnitRoll(`${gameId}|${week}|fight-b`) * remaining.length
  )
  return [first, remaining[secondIndex]]
}

/**
 * During a surprise ceremony, feed the existing AI scorer an intentionally
 * distorted view of its own relationships. This changes the real decision,
 * while keeping all normal eligibility and ceremony safeguards intact.
 */
export function invertStrategicRelationshipRow<T extends { affinity: number; tags?: string[] }>(
  relationships: Record<string, Record<string, T>>,
  actorId: string
): Record<string, Record<string, T>> {
  const row = relationships[actorId]
  if (!row) return relationships
  const invertedRow = Object.fromEntries(
    Object.entries(row).map(([targetId, entry]) => [
      targetId,
      {
        ...entry,
        affinity: -entry.affinity,
        tags: (entry.tags ?? []).filter(
          (tag) =>
            ![
              'alliance',
              'protection',
              'shield',
              'romance',
              'bromance',
              'target',
              'betrayal',
            ].includes(tag)
        ),
      },
    ])
  ) as Record<string, T>
  return { ...relationships, [actorId]: invertedRow }
}

export function buildDepressionShockAvatarCandidates(
  playerId: string,
  resolvedAvatarCandidates: readonly string[] = [],
  playerName = ''
): string[] {
  const base = import.meta.env.BASE_URL ?? '/'
  const prefix = base.endsWith('/') ? base : `${base}/`
  const sourceStems = resolvedAvatarCandidates.flatMap((candidate) => {
    const normalized = candidate.replace(/\\/g, '/')
    const match = normalized.match(
      /\/assets\/skins\/([^/?#]+)_avatar\.(?:png|webp|jpe?g|svg)(?:[?#].*)?$/i
    )
    return match?.[1] ? [decodeURIComponent(match[1])] : []
  })
  const nameStem = playerName.trim().replace(/\s+/g, '_')
  const stems = [...new Set([...sourceStems, nameStem, playerId].filter(Boolean))]

  return stems.flatMap((stem) => [
    `${prefix}assets/skins/${stem}_sad_avatar.png`,
    `${prefix}assets/skins/${stem}_sad_avatar.webp`,
    `${prefix}assets/skins/${stem}_depressed_avatar.webp`,
  ])
}

export function subscribeDepressionShockVisualPhase(listener: Subscriber): () => void {
  visualSubscribers.add(listener)
  return () => visualSubscribers.delete(listener)
}

export function getDepressionShockVisualSnapshot(): DepressionShockVisualPhase {
  return visualPhase
}

export function setDepressionShockVisualPhase(next: DepressionShockVisualPhase): void {
  if (visualPhase !== next) {
    visualPhase = next
    visualSubscribers.forEach((listener) => listener())
  }
  setDepressionShockPortraitMode(next === 'day1' || next === 'day2' ? 'sad' : 'normal')
}

export function subscribeDepressionShockPortraitMode(listener: Subscriber): () => void {
  portraitSubscribers.add(listener)
  return () => portraitSubscribers.delete(listener)
}

export function getDepressionShockPortraitSnapshot(): DepressionShockPortraitMode {
  return portraitMode
}

export function setDepressionShockPortraitMode(next: DepressionShockPortraitMode): void {
  if (portraitMode === next) return
  portraitMode = next
  portraitSubscribers.forEach((listener) => listener())
}
