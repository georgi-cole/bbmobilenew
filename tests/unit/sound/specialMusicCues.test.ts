import { describe, expect, it } from 'vitest'
import type { ResolvedMusicCue } from '../../../src/services/sound/musicConfig'
import { resolveSpecialMusicCue } from '../../../src/services/sound/specialMusicCues'

function phaseCue(track: 'nominations' | 'veto' | 'competition'): ResolvedMusicCue {
  return {
    track,
    selection: { kind: 'track', track },
    assignmentId: `phase:${track}`,
    source: 'phase',
    inheritedAssignments: [],
  }
}

describe('specialMusicCues', () => {
  it('loops the confessional bed from 2:48 to 3:35', () => {
    const cue = resolveSpecialMusicCue({
      baseCue: phaseCue('competition'),
      gamePhase: 'social_1',
      hash: '#/diary-room',
      confessionalMusicMode: 'normal',
    })

    expect(cue?.track).toBe('move_into_me_confessional')
    expect(cue?.playbackCue).toMatchObject({
      startAtSec: 168,
      endAtSec: 215,
      loop: true,
      loopStartSec: 168,
      loopEndSec: 215,
    })
  })

  it('plays the 2:26 vote seal passage once before returning to the normal loop', () => {
    const cue = resolveSpecialMusicCue({
      baseCue: phaseCue('veto'),
      gamePhase: 'live_vote',
      hash: '#/diary-room',
      confessionalMusicMode: 'vote-committed',
    })

    expect(cue?.playbackCue).toMatchObject({
      startAtSec: 146,
      endAtSec: 215,
      loop: true,
      loopStartSec: 168,
      loopEndSec: 215,
      crossfadeMs: 300,
    })
  })

  it('uses the general track from 0:01 through the Power of Safety sequence', () => {
    for (const gamePhase of ['pos_ceremony', 'pos_ceremony_results', 'social_2']) {
      const cue = resolveSpecialMusicCue({
        baseCue: phaseCue('veto'),
        gamePhase,
        hash: '#/',
        confessionalMusicMode: 'normal',
      })

      expect(cue?.track).toBe('move_into_me_instrumental_general')
      expect(cue?.playbackCue?.startAtSec).toBe(1)
      expect(cue?.playbackCue?.id).toBe('ceremony:power-of-safety')
    }
  })

  it('uses the general track from 1:54 through vote, eviction and day end', () => {
    for (const gamePhase of ['live_vote', 'eviction_results', 'week_end']) {
      const cue = resolveSpecialMusicCue({
        baseCue: phaseCue('veto'),
        gamePhase,
        hash: '#/',
        confessionalMusicMode: 'normal',
      })

      expect(cue?.track).toBe('move_into_me_instrumental_general')
      expect(cue?.playbackCue?.startAtSec).toBe(114)
      expect(cue?.playbackCue?.fadeOutMs).toBe(1500)
      expect(cue?.playbackCue?.id).toBe('ceremony:elimination')
    }
  })

  it('gives the existing nomination ceremony bed a soft exit', () => {
    const cue = resolveSpecialMusicCue({
      baseCue: phaseCue('nominations'),
      gamePhase: 'nominations',
      hash: '#/',
      confessionalMusicMode: 'normal',
    })

    expect(cue?.track).toBe('nominations')
    expect(cue?.playbackCue?.fadeOutMs).toBe(1000)
  })

  it('does not replace an admin or remote phase track override', () => {
    const cue = resolveSpecialMusicCue({
      baseCue: phaseCue('competition'),
      gamePhase: 'live_vote',
      hash: '#/',
      confessionalMusicMode: 'normal',
    })

    expect(cue).toBeNull()
  })
})
