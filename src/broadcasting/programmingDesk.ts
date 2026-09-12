import type { GameState, TvEvent } from '../types'
import type { SavedSeasonSnapshot } from '../store/saveStatePersistence'
import type { FauxTvEditorialCandidate } from './seasonDesk'

export const RESUME_RECAP_CATEGORY = 'programming_resume_recap'
export const BIG_EYE_PROGRAMMING_CATEGORY = 'big_eye_programming'
export const RESUME_RECAP_MIN_ABSENCE_MS = 6 * 60 * 60 * 1000

const NOMINATION_RECAP_PHASES = new Set([
  'nomination_results',
  'pre_veto_public_save',
  'pos_comp_announcement',
  'pos_comp',
  'pos_results',
  'pos_ceremony',
  'pos_ceremony_results',
  'social_2',
  'live_vote',
])

const SAFETY_RECAP_PHASES = new Set([
  'pos_results',
  'pos_ceremony',
  'pos_ceremony_results',
  'social_2',
  'live_vote',
])

function joinNames(names: string[]): string {
  if (names.length <= 1) return names[0] ?? ''
  if (names.length === 2) return `${names[0]} and ${names[1]}`
  return `${names.slice(0, -1).join(', ')}, and ${names[names.length - 1]}`
}

function getName(state: Pick<GameState, 'players'>, playerId: string | null | undefined): string | null {
  if (!playerId) return null
  return state.players.find((player) => player.id === playerId)?.name ?? null
}

function latestEvictee(state: Pick<GameState, 'players' | 'week'>): string | null {
  const latest = state.players
    .filter((player) => player.evictedAtWeek != null && player.evictedAtWeek <= state.week)
    .slice()
    .sort(
      (a, b) =>
        (b.evictedAtWeek ?? -1) - (a.evictedAtWeek ?? -1) || a.id.localeCompare(b.id, 'en')
    )[0]
  return latest?.name ?? null
}

function latestPublicTwist(history: readonly TvEvent[], week: number): TvEvent | null {
  return (
    history
      .filter(
        (candidate) =>
          candidate.type === 'twist' &&
          typeof candidate.text === 'string' &&
          candidate.text.trim().length > 0 &&
          candidate.meta?.week != null &&
          candidate.meta.week >= Math.max(1, week - 2) &&
          candidate.meta?.editorial?.sensitivity !== 'sensitive' &&
          candidate.meta?.editorial?.presentationMode !== 'log_only' &&
          (candidate.meta?.major != null ||
            candidate.major != null ||
            candidate.meta?.broadcastLevel === 'critical')
      )
      .slice()
      .sort((a, b) => b.timestamp - a.timestamp || a.id.localeCompare(b.id, 'en'))[0] ?? null
  )
}

function concisePublicTwist(history: readonly TvEvent[], week: number): string | null {
  const event = latestPublicTwist(history, week)
  if (!event) return null
  const compact = event.text.replace(/\s+/g, ' ').trim()
  return compact.length <= 105 ? compact : `${compact.slice(0, 102).trimEnd()}…`
}

function recapAlreadyShown(game: Pick<GameState, 'tvFeed'>, resumeKey: string): boolean {
  return game.tvFeed.some(
    (event) =>
      event.meta?.resumeRecapKey === resumeKey ||
      event.meta?.editorial?.storyKey === `resume:${resumeKey}`
  )
}

export interface ResumeRecapCandidate extends FauxTvEditorialCandidate {
  resumeKey: string
  facts: string[]
}

function buildResumeFacts(
  game: Pick<
    GameState,
    'phase' | 'week' | 'players' | 'tvFeed' | 'nomineeIds' | 'lohId' | 'posWinnerId'
  >
): string[] {
  const facts: string[] = []

  if (NOMINATION_RECAP_PHASES.has(game.phase) && game.nomineeIds.length > 0) {
    const nominees = game.nomineeIds
      .map((id) => getName(game, id))
      .filter((name): name is string => Boolean(name))
    if (nominees.length > 0) facts.push(`On the block: ${joinNames(nominees)}.`)
  }

  const lohName = getName(game, game.lohId)
  if (lohName) facts.push(`${lohName} holds LOH.`)

  const posName = getName(game, game.posWinnerId)
  if (posName && SAFETY_RECAP_PHASES.has(game.phase)) {
    facts.push(`${posName} won the Power of Safety.`)
  }

  const evictee = latestEvictee(game)
  if (evictee && facts.length < 3) facts.push(`${evictee} was the most recent player eliminated.`)

  const twist = concisePublicTwist(game.tvFeed, game.week)
  if (twist && facts.length < 3) facts.push(`Recent shock: ${twist}`)

  return facts.slice(0, 3)
}

/**
 * Builds a factual resume recap only from durable public game state/history.
 * Relationship, targeting, intelligence and hidden competition-intent data are
 * deliberately outside the accepted input surface.
 */
export function buildResumeRecapFromGame(
  game: Pick<
    GameState,
    'phase' | 'week' | 'players' | 'tvFeed' | 'nomineeIds' | 'lohId' | 'posWinnerId'
  >,
  lastPlayedAt: number | undefined,
  now = Date.now(),
  resumeKey = String(lastPlayedAt ?? '')
): ResumeRecapCandidate | null {
  if (!Number.isFinite(lastPlayedAt)) return null
  if (now - (lastPlayedAt as number) < RESUME_RECAP_MIN_ABSENCE_MS) return null
  if (!resumeKey || recapAlreadyShown(game, resumeKey)) return null

  const facts = buildResumeFacts(game)
  if (facts.length === 0) return null

  return {
    text: `PREVIOUSLY ON THE BIG EYE · ${facts.join(' ')}`,
    storyKey: `resume:${resumeKey}`,
    cooldownKey: 'programming:resume-recap',
    subjectIds: [],
    category: RESUME_RECAP_CATEGORY,
    significance: 94,
    resumeKey,
    facts,
  }
}

export function buildResumeRecapCandidate(
  snapshot: SavedSeasonSnapshot,
  now = Date.now()
): ResumeRecapCandidate | null {
  const savedAtMs = Date.parse(snapshot.savedAt)
  return buildResumeRecapFromGame(snapshot.game, savedAtMs, now, snapshot.savedAt)
}

function programmingRecentlyShown(history: readonly TvEvent[], week: number): boolean {
  return history.some(
    (event) =>
      event.meta?.editorial?.category === BIG_EYE_PROGRAMMING_CATEGORY &&
      typeof event.meta?.week === 'number' &&
      event.meta.week >= Math.max(1, week - 2)
  )
}

/**
 * Sparse callback for a quiet Day Start after a genuinely significant public
 * shock. It does not invent a teaser and does not run on ordinary days.
 */
export function buildProgrammingCallbackCandidate(
  state: Pick<GameState, 'phase' | 'week' | 'tvFeed'>
): FauxTvEditorialCandidate | null {
  if (state.phase !== 'week_start' || state.week < 2) return null
  if (programmingRecentlyShown(state.tvFeed, state.week)) return null

  const previousShock = latestPublicTwist(state.tvFeed, state.week)
  if (!previousShock || previousShock.meta?.week !== state.week - 1) return null

  const compact = previousShock.text.replace(/\s+/g, ' ').trim()
  const callback = compact.length <= 100 ? compact : `${compact.slice(0, 97).trimEnd()}…`
  const storyKey = `programming:callback:${previousShock.id}`
  if (state.tvFeed.some((event) => event.meta?.editorial?.storyKey === storyKey)) return null

  return {
    text: `THE BIG EYE CONTINUES · Previously: ${callback}`,
    storyKey,
    cooldownKey: 'programming:callback',
    subjectIds: [],
    category: BIG_EYE_PROGRAMMING_CATEGORY,
    significance: 42,
  }
}

export function hasStrongOptionalStoryForWeek(history: readonly TvEvent[], week: number): boolean {
  return history.some((event) => {
    if (event.meta?.week !== week) return false
    const category = event.meta?.editorial?.category
    return (
      category === RESUME_RECAP_CATEGORY ||
      category === BIG_EYE_PROGRAMMING_CATEGORY ||
      category === 'by_the_numbers'
    )
  })
}
