import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import PublicFavoriteOverlay from '../../src/components/PublicFavoriteOverlay/PublicFavoriteOverlay'
import { useBattleBackVoting } from '../../src/hooks/useBattleBackVoting'
import type { PublicOpinionState } from '../../src/publicOpinion/types'
import type { Player } from '../../src/types'

const publicOpinionMock = vi.hoisted(() => ({
  state: null as PublicOpinionState | null,
}))

vi.mock('../../src/store/hooks', () => ({
  useAppSelector: () => publicOpinionMock.state,
}))

vi.mock('../../src/hooks/useBattleBackVoting', () => ({
  useBattleBackVoting: vi.fn(),
}))

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
          layout: _layout,
          ...props
        }: React.HTMLAttributes<HTMLElement> & Record<string, unknown>) =>
          React.createElement(tag, props, children),
    }
  )

  return {
    AnimatePresence: ({ children }: { children: React.ReactNode }) =>
      React.createElement(React.Fragment, null, children),
    MotionConfig: ({ children }: { children: React.ReactNode }) =>
      React.createElement(React.Fragment, null, children),
    motion,
    useReducedMotion: () => false,
  }
})

const mockedUseBattleBackVoting = vi.mocked(useBattleBackVoting)

const PLAYERS: Player[] = [
  {
    id: 'p1',
    name: 'Jordan',
    avatar: '🧑',
    status: 'evicted',
    stats: { lohWins: 0, posWins: 0, timesNominated: 2 },
  },
  {
    id: 'p2',
    name: 'Taylor',
    avatar: '🧑',
    status: 'evicted',
    stats: { lohWins: 2, posWins: 1, timesNominated: 1 },
  },
  {
    id: 'p3',
    name: 'Morgan',
    avatar: '🧑',
    status: 'evicted',
    stats: { lohWins: 1, posWins: 0, timesNominated: 3 },
  },
]

const PUBLIC_OPINION: PublicOpinionState = {
  profiles: {
    p1: {
      playerId: 'p1',
      approval: 32,
      previousApproval: 35,
      seasonApprovals: [50, 42, 35, 32],
      completedDirectionCount: 0,
      cumulativePositiveDelta: 3,
    },
    p2: {
      playerId: 'p2',
      approval: 84,
      previousApproval: 76,
      seasonApprovals: [52, 64, 76, 84],
      completedDirectionCount: 3,
      cumulativePositiveDelta: 34,
    },
    p3: {
      playerId: 'p3',
      approval: 57,
      previousApproval: 59,
      seasonApprovals: [50, 61, 59, 57],
      completedDirectionCount: 1,
      cumulativePositiveDelta: 13,
    },
  },
  directions: [],
  feed: [],
  lastUpdatedWeek: 10,
  feedPostsThisDay: 0,
  currentFeedDay: 10,
}

function votingState(overrides: Partial<ReturnType<typeof useBattleBackVoting>> = {}) {
  return {
    votes: { p1: 28, p2: 44, p3: 28 },
    eliminated: [],
    winnerId: null,
    isComplete: false,
    ...overrides,
  }
}

describe('PublicFavoriteOverlay', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    publicOpinionMock.state = PUBLIC_OPINION
    mockedUseBattleBackVoting.mockReturnValue(votingState())
  })

  afterEach(() => {
    document.body.style.overflow = ''
    vi.useRealTimers()
    vi.clearAllMocks()
  })

  it('passes a public-opinion forecast into the live voting simulator', () => {
    render(<PublicFavoriteOverlay candidates={PLAYERS} seed={41} onComplete={vi.fn()} />)

    const options = mockedUseBattleBackVoting.mock.calls.at(-1)?.[0]
    expect(options?.targetPercentages?.p2).toBeGreaterThan(options?.targetPercentages?.p3 ?? 0)
    expect(options?.targetPercentages?.p3).toBeGreaterThan(options?.targetPercentages?.p1 ?? 0)
    expect(options).not.toHaveProperty('surgeTargetId')
  })

  it('makes the rewarded Viewer Spotlight explicitly cosmetic', async () => {
    const onAudienceSurgeRequest = vi.fn().mockResolvedValue(true)
    render(
      <PublicFavoriteOverlay
        candidates={PLAYERS}
        seed={41}
        onComplete={vi.fn()}
        onAudienceSurgeRequest={onAudienceSurgeRequest}
      />
    )

    await act(async () => {
      await vi.advanceTimersByTimeAsync(2_100)
    })

    const board = screen.getByRole('region', { name: 'Public vote ranking board' })
    fireEvent.click(within(board).getByRole('button', { name: /Taylor, rank 1, 44%/i }))
    expect(screen.getByText(/This does not change the official result/i)).toBeInTheDocument()

    const cta = screen.getByRole('button', { name: /Watch to Spotlight Taylor/i })
    await act(async () => {
      fireEvent.click(cta)
      fireEvent.click(cta)
    })

    expect(onAudienceSurgeRequest).toHaveBeenCalledTimes(1)
    expect(screen.getByRole('button', { name: /Viewer Spotlight Active/i })).toBeDisabled()
    expect(mockedUseBattleBackVoting.mock.calls.at(-1)?.[0]).not.toHaveProperty('surgeTargetId')
  })

  it('uses a readable fast-forward cadence instead of 260 ms eliminations', () => {
    render(<PublicFavoriteOverlay candidates={PLAYERS} seed={41} onComplete={vi.fn()} />)

    fireEvent.click(screen.getByRole('button', { name: 'Fast forward public favorite vote' }))

    expect(mockedUseBattleBackVoting.mock.calls.at(-1)?.[0]).toMatchObject({
      eliminationIntervalMs: 850,
      tickIntervalMs: 300,
    })
    expect(screen.getByText('Forwarding')).toBeInTheDocument()
  })

  it('renders the authoritative winner reveal and completes only once', () => {
    const onComplete = vi.fn()
    mockedUseBattleBackVoting.mockReturnValue(
      votingState({
        votes: { p1: 0, p2: 100, p3: 0 },
        eliminated: ['p1', 'p3'],
        winnerId: 'p2',
        isComplete: true,
      })
    )

    render(
      <PublicFavoriteOverlay
        candidates={PLAYERS}
        seed={41}
        awardAmount={25_000}
        onComplete={onComplete}
      />
    )

    expect(screen.getByText('Taylor')).toBeInTheDocument()
    expect(screen.getByText('Wins 25,000 Eyeoleans!')).toBeInTheDocument()
    const continueButton = screen.getByRole('button', { name: 'Continue' })
    fireEvent.click(continueButton)
    fireEvent.click(continueButton)
    expect(onComplete).toHaveBeenCalledTimes(1)
    expect(onComplete).toHaveBeenCalledWith('p2')
  })

  it('falls through directly to the reveal when one candidate is already complete', () => {
    mockedUseBattleBackVoting.mockReturnValue({
      votes: { p2: 100 },
      eliminated: [],
      winnerId: 'p2',
      isComplete: true,
    })

    render(<PublicFavoriteOverlay candidates={[PLAYERS[1]]} seed={41} onComplete={vi.fn()} />)

    expect(screen.getByText('FINAL REVEAL')).toBeInTheDocument()
    expect(screen.getByText('Taylor')).toBeInTheDocument()
  })
})
