import { describe, expect, it } from 'vitest'
import {
  hasSameResolvedPlayback,
  shouldCrossfadeManagedMinigameCue,
} from '../../../src/services/sound/musicCueTransitions'
import { musicTrack, type ResolvedMusicCue } from '../../../src/services/sound/musicConfig'
import { createDefaultMusicCue } from '../../../src/services/sound/musicCue'

function managedCue(id: string, startAtSec: number): ResolvedMusicCue {
  return {
    track: 'competition',
    selection: musicTrack('competition', id),
    assignmentId: `minigame.classic.demo.playing.${id}`,
    source: 'minigame',
    inheritedAssignments: [],
    transition: { fadeInMs: 500, postGameHoldMs: 1000, fadeOutMs: 700, managedLifecycle: true },
    playbackCue: {
      ...createDefaultMusicCue('competition'),
      id,
      displayName: id,
      startAtSec,
      crossfadeMs: 600,
      restartPolicy: 'restart',
    },
  }
}

describe('managed minigame cue transitions', () => {
  it('crossfades changed variants and ignores identical resolver updates', () => {
    const normal = managedCue('normal', 0)
    const finalRound = managedCue('final', 45)
    expect(hasSameResolvedPlayback(normal, normal)).toBe(true)
    expect(shouldCrossfadeManagedMinigameCue(normal, finalRound)).toBe(true)
    expect(shouldCrossfadeManagedMinigameCue(normal, normal)).toBe(false)
  })
})
