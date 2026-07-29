import type { ResolvedMusicCue } from './musicConfig'
import { musicCueSignature } from './musicCue'

function isManagedMinigameCue(cue: ResolvedMusicCue): boolean {
  return (
    cue.source === 'minigame' &&
    cue.selection.kind === 'track' &&
    cue.transition?.managedLifecycle === true
  )
}

export function hasSameResolvedPlayback(
  previousCue: ResolvedMusicCue,
  nextCue: ResolvedMusicCue
): boolean {
  if (previousCue.track !== nextCue.track || previousCue.assignmentId !== nextCue.assignmentId) {
    return false
  }
  const previousSignature = previousCue.playbackCue
    ? musicCueSignature(previousCue.playbackCue)
    : ''
  const nextSignature = nextCue.playbackCue ? musicCueSignature(nextCue.playbackCue) : ''
  return previousSignature === nextSignature
}

export function shouldCrossfadeManagedMinigameCue(
  previousCue: ResolvedMusicCue,
  nextCue: ResolvedMusicCue
): boolean {
  return (
    isManagedMinigameCue(previousCue) &&
    isManagedMinigameCue(nextCue) &&
    !hasSameResolvedPlayback(previousCue, nextCue)
  )
}
