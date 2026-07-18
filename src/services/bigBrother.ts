import {
  createInitialBigEyeState,
  resolveBigEyeTurn,
  type BigEyeAction,
  type BigEyeConversationState,
  type BigEyeIntent,
} from '../bb/confessionalBigEye'
import { directLocalBigEyeReply, updateLocalBigEyeMemory } from '../bb/localBigEyeDirector'
import { getSecretMissionEasterEggByIntent } from '../bb/secretMissionEasterEggs'
import { apiUrl } from '../utils/apiBase'

export type BigEyeEmotion =
  | 'watchful'
  | 'probing'
  | 'amused'
  | 'stern'
  | 'cold'
  | 'empathetic'
  | 'suspicious'

export type BigEyeEyeState = 'steady' | 'narrow' | 'pulse' | 'soften' | 'glitch'
export type BigEyeDelivery = 'measured' | 'clipped' | 'hushed' | 'dry' | 'gentle' | 'severe'

export interface BigEyePerformance {
  emotion: BigEyeEmotion
  intensity: number
  eyeState: BigEyeEyeState
  delivery: BigEyeDelivery
  pauseBeforeMs: number
}

export interface BigEyeHistoryTurn {
  role: 'user' | 'bb'
  text: string
}

export interface BigEyeWorldContext {
  season: number
  week: number
  phase: string
  playerStatus: string
  leaderName: string | null
  nomineeNames: string[]
  safetyWinnerName: string | null
  remainingHousemates: string[]
  playerStats: {
    leaderWins: number
    safetyWins: number
    timesNominated: number
  }
  closestRelationships: Array<{
    name: string
    affinity: number
    tags: string[]
  }>
  recentPublicEvents: string[]
}

export interface BigBrotherPayload {
  diaryText: string
  playerName?: string
  phase?: string
  seed?: number
  state?: BigEyeConversationState
  history?: BigEyeHistoryTurn[]
  memorySummary?: string
  world?: BigEyeWorldContext
}

export interface BigBrotherResponse {
  text: string
  reason: BigEyeIntent
  intent: BigEyeIntent
  nextState: BigEyeConversationState
  delayMs: number
  action?: BigEyeAction
  memorySummary: string
  performance: BigEyePerformance
  source: 'ai' | 'offline'
}

export type { BigEyeConversationState, BigEyeAction, BigEyeIntent }
export { createInitialBigEyeState }

const DIRECTOR_TIMEOUT_MS = 22000

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

function offlinePerformance(
  intent: BigEyeIntent,
  mood: BigEyeConversationState['mood']
): BigEyePerformance {
  if (
    intent === 'fear' ||
    intent === 'help_request' ||
    intent === 'overwhelmed' ||
    intent === 'sadness'
  ) {
    return {
      emotion: 'empathetic',
      intensity: 0.58,
      eyeState: 'soften',
      delivery: 'gentle',
      pauseBeforeMs: 850,
    }
  }
  if (intent === 'insult' || intent === 'betrayal') {
    return {
      emotion: 'cold',
      intensity: 0.78,
      eyeState: 'narrow',
      delivery: 'clipped',
      pauseBeforeMs: 720,
    }
  }
  if (intent === 'strategy' || intent === 'alliance' || intent === 'winner_prediction') {
    return {
      emotion: 'probing',
      intensity: 0.64,
      eyeState: 'pulse',
      delivery: 'measured',
      pauseBeforeMs: 900,
    }
  }
  if (intent === 'compliment' || intent === 'love_confession') {
    return {
      emotion: 'amused',
      intensity: 0.48,
      eyeState: 'pulse',
      delivery: 'dry',
      pauseBeforeMs: 620,
    }
  }
  if (mood === 'cold') {
    return {
      emotion: 'stern',
      intensity: 0.66,
      eyeState: 'narrow',
      delivery: 'severe',
      pauseBeforeMs: 760,
    }
  }
  return {
    emotion: 'watchful',
    intensity: 0.46,
    eyeState: 'steady',
    delivery: 'measured',
    pauseBeforeMs: 700,
  }
}

function isPerformance(value: unknown): value is BigEyePerformance {
  if (!value || typeof value !== 'object') return false
  const performance = value as Partial<BigEyePerformance>
  return (
    ['watchful', 'probing', 'amused', 'stern', 'cold', 'empathetic', 'suspicious'].includes(
      performance.emotion ?? ''
    ) &&
    ['steady', 'narrow', 'pulse', 'soften', 'glitch'].includes(performance.eyeState ?? '') &&
    ['measured', 'clipped', 'hushed', 'dry', 'gentle', 'severe'].includes(
      performance.delivery ?? ''
    ) &&
    typeof performance.intensity === 'number' &&
    typeof performance.pauseBeforeMs === 'number'
  )
}

interface DirectorResponse {
  text?: unknown
  memorySummary?: unknown
  performance?: unknown
  available?: unknown
}

async function requestDirectorReply(
  payload: BigBrotherPayload,
  intent: BigEyeIntent
): Promise<DirectorResponse | null> {
  if (import.meta.env.MODE === 'test' || import.meta.env.VITE_BIG_EYE_AI_ENABLED !== 'true') {
    return null
  }

  const controller = new AbortController()
  const timeoutId = window.setTimeout(() => controller.abort(), DIRECTOR_TIMEOUT_MS)
  try {
    const response = await fetch(apiUrl('/api/ai/bigbrother'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        diaryText: payload.diaryText,
        playerName: payload.playerName,
        phase: payload.phase,
        seed: payload.seed,
        intent,
        history: payload.history?.slice(-12),
        memorySummary: payload.memorySummary?.slice(0, 1800) ?? '',
        world: payload.world,
      }),
      signal: controller.signal,
    })

    if (!response.ok) return null
    const result = (await response.json()) as DirectorResponse
    return result.available === false ? null : result
  } catch {
    return null
  } finally {
    window.clearTimeout(timeoutId)
  }
}

export async function generateBigBrotherReply(
  payload: BigBrotherPayload
): Promise<BigBrotherResponse> {
  const state = payload.state ?? createInitialBigEyeState()
  // Local classification owns game actions. The generative director is only
  // allowed to improve dialogue and performance, never mutate the game.
  const reply = resolveBigEyeTurn(payload.diaryText, payload, state)
  const directed = await requestDirectorReply(payload, reply.intent)
  const directedText = typeof directed?.text === 'string' ? directed.text.trim() : ''
  const preserveAuthoredFlow = Boolean(
    reply.action || state.lastQuestion || getSecretMissionEasterEggByIntent(reply.intent)
  )
  const localDirectedText = preserveAuthoredFlow
    ? reply.text
    : directLocalBigEyeReply({
        diaryText: payload.diaryText,
        playerName: payload.playerName,
        seed: payload.seed,
        intent: reply.intent,
        state,
        history: payload.history,
        memorySummary: payload.memorySummary,
        world: payload.world,
      }) || reply.text
  const directedMemory =
    typeof directed?.memorySummary === 'string'
      ? directed.memorySummary.trim().slice(0, 1800)
      : updateLocalBigEyeMemory({
          diaryText: payload.diaryText,
          playerName: payload.playerName,
          seed: payload.seed,
          intent: reply.intent,
          state,
          history: payload.history,
          memorySummary: payload.memorySummary,
          world: payload.world,
        })
  const performance = isPerformance(directed?.performance)
    ? {
        ...directed.performance,
        intensity: clamp(directed.performance.intensity, 0, 1),
        pauseBeforeMs: clamp(Math.round(directed.performance.pauseBeforeMs), 250, 2400),
      }
    : offlinePerformance(reply.intent, reply.nextState.mood)

  return {
    text: directedText || localDirectedText,
    reason: reply.intent,
    intent: reply.intent,
    nextState: reply.nextState,
    delayMs: reply.delayMs,
    action: reply.action,
    memorySummary: directedMemory,
    performance,
    source: directedText ? 'ai' : 'offline',
  }
}
