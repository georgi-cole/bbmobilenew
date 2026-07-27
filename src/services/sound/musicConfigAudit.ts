import type { GameCategory } from '../../minigames/registry'
import { MUSIC_CATALOG, MUSIC_TRACK_IDS, type CatalogMusicTrack } from './musicCatalog'
import {
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

export function auditMusicConfig(
  config: MusicConfigDocument = DEFAULT_MUSIC_CONFIG,
  activeMinigames: readonly AuditableMinigame[] = []
): MusicConfigAuditIssue[] {
  const issues: MusicConfigAuditIssue[] = []

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
