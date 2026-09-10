import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MusicCueEngine } from '../../../src/services/sound/MusicCueEngine'
import { createDefaultMusicCue } from '../../../src/services/sound/musicCue'

beforeEach(() => {
  vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined)
  vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {})
})

afterEach(() => {
  vi.useRealTimers()
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
    await expect(first).rejects.toMatchObject({ name: 'MusicCueSupersededError' })

    expect(engine.currentCue?.id).toBe('second')
    expect(engine.currentElement?.currentTime).toBe(20)
    expect(pauseSpy).toHaveBeenCalledTimes(1)
  })

  it('rejects an older promoted cue that is superseded while its crossfade is running', async () => {
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
    const middleRejection = expect(middle).rejects.toMatchObject({
      name: 'MusicCueSupersededError',
    })
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

    await middleRejection
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
