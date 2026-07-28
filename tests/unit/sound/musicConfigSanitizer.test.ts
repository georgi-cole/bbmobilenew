import { describe, expect, it } from 'vitest'
import {
  sanitiseMusicConfigOverrides,
  sanitiseMusicTrackAssetOverrides,
} from '../../../src/services/sound/musicConfigSanitizer'

describe('music config sanitization', () => {
  it('keeps valid semantic assignments and rejects invalid phase tracks', () => {
    const result = sanitiseMusicConfigOverrides({
      phaseMusic: {
        nominations: { kind: 'track', track: 'nominations' },
        week_start: { kind: 'track', track: 'unknown-track' },
      },
    })

    expect(result.phaseMusic).toEqual({
      nominations: { kind: 'track', track: 'nominations' },
    })
  })

  it('accepts only registered non-music event sounds and clamps volume', () => {
    const result = sanitiseMusicConfigOverrides({
      eventSounds: {
        'competition.results': { soundKey: 'music:nominations_main' },
        'finale.winner': { soundKey: 'tv:winner_reveal', volume: 2 },
        'unknown.event': { soundKey: 'ui:confirm' },
      },
    })

    expect(result.eventSounds).toEqual({
      'finale.winner': { soundKey: 'tv:winner_reveal', volume: 1 },
    })
  })

  it('rejects unsafe URLs and deduplicates valid semantic asset overrides', () => {
    expect(
      sanitiseMusicTrackAssetOverrides([
        { track: 'competition', src: 'javascript:alert(1)' },
        { track: 'unknown-track', src: 'https://example.com/unknown.mp3' },
        {
          track: 'competition',
          src: 'https://example.com/competition.mp3',
          volume: 2,
          loop: false,
        },
      ])
    ).toEqual([
      {
        track: 'competition',
        src: 'https://example.com/competition.mp3',
        volume: 1,
        loop: false,
      },
    ])
  })
})
