import type { GameCategory } from '../../minigames/registry'
import type { MusicScene } from '../../store/uiSlice'
import type { Phase } from '../../types'
import {
  AUDIO_EVENT_IDS,
  DEFAULT_PHASE_MUSIC_POLICY,
  DEFAULT_SCENE_MUSIC_POLICY,
  type AudioEventCue,
  type AudioEventId,
  type MinigameMusicProfile,
  type MinigameStageAssignments,
  type MusicConfigMode,
  type MusicConfigOverrides,
  type MusicMinigameStage,
  type MusicSelection,
  type MusicTransitionPolicy,
} from './musicConfig'
import { isCatalogMusicTrack, type MusicTrackAssetOverride } from './musicCatalog'
import { SOUND_REGISTRY } from './sounds'

const MUSIC_CONFIG_MODES = [
  'any',
  'classic',
  'survival',
] as const satisfies readonly MusicConfigMode[]
const MINIGAME_STAGES = [
  'rules',
  'countdown',
  'playing',
  'results',
  'done',
] as const satisfies readonly MusicMinigameStage[]
const GAME_CATEGORIES = [
  'arcade',
  'endurance',
  'logic',
  'trivia',
] as const satisfies readonly GameCategory[]
const CONTEXT_KEYS = ['spectator', 'social', 'seasonComplete', 'gameOver', 'fallback'] as const
const PHASES = new Set(Object.keys(DEFAULT_PHASE_MUSIC_POLICY) as Phase[])
const SCENES = new Set(Object.keys(DEFAULT_SCENE_MUSIC_POLICY) as MusicScene[])
const EVENT_IDS = new Set<AudioEventId>(AUDIO_EVENT_IDS)
const MAX_PROFILE_COUNT = 200
const MAX_GAME_KEYS_PER_PROFILE = 200
const MAX_KEY_LENGTH = 120
const MAX_TRANSITION_MS = 60_000

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function isSafeObjectKey(value: string): boolean {
  return (
    value.length > 0 &&
    value.length <= MAX_KEY_LENGTH &&
    value !== '__proto__' &&
    value !== 'constructor' &&
    value !== 'prototype'
  )
}

function safeString(value: unknown, maxLength = MAX_KEY_LENGTH): string | undefined {
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  return trimmed.length > 0 && trimmed.length <= maxLength ? trimmed : undefined
}

function safeUnitInterval(value: unknown): number | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value)) return undefined
  return Math.max(0, Math.min(1, value))
}

function safeDuration(value: unknown): number | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value)) return undefined
  return Math.round(Math.max(0, Math.min(MAX_TRANSITION_MS, value)))
}

function isSafeHttpUrl(value: unknown): value is string {
  if (typeof value !== 'string') return false
  try {
    const parsed = new URL(value)
    return parsed.protocol === 'http:' || parsed.protocol === 'https:'
  } catch {
    return false
  }
}

export function sanitiseMusicSelection(raw: unknown): MusicSelection | undefined {
  if (!isRecord(raw)) return undefined
  if (raw.kind === 'silence') return { kind: 'silence' }
  if (raw.kind === 'inherit') return { kind: 'inherit' }
  if (raw.kind === 'track' && isCatalogMusicTrack(raw.track)) {
    return { kind: 'track', track: raw.track }
  }
  return undefined
}

function sanitiseTransition(raw: unknown): MusicTransitionPolicy | undefined {
  if (!isRecord(raw)) return undefined
  const fadeInMs = safeDuration(raw.fadeInMs)
  const postGameHoldMs = safeDuration(raw.postGameHoldMs)
  const fadeOutMs = safeDuration(raw.fadeOutMs)
  const managedLifecycle =
    typeof raw.managedLifecycle === 'boolean' ? raw.managedLifecycle : undefined
  if (
    fadeInMs === undefined ||
    postGameHoldMs === undefined ||
    fadeOutMs === undefined ||
    managedLifecycle === undefined
  ) {
    return undefined
  }
  return { fadeInMs, postGameHoldMs, fadeOutMs, managedLifecycle }
}

function sanitiseStageAssignments(raw: unknown): MinigameStageAssignments | undefined {
  if (!isRecord(raw)) return undefined
  const result: MinigameStageAssignments = {}
  for (const stage of MINIGAME_STAGES) {
    const selection = sanitiseMusicSelection(raw[stage])
    if (selection) result[stage] = selection
  }
  return Object.keys(result).length > 0 ? result : undefined
}

function sanitiseProfile(raw: unknown): MinigameMusicProfile | null {
  if (!isRecord(raw)) return null
  const id = safeString(raw.id)
  if (!id) return null

  const modes = Array.isArray(raw.modes)
    ? Array.from(
        new Set(
          raw.modes.filter(
            (value): value is MusicConfigMode =>
              typeof value === 'string' && MUSIC_CONFIG_MODES.includes(value as MusicConfigMode)
          )
        )
      )
    : []
  const gameKeys = Array.isArray(raw.gameKeys)
    ? Array.from(
        new Set(
          raw.gameKeys
            .map((value) => safeString(value))
            .filter((value): value is string => value !== undefined)
        )
      ).slice(0, MAX_GAME_KEYS_PER_PROFILE)
    : []
  const defaultSelection = sanitiseMusicSelection(raw.defaultSelection)
  if (modes.length === 0 || gameKeys.length === 0 || !defaultSelection) return null

  const stages = sanitiseStageAssignments(raw.stages) ?? {}
  const transition = sanitiseTransition(raw.transition)
  return {
    id,
    modes,
    gameKeys,
    stages,
    defaultSelection,
    ...(transition ? { transition } : {}),
  }
}

function sanitiseEventCue(raw: unknown): AudioEventCue | undefined {
  if (!isRecord(raw)) return undefined
  let soundKey: string | null | undefined
  if (raw.soundKey === null) {
    soundKey = null
  } else if (typeof raw.soundKey === 'string') {
    const entry = SOUND_REGISTRY[raw.soundKey]
    if (entry && entry.category !== 'music') soundKey = raw.soundKey
  }
  if (soundKey === undefined) return undefined
  const volume = safeUnitInterval(raw.volume)
  return {
    soundKey,
    ...(volume !== undefined ? { volume } : {}),
  }
}

export function sanitiseMusicConfigOverrides(raw: unknown): MusicConfigOverrides {
  if (!isRecord(raw)) return {}
  const result: MusicConfigOverrides = {}

  if (isRecord(raw.phaseMusic)) {
    const phaseMusic: Partial<Record<Phase, MusicSelection>> = {}
    for (const [phase, value] of Object.entries(raw.phaseMusic)) {
      if (!PHASES.has(phase as Phase)) continue
      const selection = sanitiseMusicSelection(value)
      if (selection) phaseMusic[phase as Phase] = selection
    }
    if (Object.keys(phaseMusic).length > 0) result.phaseMusic = phaseMusic
  }

  if (isRecord(raw.modePhaseOverrides)) {
    const modePhaseOverrides: MusicConfigOverrides['modePhaseOverrides'] = {}
    for (const mode of ['classic', 'survival'] as const) {
      const rawMode = raw.modePhaseOverrides[mode]
      if (!isRecord(rawMode)) continue
      const phaseSelections: Partial<Record<Phase, MusicSelection>> = {}
      for (const [phase, value] of Object.entries(rawMode)) {
        if (!PHASES.has(phase as Phase)) continue
        const selection = sanitiseMusicSelection(value)
        if (selection) phaseSelections[phase as Phase] = selection
      }
      if (Object.keys(phaseSelections).length > 0) modePhaseOverrides[mode] = phaseSelections
    }
    if (Object.keys(modePhaseOverrides).length > 0) {
      result.modePhaseOverrides = modePhaseOverrides
    }
  }

  if (isRecord(raw.sceneMusic)) {
    const sceneMusic: Partial<Record<MusicScene, MusicSelection>> = {}
    for (const [scene, value] of Object.entries(raw.sceneMusic)) {
      if (!SCENES.has(scene as MusicScene)) continue
      const selection = sanitiseMusicSelection(value)
      if (selection) sceneMusic[scene as MusicScene] = selection
    }
    if (Object.keys(sceneMusic).length > 0) result.sceneMusic = sceneMusic
  }

  if (Array.isArray(raw.minigameProfiles)) {
    const profiles = raw.minigameProfiles
      .slice(0, MAX_PROFILE_COUNT)
      .map(sanitiseProfile)
      .filter((profile): profile is MinigameMusicProfile => profile !== null)
    if (profiles.length > 0) result.minigameProfiles = profiles
  }

  if (isRecord(raw.minigameAssignments)) {
    const assignments: NonNullable<MusicConfigOverrides['minigameAssignments']> = {}
    for (const mode of MUSIC_CONFIG_MODES) {
      const rawMode = raw.minigameAssignments[mode]
      if (!isRecord(rawMode)) continue
      const games: Record<string, MinigameStageAssignments> = {}
      for (const [gameKey, value] of Object.entries(rawMode)) {
        if (!isSafeObjectKey(gameKey)) continue
        const stages = sanitiseStageAssignments(value)
        if (stages) games[gameKey] = stages
      }
      if (Object.keys(games).length > 0) assignments[mode] = games
    }
    if (Object.keys(assignments).length > 0) result.minigameAssignments = assignments
  }

  if (isRecord(raw.minigameCategoryMusic)) {
    const categoryMusic: Partial<Record<GameCategory, MusicSelection>> = {}
    for (const category of GAME_CATEGORIES) {
      const selection = sanitiseMusicSelection(raw.minigameCategoryMusic[category])
      if (selection) categoryMusic[category] = selection
    }
    if (Object.keys(categoryMusic).length > 0) {
      result.minigameCategoryMusic = categoryMusic
    }
  }

  if (isRecord(raw.eventSounds)) {
    const eventSounds: Partial<Record<AudioEventId, AudioEventCue>> = {}
    for (const [eventId, value] of Object.entries(raw.eventSounds)) {
      if (!EVENT_IDS.has(eventId as AudioEventId)) continue
      const cue = sanitiseEventCue(value)
      if (cue) eventSounds[eventId as AudioEventId] = cue
    }
    if (Object.keys(eventSounds).length > 0) result.eventSounds = eventSounds
  }

  if (isRecord(raw.contextMusic)) {
    const contextMusic: MusicConfigOverrides['contextMusic'] = {}
    for (const key of CONTEXT_KEYS) {
      const selection = sanitiseMusicSelection(raw.contextMusic[key])
      if (selection) contextMusic[key] = selection
    }
    if (Object.keys(contextMusic).length > 0) result.contextMusic = contextMusic
  }

  return result
}

export function sanitiseMusicTrackAssetOverrides(raw: unknown): MusicTrackAssetOverride[] {
  if (!Array.isArray(raw)) return []
  const byTrack = new Map<MusicTrackAssetOverride['track'], MusicTrackAssetOverride>()

  for (const value of raw) {
    if (!isRecord(value) || !isCatalogMusicTrack(value.track) || !isSafeHttpUrl(value.src)) {
      continue
    }
    const volume = safeUnitInterval(value.volume)
    const loop = typeof value.loop === 'boolean' ? value.loop : undefined
    byTrack.set(value.track, {
      track: value.track,
      src: value.src,
      ...(volume !== undefined ? { volume } : {}),
      ...(loop !== undefined ? { loop } : {}),
    })
  }

  return Array.from(byTrack.values())
}
