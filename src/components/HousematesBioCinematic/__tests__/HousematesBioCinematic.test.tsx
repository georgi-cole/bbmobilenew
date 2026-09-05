import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import HousematesBioCinematic from '../HousematesBioCinematic'

const cinematicAudio = {
  play: vi.fn(),
  fadeOutAndStop: vi.fn(),
  dispose: vi.fn(),
}

vi.mock('framer-motion', async () => {
  const React = await import('react')
  const motion = new Proxy(
    {},
    {
      get:
        (_target, tag: string) =>
        ({
          children,
          initial: _initial,
          animate: _animate,
          exit: _exit,
          transition: _transition,
          whileTap: _whileTap,
          ...props
        }: React.HTMLAttributes<HTMLElement> & Record<string, unknown>) =>
          React.createElement(tag, props, children),
    }
  )
  return {
    AnimatePresence: ({ children }: { children: React.ReactNode }) =>
      React.createElement(React.Fragment, null, children),
    motion,
    useReducedMotion: () => true,
  }
})

vi.mock('../../../services/sound/SoundManager', () => ({
  SoundManager: {
    panicStopAllMusic: vi.fn(),
    syncMusic: vi.fn(),
  },
}))

vi.mock('../../../services/sound/cinematicAudio', () => ({
  createCinematicAudio: vi.fn(() => cinematicAudio),
}))

describe('Housemates archive', () => {
  it('changes from an intro segment into a browseable map and side-by-side profile', async () => {
    render(<HousematesBioCinematic onComplete={vi.fn()} />)

    await waitFor(() => expect(screen.getByRole('button', { name: /aria/i })).toBeInTheDocument())
    const ariaNode = screen.getByRole('button', { name: /aria/i })
    fireEvent.click(ariaNode)

    expect(screen.getByRole('heading', { name: 'Aria' })).toBeTruthy()
    expect(screen.getByText(/i.m aria from/i)).toBeTruthy()
    expect(document.querySelector('.hbc-profile__portrait')).toHaveAttribute('alt', 'Aria Colombo')

    fireEvent.click(screen.getByRole('button', { name: /^next/i }))
    expect(screen.getByRole('heading', { name: 'Ash' })).toBeTruthy()
  })

  it('loops the housemates music and provides an exit at every point', async () => {
    const onComplete = vi.fn()
    render(<HousematesBioCinematic onComplete={onComplete} />)

    const { createCinematicAudio } = await import('../../../services/sound/cinematicAudio')
    expect(createCinematicAudio).toHaveBeenCalledWith(
      expect.stringContaining('/assets/sounds/cinematic/HousematesBio.mp4'),
      0.78,
      { loop: true }
    )
    fireEvent.click(screen.getByRole('button', { name: 'Exit Housemates' }))
    expect(onComplete).toHaveBeenCalledTimes(1)
  })
})
