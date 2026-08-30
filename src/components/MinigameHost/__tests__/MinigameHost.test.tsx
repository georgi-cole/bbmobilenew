import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { GameRegistryEntry } from '../../../minigames/registry'
import MinigameHost from '../MinigameHost'

vi.mock('../../../services/sound/SoundManager', () => ({
  SoundManager: {
    play: vi.fn(),
    stop: vi.fn(),
  },
}))

vi.mock('../../../i18n/I18nContext', () => ({
  useI18n: () => ({ t: (key: string) => key }),
}))

vi.mock('../../../minigames/LegacyMinigameWrapper', () => ({
  default: ({ onComplete }: { onComplete: (result: { value: number }) => void }) => (
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

function exitMinigame() {
  fireEvent.click(screen.getByRole('button', { name: 'Open minigame menu' }))
  fireEvent.click(screen.getByRole('menuitem', { name: /Leave competition/i }))
  fireEvent.click(screen.getByRole('button', { name: 'Exit with 0' }))
}

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
      />
    )

    act(() => {
      vi.runAllTimers()
    })

    exitMinigame()

    expect(
      screen.getByText('Watch a short ad to retry before this result is locked in.')
    ).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'See full ranking' })).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'Reverse time' }))

    expect(onWatch).toHaveBeenCalledTimes(1)
    expect(screen.getByRole('button', { name: 'Open minigame menu' })).toBeInTheDocument()
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
      />
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
      />
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

  it('reports a completed result only once when Continue is activated twice', () => {
    const onDone = vi.fn()

    render(
      <MinigameHost
        game={baseGame}
        onDone={onDone}
        skipRules
        skipCountdown
        participants={makeParticipants(5, 1)}
      />
    )

    act(() => {
      vi.runAllTimers()
    })

    fireEvent.click(screen.getByRole('button', { name: 'Finish Test Game' }))
    const continueButton = screen.getByRole('button', { name: /Continue/ })
    fireEvent.click(continueButton)
    fireEvent.click(continueButton)

    expect(onDone).toHaveBeenCalledTimes(1)
    expect(onDone).toHaveBeenCalledWith(5, false)
  })

  it('lets a player dismiss the utility menu, review rules, and cancel an early exit', () => {
    render(
      <MinigameHost
        game={baseGame}
        onDone={vi.fn()}
        skipRules
        skipCountdown
        participants={makeParticipants(5, 1)}
      />
    )

    act(() => {
      vi.runAllTimers()
    })

    fireEvent.click(screen.getByRole('button', { name: 'Open minigame menu' }))
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss minigame options' }))
    expect(screen.queryByRole('menu', { name: 'Minigame options' })).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'Open minigame menu' }))
    fireEvent.click(screen.getByRole('menuitem', { name: /View rules/i }))
    fireEvent.click(screen.getByRole('button', { name: 'Return to game' }))
    expect(screen.getByRole('button', { name: 'Finish Test Game' })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Open minigame menu' }))
    fireEvent.click(screen.getByRole('menuitem', { name: /Leave competition/i }))
    fireEvent.click(screen.getByRole('button', { name: 'Keep playing' }))
    expect(screen.getByRole('button', { name: 'Finish Test Game' })).toBeInTheDocument()
  })

  it('returns from reference rules to an active countdown', () => {
    render(
      <MinigameHost
        game={baseGame}
        onDone={vi.fn()}
        skipRules
        participants={makeParticipants(5, 1)}
      />
    )

    expect(screen.getByText('Get Ready')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Open minigame menu' }))
    fireEvent.click(screen.getByRole('menuitem', { name: /View rules/i }))
    fireEvent.click(screen.getByRole('button', { name: 'Return to countdown' }))

    expect(screen.getByText('Get Ready')).toBeInTheDocument()
  })

  it('closes an open utility menu with Escape', () => {
    render(
      <MinigameHost
        game={baseGame}
        onDone={vi.fn()}
        skipRules
        skipCountdown
        participants={makeParticipants(5, 1)}
      />
    )

    act(() => {
      vi.runAllTimers()
    })

    fireEvent.click(screen.getByRole('button', { name: 'Open minigame menu' }))
    fireEvent.keyDown(window, { key: 'Enter' })
    expect(screen.getByRole('menu', { name: 'Minigame options' })).toBeInTheDocument()
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(screen.queryByRole('menu', { name: 'Minigame options' })).toBeNull()
  })

  it('shows a standalone score when no competition leaderboard was requested', () => {
    render(<MinigameHost game={baseGame} onDone={vi.fn()} skipRules skipCountdown />)

    act(() => {
      vi.runAllTimers()
    })

    fireEvent.click(screen.getByRole('button', { name: 'Finish Test Game' }))

    expect(screen.getByText('5')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Continue/ })).toBeInTheDocument()
  })

  it('labels a standalone early-exit result as partial', () => {
    render(<MinigameHost game={baseGame} onDone={vi.fn()} skipRules skipCountdown />)

    act(() => {
      vi.runAllTimers()
    })

    exitMinigame()

    expect(screen.getByText(/partial/i)).toBeInTheDocument()
  })

  it('renders pending retry state and commits an organic result from the close control', () => {
    const onContinueWithoutRetry = vi.fn()
    const onDone = vi.fn()

    render(
      <MinigameHost
        game={baseGame}
        onDone={onDone}
        skipRules
        skipCountdown
        participants={makeParticipants(0, 50)}
        competitionRetry={{
          enabled: true,
          pending: true,
          onWatch: vi.fn(),
          onContinueWithoutRetry,
        }}
      />
    )

    act(() => {
      vi.runAllTimers()
    })

    fireEvent.click(screen.getByRole('button', { name: 'Finish Test Game' }))
    expect(screen.getByRole('button', { name: /Opening Ad/ })).toBeDisabled()
    fireEvent.click(screen.getByRole('button', { name: 'Close results' }))

    expect(onContinueWithoutRetry).toHaveBeenCalledTimes(1)
    expect(onDone).toHaveBeenCalledWith(5, false)
  })

  it('uses placement labels and numeric ranks beyond the medal positions', () => {
    const placementGame = {
      ...baseGame,
      resultMode: 'placement',
    } as GameRegistryEntry
    const participants = [
      ...makeParticipants(100, 30),
      {
        id: 'ai-2',
        name: 'CPU Two',
        isHuman: false,
        precomputedScore: 20,
        previousPR: null,
      },
      {
        id: 'ai-3',
        name: 'CPU Three',
        isHuman: false,
        precomputedScore: 10,
        previousPR: null,
      },
    ]

    render(
      <MinigameHost
        game={placementGame}
        onDone={vi.fn()}
        skipRules
        skipCountdown
        participants={participants}
      />
    )

    act(() => {
      vi.runAllTimers()
    })

    fireEvent.click(screen.getByRole('button', { name: 'Finish Test Game' }))

    expect(screen.getByText('4.')).toBeInTheDocument()
    expect(screen.getByText('4th')).toBeInTheDocument()
  })
})
