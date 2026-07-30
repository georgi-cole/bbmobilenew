import type { GameCategory } from '../../minigames/registry'
import { SOUND_REGISTRY } from './sounds'
import { MUSIC_CATALOG, MUSIC_TRACK_IDS, type CatalogMusicTrack } from './musicCatalog'
import { validateMusicCueDefinition } from './musicCue'
import {
  AUDIO_EVENT_IDS,
  DEFAULT_MUSIC_CONFIG,
  DEFAULT_PHASE_MUSIC_POLICY,
  DEFAULT_SCENE_MUSIC_POLICY,
  hasDeclaredMinigamePolicy,
  type MinigameMusicProfile,
  type MusicConfigDocument,
  type MusicConfigMode,
  type MusicSelection,
} from './musicConfig'

export interface MusicConfigAuditIssue {
  code: string
  message: string
  path?: string
}

export interface AuditableMinigame {
  key: string
  category: GameCategory
}

function isCatalogTrack(value: unknown): value is CatalogMusicTrack {
  return typeof value === 'string' && MUSIC_TRACK_IDS.includes(value as CatalogMusicTrack)
}

function auditSelection(
  selection: MusicSelection | undefined,
  path: string,
  issues: MusicConfigAuditIssue[]
): void {
  if (!selection) {
    issues.push({ code: 'missing-selection', message: `Missing music selection at ${path}.`, path })
    return
  }
  if (!['track', 'silence', 'inherit'].includes(selection.kind)) {
    issues.push({ code: 'invalid-selection', message: `Invalid selection kind at ${path}.`, path })
    return
  }
  if (selection.kind === 'track' && !isCatalogTrack(selection.track)) {
    issues.push({
      code: 'unknown-track',
      message: `Unknown music track "${String(selection.track)}" at ${path}.`,
      path,
    })
  }
}

function modesOverlap(a: readonly MusicConfigMode[], b: readonly MusicConfigMode[]): boolean {
  return a.includes('any') || b.includes('any') || a.some((mode) => b.includes(mode))
}

function auditProfile(
  profile: MinigameMusicProfile,
  index: number,
  issues: MusicConfigAuditIssue[]
): void {
  const path = `minigameProfiles[${index}]`
  if (!profile.id.trim()) {
    issues.push({ code: 'missing-profile-id', message: `Missing profile id at ${path}.`, path })
  }
  if (profile.gameKeys.length === 0) {
    issues.push({
      code: 'empty-minigame-profile',
      message: `Profile ${profile.id || index} has no game keys.`,
      path,
    })
  }
  if (profile.modes.length === 0) {
    issues.push({
      code: 'empty-profile-modes',
      message: `Profile ${profile.id || index} has no applicable modes.`,
      path,
    })
  }

  auditSelection(profile.defaultSelection, `${path}.defaultSelection`, issues)
  for (const [stage, selection] of Object.entries(profile.stages)) {
    auditSelection(selection, `${path}.stages.${stage}`, issues)
  }

  if (profile.transition) {
    for (const [key, value] of Object.entries(profile.transition)) {
      if (key === 'managedLifecycle') continue
      if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
        issues.push({
          code: 'invalid-transition',
          message: `Transition ${key} must be a non-negative finite number at ${path}.`,
          path: `${path}.transition.${key}`,
        })
      }
    }
    const playingSelection = profile.stages.playing ?? profile.defaultSelection
    if (profile.transition.managedLifecycle && playingSelection.kind !== 'track') {
      issues.push({
        code: 'managed-profile-without-track',
        message: `Managed profile ${profile.id} must resolve its playing stage to a track.`,
        path,
      })
    }
  }
}

function auditEventSounds(config: MusicConfigDocument, issues: MusicConfigAuditIssue[]): void {
  for (const eventId of AUDIO_EVENT_IDS) {
    const cue = config.eventSounds[eventId]
    const path = `eventSounds.${eventId}`
    if (!cue) {
      issues.push({
        code: 'missing-event-cue',
        message: `Missing semantic event cue for ${eventId}.`,
        path,
      })
      continue
    }

    if (cue.soundKey !== null) {
      const entry = SOUND_REGISTRY[cue.soundKey]
      if (!entry) {
        issues.push({
          code: 'unknown-event-sound',
          message: `Event ${eventId} references unknown sound key ${cue.soundKey}.`,
          path: `${path}.soundKey`,
        })
      } else if (entry.category === 'music') {
        issues.push({
          code: 'music-used-as-event-sound',
          message: `Event ${eventId} must use a one-shot sound, not ${cue.soundKey}.`,
          path: `${path}.soundKey`,
        })
      }
    }

    if (
      cue.volume !== undefined &&
      (!Number.isFinite(cue.volume) || cue.volume < 0 || cue.volume > 1)
    ) {
      issues.push({
        code: 'invalid-event-volume',
        message: `Event ${eventId} volume must be between 0 and 1.`,
        path: `${path}.volume`,
      })
    }
  }
}

function auditMusicCueLibrary(config: MusicConfigDocument, issues: MusicConfigAuditIssue[]): void {
  for (const [cueId, cue] of Object.entries(config.musicCues)) {
    const path = `musicCues.${cueId}`
    if (cue.id !== cueId) {
      issues.push({
        code: 'cue-id-mismatch',
        message: `Cue key ${cueId} does not match its internal id ${cue.id}.`,
        path,
      })
    }
    for (const issue of validateMusicCueDefinition(cue)) {
      issues.push({
        code: `invalid-cue-${issue.code}`,
        message: `${cue.displayName}: ${issue.message}`,
        path,
      })
    }
  }

  const visit = (value: unknown, path: string): void => {
    if (Array.isArray(value)) {
      value.forEach((entry, index) => visit(entry, `${path}[${index}]`))
      return
    }
    if (!value || typeof value !== 'object') return
    const record = value as Record<string, unknown>
    if (record.kind === 'track' && typeof record.cueId === 'string') {
      const cue = config.musicCues[record.cueId]
      if (!cue) {
        issues.push({
          code: 'missing-assignment-cue',
          message: `Assignment references missing cue ${record.cueId}.`,
          path,
        })
      } else if (record.track !== cue.track) {
        issues.push({
          code: 'assignment-cue-track-mismatch',
          message: `Assignment track ${String(record.track)} does not match cue ${record.cueId} track ${cue.track}.`,
          path,
        })
      }
    }
    for (const [key, entry] of Object.entries(record)) {
      if (key === 'musicCues') continue
      visit(entry, path ? `${path}.${key}` : key)
    }
  }
  visit(config, '')
}

export function auditMusicConfig(
  config: MusicConfigDocument = DEFAULT_MUSIC_CONFIG,
  activeMinigames: readonly AuditableMinigame[] = []
): MusicConfigAuditIssue[] {
  const issues: MusicConfigAuditIssue[] = []
  auditMusicCueLibrary(config, issues)

  if (config.version !== 1) {
    issues.push({
      code: 'unsupported-version',
      message: `Unsupported music config version ${String(config.version)}.`,
      path: 'version',
    })
  }

  const soundKeyOwners = new Map<string, CatalogMusicTrack>()
  for (const track of MUSIC_TRACK_IDS) {
    const definition = MUSIC_CATALOG[track]
    const existing = soundKeyOwners.get(definition.soundKey)
    if (existing) {
      issues.push({
        code: 'duplicate-sound-key',
        message: `${track} and ${existing} share sound key ${definition.soundKey}.`,
        path: `catalog.${track}.soundKey`,
      })
    } else {
      soundKeyOwners.set(definition.soundKey, track)
    }

    if (definition.dynamicSound && definition.dynamicSound.key !== definition.soundKey) {
      issues.push({
        code: 'dynamic-sound-key-mismatch',
        message: `Dynamic sound key for ${track} does not match its catalog sound key.`,
        path: `catalog.${track}.dynamicSound.key`,
      })
    }

    const seen = new Set<CatalogMusicTrack>([track])
    let fallback = definition.fallbackTrack
    while (fallback !== 'none') {
      if (!isCatalogTrack(fallback)) {
        issues.push({
          code: 'unknown-fallback-track',
          message: `Track ${track} falls back to unknown track ${String(fallback)}.`,
          path: `catalog.${track}.fallbackTrack`,
        })
        break
      }
      if (seen.has(fallback)) {
        issues.push({
          code: 'fallback-cycle',
          message: `Fallback chain for ${track} contains a cycle at ${fallback}.`,
          path: `catalog.${track}.fallbackTrack`,
        })
        break
      }
      seen.add(fallback)
      fallback = MUSIC_CATALOG[fallback].fallbackTrack
    }
  }

  for (const phase of Object.keys(DEFAULT_PHASE_MUSIC_POLICY)) {
    auditSelection(
      config.phaseMusic[phase as keyof typeof config.phaseMusic],
      `phaseMusic.${phase}`,
      issues
    )
  }
  for (const scene of Object.keys(DEFAULT_SCENE_MUSIC_POLICY)) {
    auditSelection(
      config.sceneMusic[scene as keyof typeof config.sceneMusic],
      `sceneMusic.${scene}`,
      issues
    )
  }
  for (const mode of ['classic', 'survival'] as const) {
    for (const [phase, selection] of Object.entries(config.modePhaseOverrides[mode] ?? {})) {
      auditSelection(selection, `modePhaseOverrides.${mode}.${phase}`, issues)
    }
  }
  for (const mode of ['any', 'classic', 'survival'] as const) {
    for (const [gameKey, stages] of Object.entries(config.minigameAssignments[mode] ?? {})) {
      for (const [stage, selection] of Object.entries(stages)) {
        auditSelection(selection, `minigameAssignments.${mode}.${gameKey}.${stage}`, issues)
      }
    }
  }
  for (const category of ['arcade', 'endurance', 'logic', 'trivia'] as const) {
    auditSelection(
      config.minigameCategoryMusic[category],
      `minigameCategoryMusic.${category}`,
      issues
    )
  }
  for (const [contextName, selection] of Object.entries(config.contextMusic)) {
    auditSelection(selection, `contextMusic.${contextName}`, issues)
  }
  auditEventSounds(config, issues)

  const profileIds = new Set<string>()
  config.minigameProfiles.forEach((profile, index) => {
    auditProfile(profile, index, issues)
    if (profileIds.has(profile.id)) {
      issues.push({
        code: 'duplicate-profile-id',
        message: `Duplicate minigame music profile id ${profile.id}.`,
        path: `minigameProfiles[${index}].id`,
      })
    }
    profileIds.add(profile.id)
  })

  for (let left = 0; left < config.minigameProfiles.length; left += 1) {
    const leftProfile = config.minigameProfiles[left]
    for (let right = left + 1; right < config.minigameProfiles.length; right += 1) {
      const rightProfile = config.minigameProfiles[right]
      if (!modesOverlap(leftProfile.modes, rightProfile.modes)) continue
      const duplicateKey = leftProfile.gameKeys.find((key) => rightProfile.gameKeys.includes(key))
      if (duplicateKey) {
        issues.push({
          code: 'ambiguous-minigame-profile',
          message: `${duplicateKey} is assigned by both ${leftProfile.id} and ${rightProfile.id}.`,
          path: `minigameProfiles[${right}]`,
        })
      }
    }
  }

  for (const game of activeMinigames) {
    if (!hasDeclaredMinigamePolicy(game.key, game.category, config)) {
      issues.push({
        code: 'unmapped-active-minigame',
        message: `Active minigame ${game.key} has no direct or category music policy.`,
        path: `minigames.${game.key}`,
      })
    }
  }

  return issues
}

export function assertValidMusicConfig(
  config: MusicConfigDocument = DEFAULT_MUSIC_CONFIG,
  activeMinigames: readonly AuditableMinigame[] = []
): void {
  const issues = auditMusicConfig(config, activeMinigames)
  if (issues.length === 0) return
  throw new Error(
    `[music-config] ${issues.map((issue) => `${issue.code}: ${issue.message}`).join('\n')}`
  )
}
