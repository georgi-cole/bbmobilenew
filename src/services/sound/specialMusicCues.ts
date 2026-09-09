import type { ConfessionalMusicMode } from '../../store/uiSlice'
import {
  BUILT_IN_MUSIC_CUE_IDS,
  DEFAULT_MUSIC_CUES,
  musicTrack,
  type MusicConfigDocument,
  type MusicResolutionSource,
  type NonSilentMusicTrack,
  type ResolvedMusicCue,
} from './musicConfig'
import type { MusicCueDefinition } from './musicCue'

function configuredCue(config: MusicConfigDocument | undefined, id: string): MusicCueDefinition {
  return config?.musicCues[id] ?? DEFAULT_MUSIC_CUES[id]
}

function resolvedCue(
  cue: MusicCueDefinition,
  assignmentId: string,
  source: MusicResolutionSource
): ResolvedMusicCue {
  const track = cue.track as NonSilentMusicTrack
  return {
    track,
    selection: musicTrack(track, cue.id),
    assignmentId,
    source,
    inheritedAssignments: [],
    playbackCue: cue,
  }
}

function isConfessionalRoute(hash: string): boolean {
  const route = hash.replace(/^#/, '').split('?')[0]?.replace(/^\//, '') ?? ''
  return route === 'diary-room' || route.startsWith('diary-room/')
}

export function resolveSpecialMusicCue({
  baseCue,
  gamePhase,
  hash,
  confessionalMusicMode,
  config,
}: {
  baseCue: ResolvedMusicCue
  gamePhase: string
  hash: string
  confessionalMusicMode: ConfessionalMusicMode
  config?: MusicConfigDocument
}): ResolvedMusicCue | null {
  if (isConfessionalRoute(hash)) {
    const cue =
      confessionalMusicMode === 'vote-committed'
        ? configuredCue(config, BUILT_IN_MUSIC_CUE_IDS.confessionalVoteCommit)
        : configuredCue(config, BUILT_IN_MUSIC_CUE_IDS.confessional)
    return resolvedCue(cue, cue.id, 'route')
  }

  if (baseCue.source !== 'phase') return null

  let cueId: string | null = null
  if (gamePhase === 'social_1' && baseCue.track === 'none') {
    cueId = BUILT_IN_MUSIC_CUE_IDS.competitionToNominations
  } else if (
    ['nominations', 'nomination_results', 'pre_veto_public_save'].includes(gamePhase) &&
    baseCue.track === 'nominations'
  ) {
    cueId = BUILT_IN_MUSIC_CUE_IDS.nominations
  } else if (
    ['pos_ceremony', 'pos_ceremony_results', 'social_2'].includes(gamePhase) &&
    (baseCue.track === 'veto' || baseCue.track === 'move_into_me_instrumental_general')
  ) {
    cueId = BUILT_IN_MUSIC_CUE_IDS.safety
  } else if (
    ['live_vote', 'eviction_results', 'week_end'].includes(gamePhase) &&
    (baseCue.track === 'veto' || baseCue.track === 'move_into_me_instrumental_general')
  ) {
    cueId = BUILT_IN_MUSIC_CUE_IDS.elimination
  }

  if (cueId) {
    const cue = configuredCue(config, cueId)
    return resolvedCue(cue, cue.id, 'phase')
  }

  return null
}
