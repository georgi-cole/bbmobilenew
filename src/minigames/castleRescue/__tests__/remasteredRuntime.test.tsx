import { render } from '@testing-library/react'
import { beforeAll, describe, expect, it, vi } from 'vitest'
import CastleRescueGame from '../CastleRescueGame'
import {
  RemasteredBennyLennyCastleRescueGame,
  RemasteredCastleRescueGame,
} from '../RemasteredCastleRescueGames'

vi.mock('../../../services/sound/SoundManager', () => ({
  SoundManager: { play: vi.fn(), stop: vi.fn() },
}))

beforeAll(() => {
  const gradient = { addColorStop: vi.fn() }
  const context = new Proxy(
    { createLinearGradient: () => gradient, createRadialGradient: () => gradient },
    { get: (target, key) => Reflect.get(target, key) ?? vi.fn() }
  ) as unknown as CanvasRenderingContext2D
  Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', {
    configurable: true,
    value: vi.fn(() => context),
  })
  vi.spyOn(window, 'requestAnimationFrame').mockImplementation(() => 1)
})

describe('Find Your Twin production editions', () => {
  it('marks the canonical game as the original edition', () => {
    const { container } = render(<CastleRescueGame autoStart={false} />)
    expect(container.querySelector('canvas')).toHaveAttribute('data-game-edition', 'original')
  })

  it.each([
    ['part 1', RemasteredCastleRescueGame],
    ['lost again', RemasteredBennyLennyCastleRescueGame],
  ] as const)('mounts the explicit remastered renderer for %s', (_label, Component) => {
    const { container } = render(<Component autoStart={false} />)
    expect(container.querySelector('iframe')).toHaveAttribute(
      'src',
      expect.stringContaining('/minigames/twin-remastered/')
    )
    expect(container.querySelector('canvas')).toBeNull()
  })

  it('reports a trusted completion once and ignores messages from other windows', () => {
    const onFinish = vi.fn()
    const { container } = render(
      <RemasteredCastleRescueGame autoStart={false} onFinish={onFinish} />
    )
    const frame = container.querySelector('iframe')!
    const data = { type: 'twin:complete', score: 1234 }
    window.dispatchEvent(
      new MessageEvent('message', { data, origin: location.origin, source: window })
    )
    expect(onFinish).not.toHaveBeenCalled()
    for (let i = 0; i < 2; i++) {
      window.dispatchEvent(
        new MessageEvent('message', { data, origin: location.origin, source: frame.contentWindow })
      )
    }
    expect(onFinish).toHaveBeenCalledExactlyOnceWith(1234)
  })
})
