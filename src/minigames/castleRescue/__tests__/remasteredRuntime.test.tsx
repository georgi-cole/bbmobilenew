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
    expect(container.querySelector('canvas')).toHaveAttribute('data-game-edition', 'remastered')
  })
})
