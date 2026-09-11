import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MusicCueEngine } from '../../../src/services/sound/MusicCueEngine'
import { createDefaultMusicCue } from '../../../src/services/sound/musicCue'

function installAudioContextMock() {
  const source = { connect: vi.fn() }
  const gain = { gain: { value: 1 }, connect: vi.fn() }
  // Match the browser BiquadFilter default that caused effectPreset='none' to
  // sound low-passed before the engine explicitly neutralised the graph.
  const filter = {
    type: 'lowpass',
    frequency: { value: 350 },
    Q: { value: 1 },
    gain: { value: 0 },
    connect: vi.fn(),
  }

  class FakeAudioContext {
    state = 'running'
    destination = {}
    resume = vi.fn(async () => undefined)
    createMediaElementSource = vi.fn(() => source)
    createGain = vi.fn(() => gain)
    createBiquadFilter = vi.fn(() => filter)
  }

  vi.stubGlobal('AudioContext', FakeAudioContext)
  return { filter, gain }
}

beforeEach(() => {
  vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined)
  vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {})
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('MusicCueEngine', () => {
  it('starts at the configured segment and loops inside its cue boundary', async () => {
    const engine = new MusicCueEngine()
    const cue = {
      ...createDefaultMusicCue('competition'),
      id: 'segment',
      startAtSec: 10,
      endAtSec: 20,
      loop: true,
      loopStartSec: 12,
      loopEndSec: 18,
    }

    await engine.play(
      {
        key: 'music:test',
        track: 'competition',
        src: '/test.mp3',
        volume: 0.5,
        loop: true,
      },
      cue
    )

    const element = engine.currentElement!
    expect(element.currentTime).toBe(10)
    element.currentTime = 0
    element.dispatchEvent(new Event('loadedmetadata'))
    expect(element.currentTime).toBe(10)
    element.currentTime = 18
    element.dispatchEvent(new Event('timeupdate'))
    expect(element.currentTime).toBe(12)
  })

  it('keeps effectPreset none acoustically transparent while using the Web Audio gain graph', async () => {
    const { filter, gain } = installAudioContextMock()
    const engine = new MusicCueEngine()

    await engine.play(
      { key: 'music:clear', track: 'nominations', src: '/clear.mp3', volume: 0.8, loop: true },
      { ...createDefaultMusicCue('nominations'), id: 'clear' }
    )

    expect(filter.type).toBe('allpass')
    expect(gain.gain.value).toBe(0.8)
    expect(engine.currentElement?.volume).toBe(1)
  })

  it('still applies the distant-room low-pass preset when requested', async () => {
    const { filter } = installAudioContextMock()
    const engine = new MusicCueEngine()

    await engine.play(
      { key: 'music:muffled', track: 'nominations', src: '/muffled.mp3', volume: 1, loop: true },
      {
        ...createDefaultMusicCue('nominations'),
        id: 'muffled',
        effectPreset: 'muffled',
      }
    )

    expect(filter.type).toBe('lowpass')
    expect(filter.frequency.value).toBe(900)
  })

  it('uses a second deck for a configured crossfade', async () => {
    vi.useFakeTimers()
    const engine = new MusicCueEngine()
    const asset = {
      key: 'music:test',
      track: 'competition' as const,
      src: '/test.mp3',
      volume: 1,
      loop: true,
    }
    await engine.play(asset, { ...createDefaultMusicCue('competition'), id: 'a' })
    const first = engine.currentElement
    const pending = engine.play(asset, {
      ...createDefaultMusicCue('competition'),
      id: 'b',
      startAtSec: 30,
      crossfadeMs: 200,
    })
    await vi.runAllTimersAsync()
    await pending
    expect(engine.currentElement).not.toBe(first)
  })

  it('uses an external entry fade when crossing from legacy music', async () => {
    vi.useFakeTimers()
    const engine = new MusicCueEngine()
    const pending = engine.play(
      { key: 'music:test', track: 'competition', src: '/test.mp3', volume: 1, loop: true },
      { ...createDefaultMusicCue('competition'), id: 'external', startAtSec: 20 },
      { entryFadeMs: 200 }
    )
    await vi.runAllTimersAsync()
    await pending
    expect(engine.currentElement?.volume).toBe(1)
  })

  it('keeps only the newest cue when async play requests resolve out of order', async () => {
    const playSpy = vi.mocked(HTMLMediaElement.prototype.play)
    const pauseSpy = vi.mocked(HTMLMediaElement.prototype.pause)
    let releaseFirstPlay!: () => void
    playSpy
      .mockImplementationOnce(
        () =>
          new Promise<void>((resolve) => {
            releaseFirstPlay = resolve
          })
      )
      .mockResolvedValueOnce(undefined)

    const engine = new MusicCueEngine()
    const asset = {
      key: 'music:test',
      track: 'competition' as const,
      src: '/test.mp3',
      volume: 1,
      loop: true,
    }

    const first = engine.play(asset, {
      ...createDefaultMusicCue('competition'),
      id: 'first',
      startAtSec: 10,
    })
    const second = engine.play(asset, {
      ...createDefaultMusicCue('competition'),
      id: 'second',
      startAtSec: 20,
    })

    await second
    releaseFirstPlay()
    // Replacing a cue is ordinary navigation, not a playback failure. The
    // caller can safely await the older request without touching the new deck.
    await expect(first).resolves.toBeUndefined()

    expect(engine.currentCue?.id).toBe('second')
    expect(engine.currentElement?.currentTime).toBe(20)
    expect(pauseSpy).toHaveBeenCalledTimes(1)
  })

  it('quietly finishes an older promoted cue that is superseded while its crossfade is running', async () => {
    vi.useFakeTimers()
    const engine = new MusicCueEngine()
    const asset = {
      key: 'music:test',
      track: 'competition' as const,
      src: '/test.mp3',
      volume: 1,
      loop: true,
    }

    await engine.play(asset, { ...createDefaultMusicCue('competition'), id: 'base' })
    const middle = engine.play(asset, {
      ...createDefaultMusicCue('competition'),
      id: 'middle',
      crossfadeMs: 400,
    })
    const middleCompletion = expect(middle).resolves.toBeUndefined()
    await Promise.resolve()
    await Promise.resolve()
    expect(engine.currentCue?.id).toBe('middle')

    const newest = engine.play(asset, {
      ...createDefaultMusicCue('competition'),
      id: 'newest',
      crossfadeMs: 0,
    })
    await newest
    await vi.runAllTimersAsync()

    await middleCompletion
    expect(engine.currentCue?.id).toBe('newest')
  })

  it('does not allow an explicitly stopped pending cue to become active later', async () => {
    const playSpy = vi.mocked(HTMLMediaElement.prototype.play)
    let releasePlay!: () => void
    playSpy.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          releasePlay = resolve
        })
    )

    const engine = new MusicCueEngine()
    const pending = engine.play(
      { key: 'music:test', track: 'competition', src: '/test.mp3', volume: 1, loop: true },
      { ...createDefaultMusicCue('competition'), id: 'pending' }
    )

    engine.stop()
    releasePlay()

    await expect(pending).resolves.toBeUndefined()
    expect(engine.currentElement).toBeNull()
    expect(engine.currentCue).toBeNull()
  })
})
