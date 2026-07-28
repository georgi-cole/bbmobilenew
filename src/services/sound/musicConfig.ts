import type { GameMode } from '../../modes/modeTypes'
import type { GameCategory } from '../../minigames/registry'
import type { MusicScene } from '../../store/uiSlice'
import type { Phase } from '../../types'
import type { MusicTrack } from './musicTracks'

export type MusicConfigMode = GameMode | 'any'
export type MusicMinigameStage = 'rules' | 'countdown' | 'playing' | 'results' | 'done'
export type NonSilentMusicTrack = Exclude<MusicTrack, 'none'>

export type MusicSelection =
  | { kind: 'track'; track: NonSilentMusicTrack }
  | { kind: 'silence' }
  | { kind: 'inherit' }

export interface MusicTransitionPolicy {
  fadeInMs: number
  postGameHoldMs: number
  fadeOutMs: number
  /**
   * When true, AudioStateSync retains exclusive ownership through the hold and
   * fade instead of immediately yielding to the parent phase track.
   */
  managedLifecycle: boolean
}

export interface MinigameMusicProfile {
  id: string
  modes: readonly MusicConfigMode[]
  gameKeys: readonly string[]
  stages: Partial<Record<MusicMinigameStage, MusicSelection>>
  defaultSelection: MusicSelection
  transition?: MusicTransitionPolicy
}

export interface MusicContextPolicy {
  spectator: MusicSelection
  social: MusicSelection
  seasonComplete: MusicSelection
  gameOver: MusicSelection
  fallback: MusicSelection
}

export interface MusicConfigDocument {
  version: 1
  phaseMusic: Readonly<Record<Phase, MusicSelection>>
  modePhaseOverrides: Readonly<Record<GameMode, Partial<Record<Phase, MusicSelection>>>>
  sceneMusic: Readonly<Record<MusicScene, MusicSelection>>
  minigameProfiles: readonly MinigameMusicProfile[]
  minigameCategoryMusic: Readonly<Record<GameCategory, MusicSelection>>
  contextMusic: Readonly<MusicContextPolicy>
}

export interface MusicConfigOverrides {
  phaseMusic?: Partial<Record<Phase, MusicSelection>>
  modePhaseOverrides?: Partial<Record<GameMode, Partial<Record<Phase, MusicSelection>>>>
  sceneMusic?: Partial<Record<MusicScene, MusicSelection>>
  minigameProfiles?: readonly MinigameMusicProfile[]
  minigameCategoryMusic?: Partial<Record<GameCategory, MusicSelection>>
  contextMusic?: Partial<MusicContextPolicy>
}

export interface MusicResolverContext {
  mode: GameMode
  gamePhase: string
  routeHash: string
  musicScene: MusicScene
  finalePhase?: string | null
  spectatorActive: boolean
  socialOpen: boolean
  minigame?: {
    gameKey?: string | null
    category?: GameCategory | null
    stage?: MusicMinigameStage | string | null
  } | null
}

export type MusicResolutionSource =
  | 'scene'
  | 'finale'
  | 'route'
  | 'minigame'
  | 'minigame-category'
  | 'spectator'
  | 'social'
  | 'phase'
  | 'fallback'

export interface ResolvedMusicCue {
  track: MusicTrack
  selection: MusicSelection
  assignmentId: string
  source: MusicResolutionSource
  inheritedAssignments: readonly string[]
  transition?: MusicTransitionPolicy
}

export const INHERIT_MUSIC = { kind: 'inherit' } as const satisfies MusicSelection
export const SILENT_MUSIC = { kind: 'silence' } as const satisfies MusicSelection

export function musicTrack(track: NonSilentMusicTrack): MusicSelection {
  return { kind: 'track', track }
}

const COMPETITION_MUSIC = musicTrack('competition')
const NOMINATIONS_MUSIC = musicTrack('nominations')
const VETO_MUSIC = musicTrack('veto')

/**
 * Exhaustive base policy for the canonical game phase union. Adding a new
 * Phase now produces a TypeScript error until its music behavior is declared.
 */
export const DEFAULT_PHASE_MUSIC_POLICY: Readonly<Record<Phase, MusicSelection>> = {
  week_start: SILENT_MUSIC,
  loh_comp_announcement: SILENT_MUSIC,
  loh_comp: COMPETITION_MUSIC,
  loh_results: COMPETITION_MUSIC,
  democracia_vote: SILENT_MUSIC,
  democracia_results: SILENT_MUSIC,
  social_1: SILENT_MUSIC,
  nominations: NOMINATIONS_MUSIC,
  nomination_results: NOMINATIONS_MUSIC,
  pre_veto_public_save: NOMINATIONS_MUSIC,
  pos_comp_announcement: SILENT_MUSIC,
  pos_comp: COMPETITION_MUSIC,
  pos_results: COMPETITION_MUSIC,
  pos_ceremony: VETO_MUSIC,
  pos_ceremony_results: VETO_MUSIC,
  social_2: SILENT_MUSIC,
  live_vote: SILENT_MUSIC,
  eviction_results: SILENT_MUSIC,
  week_end: SILENT_MUSIC,
  final4_eviction: SILENT_MUSIC,
  final3: SILENT_MUSIC,
  final3_comp1: SILENT_MUSIC,
  final3_comp1_minigame: SILENT_MUSIC,
  final3_comp2: SILENT_MUSIC,
  final3_comp2_minigame: SILENT_MUSIC,
  final3_comp3: SILENT_MUSIC,
  final3_comp3_minigame: SILENT_MUSIC,
  final3_decision: SILENT_MUSIC,
  jury_announcement: SILENT_MUSIC,
  jury_cinematic: SILENT_MUSIC,
  jury: SILENT_MUSIC,
}

export const DEFAULT_SCENE_MUSIC_POLICY: Readonly<Record<MusicScene, MusicSelection>> = {
  none: INHERIT_MUSIC,
  season_recap: musicTrack('season_recap'),
  tribunal_part1: musicTrack('jury_voting'),
  jury_voting: musicTrack('jury_voting'),
  public_voting: musicTrack('public_voting'),
}

export const CHALLENGE_GROUP_1_GAME_KEYS = [
  'bigSpender',
  'snake',
  'castleRescue',
  'batteryLow',
] as const

export const DEFAULT_MINIGAME_MUSIC_PROFILES: readonly MinigameMusicProfile[] = [
  {
    id: 'minigame.challenge-group-1',
    modes: ['any'],
    gameKeys: CHALLENGE_GROUP_1_GAME_KEYS,
    stages: {
      rules: SILENT_MUSIC,
      countdown: SILENT_MUSIC,
      playing: musicTrack('challenge_group_1'),
      results: SILENT_MUSIC,
      done: SILENT_MUSIC,
    },
    defaultSelection: SILENT_MUSIC,
    transition: {
      fadeInMs: 500,
      postGameHoldMs: 2800,
      fadeOutMs: 2000,
      managedLifecycle: true,
    },
  },
  {
    id: 'minigame.risk-wheel',
    modes: ['any'],
    gameKeys: ['riskWheel'],
    stages: { playing: musicTrack('risk_wheel') },
    defaultSelection: INHERIT_MUSIC,
  },
  {
    id: 'minigame.crystal-path',
    modes: ['any'],
    gameKeys: ['glass_bridge_brutal', 'crystal_path_shattered'],
    stages: { playing: musicTrack('glass_bridge') },
    defaultSelection: INHERIT_MUSIC,
  },
  {
    id: 'minigame.quick-tap-family',
    modes: ['any'],
    gameKeys: ['quickTap', 'laneRacers', 'memoryMatch'],
    stages: { playing: musicTrack('quick_tap') },
    defaultSelection: INHERIT_MUSIC,
  },
  {
    id: 'minigame.wildcard-western',
    modes: ['any'],
    gameKeys: ['wildcardWestern'],
    stages: { playing: musicTrack('wildcard_western') },
    defaultSelection: INHERIT_MUSIC,
  },
]

/**
 * Every active registry category has an explicit inheritance policy. This is
 * what distinguishes an intentionally inherited minigame from a missing entry.
 */
export const DEFAULT_MINIGAME_CATEGORY_MUSIC: Readonly<Record<GameCategory, MusicSelection>> = {
  arcade: INHERIT_MUSIC,
  endurance: INHERIT_MUSIC,
  logic: INHERIT_MUSIC,
  trivia: INHERIT_MUSIC,
}

export const DEFAULT_MUSIC_CONFIG: MusicConfigDocument = {
  version: 1,
  phaseMusic: DEFAULT_PHASE_MUSIC_POLICY,
  modePhaseOverrides: {
    classic: {},
    survival: {},
  },
  sceneMusic: DEFAULT_SCENE_MUSIC_POLICY,
  minigameProfiles: DEFAULT_MINIGAME_MUSIC_PROFILES,
  minigameCategoryMusic: DEFAULT_MINIGAME_CATEGORY_MUSIC,
  contextMusic: {
    spectator: musicTrack('spectator'),
    social: musicTrack('social'),
    seasonComplete: musicTrack('final_modal'),
    gameOver: musicTrack('final_modal'),
    fallback: SILENT_MUSIC,
  },
}

/**
 * Builds a complete, JSON-serializable configuration from local, admin, or
 * remote overrides without mutating the shipped defaults.
 */
export function createMusicConfig(overrides: MusicConfigOverrides = {}): MusicConfigDocument {
  return {
    version: 1,
    phaseMusic: {
      ...DEFAULT_MUSIC_CONFIG.phaseMusic,
      ...(overrides.phaseMusic ?? {}),
    },
    modePhaseOverrides: {
      classic: {
        ...DEFAULT_MUSIC_CONFIG.modePhaseOverrides.classic,
        ...(overrides.modePhaseOverrides?.classic ?? {}),
      },
      survival: {
        ...DEFAULT_MUSIC_CONFIG.modePhaseOverrides.survival,
        ...(overrides.modePhaseOverrides?.survival ?? {}),
      },
    },
    sceneMusic: {
      ...DEFAULT_MUSIC_CONFIG.sceneMusic,
      ...(overrides.sceneMusic ?? {}),
    },
    minigameProfiles: overrides.minigameProfiles ?? DEFAULT_MUSIC_CONFIG.minigameProfiles,
    minigameCategoryMusic: {
      ...DEFAULT_MUSIC_CONFIG.minigameCategoryMusic,
      ...(overrides.minigameCategoryMusic ?? {}),
    },
    contextMusic: {
      ...DEFAULT_MUSIC_CONFIG.contextMusic,
      ...(overrides.contextMusic ?? {}),
    },
  }
}

function modeMatches(profileModes: readonly MusicConfigMode[], mode: GameMode): boolean {
  return profileModes.includes('any') || profileModes.includes(mode)
}

export function getMinigameMusicProfile(
  gameKey: string | null | undefined,
  mode: GameMode = 'classic',
  config: MusicConfigDocument = DEFAULT_MUSIC_CONFIG
): MinigameMusicProfile | undefined {
  if (!gameKey) return undefined
  return config.minigameProfiles.find(
    (profile) => modeMatches(profile.modes, mode) && profile.gameKeys.includes(gameKey)
  )
}

export function getMinigameStageSelection(
  profile: MinigameMusicProfile,
  stage: string | null | undefined
): MusicSelection {
  if (stage && stage in profile.stages) {
    return profile.stages[stage as MusicMinigameStage] ?? profile.defaultSelection
  }
  return profile.defaultSelection
}

export function getModePhaseSelection(
  mode: GameMode,
  phase: string,
  config: MusicConfigDocument = DEFAULT_MUSIC_CONFIG
): MusicSelection | undefined {
  const modeOverride = config.modePhaseOverrides[mode]?.[phase as Phase]
  if (modeOverride && modeOverride.kind !== 'inherit') return modeOverride
  return config.phaseMusic[phase as Phase]
}

export function hasDeclaredMinigamePolicy(
  gameKey: string,
  category: GameCategory,
  config: MusicConfigDocument = DEFAULT_MUSIC_CONFIG
): boolean {
  return (
    config.minigameProfiles.some((profile) => profile.gameKeys.includes(gameKey)) ||
    config.minigameCategoryMusic[category] !== undefined
  )
}

function isGameOverHash(hash: string): boolean {
  return /^#\/game-?over(?:[/?#]|$)/.test(hash)
}

function selectionToTrack(selection: MusicSelection): MusicTrack {
  return selection.kind === 'track' ? selection.track : 'none'
}

export function resolveMusicCue(
  context: MusicResolverContext,
  config: MusicConfigDocument = DEFAULT_MUSIC_CONFIG
): ResolvedMusicCue {
  const inheritedAssignments: string[] = []

  const resolveSelection = (
    selection: MusicSelection | undefined,
    assignmentId: string,
    source: MusicResolutionSource,
    transition?: MusicTransitionPolicy
  ): ResolvedMusicCue | null => {
    if (!selection || selection.kind === 'inherit') {
      inheritedAssignments.push(assignmentId)
      return null
    }
    return {
      track: selectionToTrack(selection),
      selection,
      assignmentId,
      source,
      inheritedAssignments: [...inheritedAssignments],
      ...(transition ? { transition } : {}),
    }
  }

  const sceneCue = resolveSelection(
    config.sceneMusic[context.musicScene],
    `scene.${context.musicScene}`,
    'scene'
  )
  if (sceneCue) return sceneCue

  if (context.finalePhase === 'seasonComplete') {
    const finaleCue = resolveSelection(
      config.contextMusic.seasonComplete,
      'context.season-complete',
      'finale'
    )
    if (finaleCue) return finaleCue
  }

  if (isGameOverHash(context.routeHash)) {
    const routeCue = resolveSelection(config.contextMusic.gameOver, 'context.game-over', 'route')
    if (routeCue) return routeCue
  }

  const minigame = context.minigame
  if (minigame?.gameKey) {
    const profile = getMinigameMusicProfile(minigame.gameKey, context.mode, config)
    if (profile) {
      const profileCue = resolveSelection(
        getMinigameStageSelection(profile, minigame.stage),
        `${profile.id}.${minigame.stage ?? 'default'}`,
        'minigame',
        profile.transition
      )
      if (profileCue) return profileCue
    } else {
      inheritedAssignments.push(`minigame.${minigame.gameKey}.unassigned`)
    }

    if (minigame.category) {
      const categoryCue = resolveSelection(
        config.minigameCategoryMusic[minigame.category],
        `minigame-category.${minigame.category}`,
        'minigame-category'
      )
      if (categoryCue) return categoryCue
    }
  }

  if (context.spectatorActive) {
    const spectatorCue = resolveSelection(
      config.contextMusic.spectator,
      'context.spectator',
      'spectator'
    )
    if (spectatorCue) return spectatorCue
  }

  if (context.socialOpen) {
    const socialCue = resolveSelection(config.contextMusic.social, 'context.social', 'social')
    if (socialCue) return socialCue
  }

  const phaseCue = resolveSelection(
    getModePhaseSelection(context.mode, context.gamePhase, config),
    `phase.${context.mode}.${context.gamePhase}`,
    'phase'
  )
  if (phaseCue) return phaseCue

  return (
    resolveSelection(config.contextMusic.fallback, 'context.fallback', 'fallback') ?? {
      track: 'none',
      selection: SILENT_MUSIC,
      assignmentId: 'context.emergency-silence',
      source: 'fallback',
      inheritedAssignments: [...inheritedAssignments],
    }
  )
}
