import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  hasSameResolvedPlayback,
  shouldCrossfadeManagedMinigameCue,
} from '../../../src/services/sound/musicCueTransitions'
import { musicTrack, type ResolvedMusicCue } from '../../../src/services/sound/musicConfig'
import { createDefaultMusicCue } from '../../../src/services/sound/musicCue'
import { resolveRuntimeMusicMix } from '../../../src/services/sound/musicMix'
import type { RootState } from '../../../src/store/store'

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

  it('mutes the gameplay bed while the Twin Shock cinematic owns audio', () => {
    const game = {
      phase: 'nominations',
      evictionOverlayPlayerId: null,
      battleBack: null,
      voteResults: null,
      twinShock: { pendingRevealAnimation: { type: 'combined' } },
    } as unknown as RootState['game']

    expect(resolveRuntimeMusicMix(game)).toBe('muted')
  })

  it.each(['nominations', 'pos_ceremony', 'pos_ceremony_results', 'social_2'] as const)(
    'restores full music volume in %s even when old vote results remain in Redux',
    (phase) => {
      const game = {
        phase,
        evictionOverlayPlayerId: null,
        battleBack: null,
        voteResults: { nova: 3, rae: 1 },
        twinShock: null,
      } as unknown as RootState['game']

      expect(resolveRuntimeMusicMix(game)).toBe('normal')
    }
  )

  it.each(['live_vote', 'eviction_results'] as const)(
    'ducks the gameplay bed while the vote tally is active in %s',
    (phase) => {
      const game = {
        phase,
        evictionOverlayPlayerId: null,
        battleBack: null,
        voteResults: { nova: 3, rae: 1 },
        twinShock: null,
      } as unknown as RootState['game']

      expect(resolveRuntimeMusicMix(game)).toBe('ducked')
    }
  )

  it('ducks the gameplay bed while the elimination overlay is active', () => {
    const game = {
      phase: 'final4_eviction',
      evictionOverlayPlayerId: 'nova',
      battleBack: null,
      voteResults: null,
      twinShock: null,
    } as unknown as RootState['game']

    expect(resolveRuntimeMusicMix(game)).toBe('ducked')
  })

  it('forwards live vote and eviction presentation state into the music resolver', () => {
    const source = readFileSync(
      resolve(process.cwd(), 'src/services/sound/AudioStateSync.tsx'),
      'utf8'
    )

    expect(source).toContain('voteResults: root.game.voteResults')
    expect(source).toContain('evictionOverlayPlayerId: root.game.evictionOverlayPlayerId ?? null')
    expect(source).toContain('voteResults: musicState.voteResults')
    expect(source).toContain('evictionOverlayPlayerId: musicState.evictionOverlayPlayerId')
  })
})
