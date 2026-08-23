import { act, cleanup, render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import WinnerTileLiftAnimation from '../src/components/WinnerTileLiftAnimation/WinnerTileLiftAnimation'

describe('WinnerTileLiftAnimation', () => {
  let animationFrames: FrameRequestCallback[]
  let originalVisualViewport: VisualViewport | null

  beforeEach(() => {
    originalVisualViewport = window.visualViewport
    vi.useFakeTimers()
    animationFrames = []
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
      animationFrames.push(callback)
      return animationFrames.length
    })
    vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => undefined)
  })

  afterEach(() => {
    cleanup()
    vi.useRealTimers()
    vi.restoreAllMocks()
    document.body.replaceChildren()
    Object.defineProperty(window, 'visualViewport', {
      configurable: true,
      value: originalVisualViewport,
    })
  })

  function flushAnimationFrame() {
    const callbacks = animationFrames.splice(0)
    act(() => callbacks.forEach((callback) => callback(performance.now())))
  }

  it('lifts a frozen copy, attaches the badge, remeasures the return, and restores the source', () => {
    const source = document.createElement('div')
    source.dataset.ceremonyTile = 'true'
    source.style.background = 'rgb(10, 20, 30)'
    source.innerHTML = '<span>Alice</span>'
    document.body.append(source)

    let rect = new DOMRect(22, 48, 72, 72)
    vi.spyOn(source, 'getBoundingClientRect').mockImplementation(() => rect)
    const onDone = vi.fn()

    render(
      <WinnerTileLiftAnimation
        targetIds={['alice']}
        tiles={[{ rect: null, badge: '👑', badgeLabel: 'Alice wins LOH' }]}
        caption="Alice wins Leader of the House!"
        resolveTarget={() => source}
        onDone={onDone}
      />
    )

    flushAnimationFrame()

    expect(source.style.visibility).toBe('hidden')
    expect(source.dataset.ceremonyTileLifted).toBe('true')
    expect(document.querySelector('.winner-tile-lift__snapshot')?.textContent).toContain('Alice')
    expect(document.querySelector('.ceremony-overlay__dim')).toBeNull()

    flushAnimationFrame()
    flushAnimationFrame()
    expect(document.querySelector('[data-winner-tile-lift-phase="lifted"]')).not.toBeNull()

    act(() => vi.advanceTimersByTime(520))
    expect(document.querySelector('[data-winner-tile-lift-phase="awarded"]')).not.toBeNull()
    expect(document.querySelector('.winner-tile-lift__badge')?.textContent).toBe('👑')

    rect = new DOMRect(108, 226, 64, 64)
    act(() => vi.advanceTimersByTime(1720))
    const liftedTile = document.querySelector<HTMLElement>('.winner-tile-lift__tile')
    expect(document.querySelector('[data-winner-tile-lift-phase="returning"]')).not.toBeNull()
    expect(liftedTile?.style.left).toBe('108px')
    expect(liftedTile?.style.top).toBe('226px')
    expect(liftedTile?.style.width).toBe('64px')

    act(() => vi.advanceTimersByTime(560))
    expect(onDone).toHaveBeenCalledTimes(1)
    expect(source.style.visibility).toBe('')
    expect(source.dataset.ceremonyTileLifted).toBeUndefined()
  })

  it('finishes safely when the roster tile never becomes measurable', () => {
    const onDone = vi.fn()
    render(
      <WinnerTileLiftAnimation
        targetIds={['missing']}
        tiles={[{ rect: null, badge: '🛡️' }]}
        caption="Winner"
        resolveTarget={() => null}
        onDone={onDone}
      />
    )

    for (let frame = 0; frame < 24; frame += 1) flushAnimationFrame()

    expect(onDone).toHaveBeenCalledTimes(1)
    expect(document.querySelector('.winner-tile-lift')).toBeNull()
  })

  it('fits paired winners inside a compact visual viewport', () => {
    Object.defineProperty(window, 'visualViewport', {
      configurable: true,
      value: {
        width: 320,
        height: 640,
        offsetLeft: 7,
        offsetTop: 11,
      },
    })
    const sources = ['Alice', 'Bob'].map((name, index) => {
      const source = document.createElement('div')
      source.textContent = name
      source.getBoundingClientRect = vi.fn(() => new DOMRect(12 + index * 70, 90, 62, 62))
      document.body.append(source)
      return source
    })

    render(
      <WinnerTileLiftAnimation
        targetIds={['alice', 'bob']}
        tiles={[
          { rect: null, badge: '👑' },
          { rect: null, badge: '👑' },
        ]}
        caption="Alice & Bob win!"
        resolveTarget={(id) => sources[id === 'alice' ? 0 : 1]}
        onDone={vi.fn()}
      />
    )

    flushAnimationFrame()
    flushAnimationFrame()
    flushAnimationFrame()

    const liftedTiles = [...document.querySelectorAll<HTMLElement>('.winner-tile-lift__tile')]
    expect(liftedTiles).toHaveLength(2)
    expect(liftedTiles.map((tile) => tile.style.width)).toEqual(['112px', '112px'])
    expect(Number.parseFloat(liftedTiles[0].style.left)).toBeGreaterThanOrEqual(7)
    expect(
      Number.parseFloat(liftedTiles[1].style.left) + Number.parseFloat(liftedTiles[1].style.width)
    ).toBeLessThanOrEqual(327)
  })

  it('restores the real tile if the animation is interrupted', () => {
    const source = document.createElement('div')
    source.getBoundingClientRect = vi.fn(() => new DOMRect(20, 40, 70, 70))
    document.body.append(source)
    const onDone = vi.fn()
    const view = render(
      <WinnerTileLiftAnimation
        targetIds={['alice']}
        tiles={[{ rect: null, badge: '👑' }]}
        caption="Alice wins"
        resolveTarget={() => source}
        onDone={onDone}
      />
    )

    flushAnimationFrame()
    expect(source.style.visibility).toBe('hidden')

    view.unmount()

    expect(source.style.visibility).toBe('')
    expect(source.dataset.ceremonyTileLifted).toBeUndefined()
    expect(onDone).not.toHaveBeenCalled()
  })
})
