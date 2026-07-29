import { describe, expect, it } from 'vitest'
import {
  createDefaultMusicCue,
  isAdvancedMusicCue,
  musicCueSignature,
  validateMusicCueDefinition,
} from '../../../src/services/sound/musicCue'

describe('music cue definitions', () => {
  it('creates a backward-compatible full-track cue', () => {
    const cue = createDefaultMusicCue('competition', true)
    expect(cue.startAtSec).toBe(0)
    expect(cue.loop).toBe(true)
    expect(cue.effectPreset).toBe('none')
    expect(isAdvancedMusicCue(cue)).toBe(false)
  })

  it('detects advanced segment and transition controls', () => {
    const cue = { ...createDefaultMusicCue('competition'), startAtSec: 12, crossfadeMs: 900 }
    expect(isAdvancedMusicCue(cue)).toBe(true)
    expect(musicCueSignature(cue, 'music:competition')).toContain('music:competition')
  })

  it('rejects invalid cue boundaries', () => {
    const cue = { ...createDefaultMusicCue('competition'), startAtSec: 20, endAtSec: 10 }
    expect(validateMusicCueDefinition(cue).map((issue) => issue.code)).toContain('invalid-end')
  })
})
