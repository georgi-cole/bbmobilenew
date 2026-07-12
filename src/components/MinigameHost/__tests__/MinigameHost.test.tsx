import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { GameRegistryEntry } from '../../../minigames/registry'
import MinigameHost from '../MinigameHost'

vi.mock('../../../services/sound/SoundManager', () => ({
  SoundManager: {
    play: vi.fn(),
  },
}))

vi.mock('../../../minigames/LegacyMinigameWrapper', () => ({
  default: ({
    onComplete,
  }: {
    onComplete: (result: { value: number }) => void
  }) => (
    <button onClick={() => onComplete({ value: 5 })} type="button">
      Finish Test Game
    </button>
  ),
}))

const baseGame = {
  key: 'unit-test-game',
  title: 'Unit Test Game',
  description: 'Unit test description',
  instructions: ['Do the thing'],
  metricLabel: 'Score',
  metricKind: 'points',
  scoringAdapter: 'higherBetter',
  timeLimitMs: 30_000,
  minPlayers: 2,
  maxPlayers: 16,
  difficulty: 'easy',
  tags: [],
  authoritative: false,
  legacy: {},
  weight: 1,
  category: 'mental',
  retired: false,
  implementation: 'legacy',
} as unknown as GameRegistryEntry

const makeParticipants = (humanScore: number, aiScore: number) => [
  {
    id: 'human',
    name: 'You',
    isHuman: true,
    precomputedScore: humanScore,
    previousPR: null,
  },
  {
    id: 'ai-1',
    name: 'CPU One',
    isHuman: false,
    precomputedScore: aiScore,
    previousPR: null,
  },
]

describe('MinigameHost competition retry', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.clearAllMocks()
  })

  it('offers retry in the results panel when the human exits early and finishes last', () => {
    const onWatch = vi.fn((onReward: () => void) => onReward())
    const onContinueWithoutRetry = vi.fn()

    render(
      <MinigameHost
        game={baseGame}
        onDone={vi.fn()}
        skipRules
        skipCountdown
        participants={makeParticipants(0, 50)}
        competitionRetry={{
          enabled: true,
          onWatch,
          onContinueWithoutRetry,
        }}
      />,
    )

    act(() => {
      vi.runAllTimers()
    })

    fireEvent.click(screen.getByRole('button', { name: 'Exit minigame' }))

    expect(screen.getByText('Watch a short ad to retry before this result is locked in.')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'See full ranking' })).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'Reverse time' }))

    expect(onWatch).toHaveBeenCalledTimes(1)
    expect(screen.getByRole('button', { name: 'Exit minigame' })).toBeInTheDocument()
    expect(screen.queryByText('🚪 Exited Early')).toBeNull()
    expect(onContinueWithoutRetry).not.toHaveBeenCalled()
  })

  it('does not offer retry when the human did not finish last', () => {
    render(
      <MinigameHost
        game={baseGame}
        onDone={vi.fn()}
        skipRules
        skipCountdown
        participants={makeParticipants(100, 1)}
        competitionRetry={{
          enabled: true,
          onWatch: vi.fn(),
        }}
      />,
    )

    act(() => {
      vi.runAllTimers()
    })

    fireEvent.click(screen.getByRole('button', { name: 'Finish Test Game' }))

    expect(screen.queryByRole('button', { name: 'Reverse time' })).toBeNull()
    expect(screen.getByRole('button', { name: 'Continue ▶' })).toBeInTheDocument()
  })

  it('uses the alternative-universe treatment when the human organically finishes last', () => {
    render(
      <MinigameHost
        game={baseGame}
        onDone={vi.fn()}
        skipRules
        skipCountdown
        participants={makeParticipants(0, 50)}
        competitionRetry={{ enabled: true, onWatch: vi.fn() }}
      />,
    )

    act(() => {
      vi.runAllTimers()
    })

    fireEvent.click(screen.getByRole('button', { name: 'Finish Test Game' }))

    expect(screen.getByText('Alternative universe')).toBeInTheDocument()
    expect(screen.getByText('Is this real?')).toBeInTheDocument()
    expect(screen.getByText(/somehow you finished last/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Reverse time' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /continue/i })).toBeNull()
  })
})
