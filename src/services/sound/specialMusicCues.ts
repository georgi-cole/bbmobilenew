import type { ConfessionalMusicMode } from '../../store/uiSlice'
import type { CatalogMusicTrack } from './musicCatalog'
import {
  musicTrack,
  type MusicResolutionSource,
  type NonSilentMusicTrack,
  type ResolvedMusicCue,
} from './musicConfig'
import type { MusicCueDefinition } from './musicCue'

const GENERAL_TRACK = 'move_into_me_instrumental_general' as CatalogMusicTrack
const CONFESSIONAL_TRACK = 'move_into_me_confessional' as CatalogMusicTrack

const COMPETITION_TO_NOMINATION_CUE: MusicCueDefinition = {
  id: 'ceremony:competition-to-nominations',
  displayName: 'Competition bed — hold to nominations',
  track: 'competition',
  startAtSec: 0,
  loop: true,
  volume: 1,
  fadeInMs: 0,
  fadeOutMs: 650,
  crossfadeMs: 650,
  restartPolicy: 'continue',
  effectPreset: 'none',
}

const NOMINATION_CEREMONY_CUE: MusicCueDefinition = {
  id: 'ceremony:nominations-soft-exit',
  displayName: 'Nominations ceremony — soft exit',
  track: 'nominations',
  startAtSec: 0,
  loop: true,
  volume: 1,
  fadeInMs: 0,
  fadeOutMs: 1000,
  crossfadeMs: 650,
  restartPolicy: 'continue',
  effectPreset: 'none',
}

const SAFETY_CEREMONY_CUE: MusicCueDefinition = {
  id: 'ceremony:power-of-safety',
  displayName: 'Power of Safety ceremony — Move Into Me',
  track: GENERAL_TRACK,
  startAtSec: 1,
  loop: true,
  volume: 1,
  fadeInMs: 900,
  fadeOutMs: 1000,
  crossfadeMs: 900,
  restartPolicy: 'restart',
  effectPreset: 'none',
}

const ELIMINATION_CEREMONY_CUE: MusicCueDefinition = {
  id: 'ceremony:elimination',
  displayName: 'Elimination ceremony — Move Into Me',
  track: GENERAL_TRACK,
  startAtSec: 114,
  loop: true,
  volume: 1,
  fadeInMs: 900,
  fadeOutMs: 1500,
  crossfadeMs: 900,
  restartPolicy: 'restart',
  effectPreset: 'none',
}

const CONFESSIONAL_LOOP_CUE: MusicCueDefinition = {
  id: 'confessional:room-loop',
  displayName: 'Confessional room loop',
  track: CONFESSIONAL_TRACK,
  startAtSec: 168,
  endAtSec: 215,
  loop: true,
  loopStartSec: 168,
  loopEndSec: 215,
  volume: 1,
  fadeInMs: 700,
  fadeOutMs: 700,
  crossfadeMs: 500,
  restartPolicy: 'restart',
  effectPreset: 'none',
}

const CONFESSIONAL_VOTE_COMMIT_CUE: MusicCueDefinition = {
  id: 'confessional:vote-commit',
  displayName: 'Confessional vote seal',
  track: CONFESSIONAL_TRACK,
  startAtSec: 146,
  endAtSec: 215,
  loop: true,
  loopStartSec: 168,
  loopEndSec: 215,
  volume: 1,
  fadeInMs: 250,
  fadeOutMs: 700,
  crossfadeMs: 300,
  restartPolicy: 'restart',
  effectPreset: 'none',
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
}: {
  baseCue: ResolvedMusicCue
  gamePhase: string
  hash: string
  confessionalMusicMode: ConfessionalMusicMode
}): ResolvedMusicCue | null {
  if (isConfessionalRoute(hash)) {
    const cue =
      confessionalMusicMode === 'vote-committed'
        ? CONFESSIONAL_VOTE_COMMIT_CUE
        : CONFESSIONAL_LOOP_CUE
    return resolvedCue(cue, cue.id, 'route')
  }

  // Preserve server/admin overrides. These ceremony replacements only take over
  // while the phase still resolves to the legacy default bed they replace.
  if (baseCue.source !== 'phase') return null

  // The LOH competition bed should not drop out during the brief post-result
  // social beat. Keep it running at full continuity until the nomination
  // ceremony takes ownership and crossfades to its own bed.
  if (gamePhase === 'social_1' && baseCue.selection.kind === 'silence') {
    return resolvedCue(
      COMPETITION_TO_NOMINATION_CUE,
      COMPETITION_TO_NOMINATION_CUE.id,
      'phase'
    )
  }

  if (
    baseCue.track === 'nominations' &&
    ['nominations', 'nomination_results', 'pre_veto_public_save'].includes(gamePhase)
  ) {
    return resolvedCue(NOMINATION_CEREMONY_CUE, NOMINATION_CEREMONY_CUE.id, 'phase')
  }

  if (
    baseCue.track === 'veto' &&
    ['pos_ceremony', 'pos_ceremony_results', 'social_2'].includes(gamePhase)
  ) {
    return resolvedCue(SAFETY_CEREMONY_CUE, SAFETY_CEREMONY_CUE.id, 'phase')
  }

  if (
    baseCue.track === 'veto' &&
    ['live_vote', 'eviction_results', 'week_end'].includes(gamePhase)
  ) {
    return resolvedCue(ELIMINATION_CEREMONY_CUE, ELIMINATION_CEREMONY_CUE.id, 'phase')
  }

  return null
}
