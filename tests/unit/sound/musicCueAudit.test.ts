import { describe, expect, it } from 'vitest'
import { auditMusicConfig } from '../../../src/services/sound/musicConfigAudit'
import { createMusicConfig, musicTrack } from '../../../src/services/sound/musicConfig'
import { createDefaultMusicCue } from '../../../src/services/sound/musicCue'

describe('music cue configuration audit', () => {
  it('reports invalid cue definitions and missing assignment cues', () => {
    const broken = {
      ...createDefaultMusicCue('competition'),
      id: 'broken',
      displayName: 'Broken',
      startAtSec: 20,
      endAtSec: 10,
    }
    const config = createMusicConfig({
      musicCues: { broken },
      phaseMusic: { loh_comp: musicTrack('competition', 'missing') },
    })
    const codes = auditMusicConfig(config).map((issue) => issue.code)
    expect(codes).toContain('invalid-cue-invalid-end')
    expect(codes).toContain('missing-assignment-cue')
  })
})
