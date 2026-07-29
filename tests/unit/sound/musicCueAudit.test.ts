import { describe, expect, it } from 'vitest'
import { auditMusicConfig } from '../../../src/services/sound/musicConfigAudit'
import { createMusicConfig, musicTrack } from '../../../src/services/sound/musicConfig'
import { createDefaultMusicCue } from '../../../src/services/sound/musicCue'

describe('music cue configuration audit', () => {
  it('reports invalid fallback cycles and missing assignment cues', () => {
    const first = {
      ...createDefaultMusicCue('competition'),
      id: 'first',
      displayName: 'First',
      fallbackCueId: 'second',
    }
    const second = {
      ...createDefaultMusicCue('competition'),
      id: 'second',
      displayName: 'Second',
      fallbackCueId: 'first',
    }
    const config = createMusicConfig({
      musicCues: { first, second },
      phaseMusic: { loh_comp: musicTrack('competition', 'missing') },
    })
    const codes = auditMusicConfig(config).map((issue) => issue.code)
    expect(codes).toContain('cue-fallback-cycle')
    expect(codes).toContain('missing-assignment-cue')
  })
})
