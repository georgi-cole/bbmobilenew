import type { CatalogMusicTrack } from './musicCatalog'

export const MUSIC_EFFECT_PRESETS = [
  'none',
  'muffled',
  'radio',
  'tension',
  'final_round',
  'dream',
] as const

export type MusicEffectPreset = (typeof MUSIC_EFFECT_PRESETS)[number]

export const MUSIC_RESTART_POLICIES = ['restart', 'resume', 'continue'] as const
export type MusicRestartPolicy = (typeof MUSIC_RESTART_POLICIES)[number]

export interface MusicCueDefinition {
  id: string
  displayName: string
  track: CatalogMusicTrack
  startAtSec: number
  endAtSec?: number
  loop: boolean
  loopStartSec?: number
  loopEndSec?: number
  /** Relative cue gain. The track and user master volumes still apply. */
  volume: number
  fadeInMs: number
  fadeOutMs: number
  crossfadeMs: number
  restartPolicy: MusicRestartPolicy
  effectPreset: MusicEffectPreset
}

export function createDefaultMusicCue(track: CatalogMusicTrack, loop = true): MusicCueDefinition {
  return {
    id: `track:${track}`,
    displayName: `${track.replace(/_/g, ' ')} — full track`,
    track,
    startAtSec: 0,
    loop,
    volume: 1,
    fadeInMs: 0,
    fadeOutMs: 0,
    crossfadeMs: 0,
    restartPolicy: 'continue',
    effectPreset: 'none',
  }
}

export function musicCueSignature(cue: MusicCueDefinition, assetKey = ''): string {
  return [
    assetKey,
    cue.id,
    cue.track,
    cue.startAtSec,
    cue.endAtSec ?? '',
    cue.loop,
    cue.loopStartSec ?? '',
    cue.loopEndSec ?? '',
    cue.volume,
    cue.fadeInMs,
    cue.fadeOutMs,
    cue.crossfadeMs,
    cue.restartPolicy,
    cue.effectPreset,
  ].join('|')
}

export function isAdvancedMusicCue(
  cue: MusicCueDefinition | undefined,
  defaultLoop = true
): boolean {
  if (!cue) return false
  return (
    cue.startAtSec > 0 ||
    cue.endAtSec !== undefined ||
    cue.loopStartSec !== undefined ||
    cue.loopEndSec !== undefined ||
    cue.loop !== defaultLoop ||
    cue.volume !== 1 ||
    cue.fadeInMs > 0 ||
    cue.fadeOutMs > 0 ||
    cue.crossfadeMs > 0 ||
    cue.restartPolicy !== 'continue' ||
    cue.effectPreset !== 'none'
  )
}

export interface MusicCueValidationIssue {
  code: string
  message: string
}

export function validateMusicCueDefinition(cue: MusicCueDefinition): MusicCueValidationIssue[] {
  const issues: MusicCueValidationIssue[] = []
  const finiteNonNegative = (value: number) => Number.isFinite(value) && value >= 0

  if (!cue.id.trim()) issues.push({ code: 'missing-id', message: 'Cue id is required.' })
  if (!cue.displayName.trim()) {
    issues.push({ code: 'missing-name', message: 'Cue display name is required.' })
  }
  if (!finiteNonNegative(cue.startAtSec)) {
    issues.push({ code: 'invalid-start', message: 'Start time must be a non-negative number.' })
  }
  if (
    cue.endAtSec !== undefined &&
    (!finiteNonNegative(cue.endAtSec) || cue.endAtSec <= cue.startAtSec)
  ) {
    issues.push({ code: 'invalid-end', message: 'End time must be later than the start time.' })
  }
  const boundaryEnd = cue.endAtSec
  if (cue.loopStartSec !== undefined && cue.loopStartSec < cue.startAtSec) {
    issues.push({ code: 'invalid-loop-start', message: 'Loop start cannot precede the cue start.' })
  }
  if (cue.loopEndSec !== undefined) {
    const loopStart = cue.loopStartSec ?? cue.startAtSec
    if (cue.loopEndSec <= loopStart) {
      issues.push({ code: 'invalid-loop-end', message: 'Loop end must be later than loop start.' })
    }
    if (boundaryEnd !== undefined && cue.loopEndSec > boundaryEnd) {
      issues.push({ code: 'loop-outside-cue', message: 'Loop end cannot exceed the cue end.' })
    }
  }
  if (!Number.isFinite(cue.volume) || cue.volume < 0 || cue.volume > 1) {
    issues.push({ code: 'invalid-volume', message: 'Cue volume must be between 0 and 1.' })
  }
  for (const [name, value] of [
    ['fadeInMs', cue.fadeInMs],
    ['fadeOutMs', cue.fadeOutMs],
    ['crossfadeMs', cue.crossfadeMs],
  ] as const) {
    if (!finiteNonNegative(value)) {
      issues.push({ code: `invalid-${name}`, message: `${name} must be non-negative.` })
    }
  }
  if (cue.endAtSec !== undefined) {
    const durationMs = (cue.endAtSec - cue.startAtSec) * 1000
    if (cue.fadeInMs + cue.fadeOutMs > durationMs) {
      issues.push({
        code: 'fades-exceed-duration',
        message: 'Combined fade durations exceed the playable cue segment.',
      })
    }
    if (cue.crossfadeMs > durationMs) {
      issues.push({
        code: 'crossfade-exceeds-duration',
        message: 'Crossfade duration exceeds the playable cue segment.',
      })
    }
  }
  return issues
}
