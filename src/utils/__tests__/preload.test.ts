import { afterEach, describe, expect, it, vi } from 'vitest'
import { preloadImage } from '../preload'

const NativeImage = globalThis.Image

afterEach(() => {
  vi.useRealTimers()
  Object.defineProperty(globalThis, 'Image', {
    configurable: true,
    writable: true,
    value: NativeImage,
  })
})

describe('image preloader', () => {
  it('does not report an image as loaded until decode finishes', async () => {
    let finishDecode!: () => void
    const decodePromise = new Promise<void>((resolve) => {
      finishDecode = resolve
    })

    class DecodeControlledImage {
      onload: (() => void) | null = null
      onerror: (() => void) | null = null
      complete = true
      naturalWidth = 100
      decode = vi.fn(() => decodePromise)

      set src(_value: string) {
        queueMicrotask(() => this.onload?.())
      }
    }

    Object.defineProperty(globalThis, 'Image', {
      configurable: true,
      writable: true,
      value: DecodeControlledImage,
    })

    let settled = false
    const resultPromise = preloadImage('/assets/skins/Lia_sad_avatar.webp').then((result) => {
      settled = true
      return result
    })

    await Promise.resolve()
    await Promise.resolve()
    expect(settled).toBe(false)

    finishDecode()
    await expect(resultPromise).resolves.toEqual({
      url: '/assets/skins/Lia_sad_avatar.webp',
      status: 'loaded',
    })
  })

  it('reports a timeout instead of treating a slow image as successfully loaded', async () => {
    vi.useFakeTimers()

    class NeverLoadsImage {
      onload: (() => void) | null = null
      onerror: (() => void) | null = null
      complete = false
      naturalWidth = 0
      decode = vi.fn(() => new Promise<void>(() => undefined))

      set src(_value: string) {
        // Intentionally never settles: simulates a stalled mobile connection.
      }
    }

    Object.defineProperty(globalThis, 'Image', {
      configurable: true,
      writable: true,
      value: NeverLoadsImage,
    })

    const resultPromise = preloadImage('/assets/skins/Nova_sad_avatar.webp', 50)
    await vi.advanceTimersByTimeAsync(51)

    await expect(resultPromise).resolves.toEqual({
      url: '/assets/skins/Nova_sad_avatar.webp',
      status: 'timeout',
    })
  })
})
