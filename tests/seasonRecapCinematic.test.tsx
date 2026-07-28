import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import SeasonRecapCinematic from '../src/components/SeasonRecapCinematic/SeasonRecapCinematic'
import { buildSeasonRecapData } from '../src/components/SeasonRecapCinematic/seasonRecapData'
import { buildSeasonRecapHighlights } from '../src/components/SeasonRecapCinematic/seasonRecapHighlights'
import {
  buildSeasonRecapTimeline,
  INTRO_MIN_DURATION_MS,
  RECAP_EXIT_FADE_MS,
} from '../src/components/SeasonRecapCinematic/seasonRecapTimeline'
import type { PublicOpinionState } from '../src/publicOpinion/types'
import type { Player } from '../src/types'

const motionState = vi.hoisted(() => ({ reduced: false }))

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
    useReducedMotion: () => motionState.reduced,
  }
})

vi.mock('../src/components/FullSizeCutoutImage/FullSizeCutoutImage', () => ({
  default: ({ player, className, alt }: { player: Player; className?: string; alt?: string }) => (
    <img src={`/cutouts/${player.id}.webp`} className={className} alt={alt ?? player.name} />
  ),
}))

const PLAYERS: Player[] = [
  {
    id: 'f1',
    name: 'Avery',
    status: 'active',
    avatar: '😀',
    stats: { lohWins: 2, posWins: 1, timesNominated: 1 },
  },
  {
    id: 'f2',
    name: 'Blake',
    status: 'active',
    avatar: '😎',
    stats: { lohWins: 1, posWins: 2, timesNominated: 2 },
  },
  {
    id: 'j1',
    name: 'Casey',
    status: 'jury',
    avatar: '🧠',
    seasonPlacement: 3,
    stats: { lohWins: 1, posWins: 0, timesNominated: 3 },
  },
  {
    id: 'e1',
    name: 'Drew',
    status: 'evicted',
    avatar: '🔥',
    seasonPlacement: 4,
    stats: { lohWins: 0, posWins: 1, timesNominated: 2 },
  },
]

const PUBLIC_OPINION: PublicOpinionState = {
  profiles: {
    f1: {
      playerId: 'f1',
      approval: 82,
      previousApproval: 74,
      seasonApprovals: [50, 61, 74, 82],
      completedDirectionCount: 1,
      cumulativePositiveDelta: 32,
    },
    f2: {
      playerId: 'f2',
      approval: 47,
      previousApproval: 55,
      seasonApprovals: [50, 59, 55, 47],
      completedDirectionCount: 0,
      cumulativePositiveDelta: 9,
    },
    j1: {
      playerId: 'j1',
      approval: 63,
      previousApproval: 58,
      seasonApprovals: [50, 55, 58, 63],
      completedDirectionCount: 0,
      cumulativePositiveDelta: 13,
    },
    e1: {
      playerId: 'e1',
      approval: 21,
      previousApproval: 39,
      seasonApprovals: [50, 45, 39, 21],
      completedDirectionCount: 0,
      cumulativePositiveDelta: 0,
    },
  },
  directions: [],
  feed: [
    {
      id: 'headline-1',
      playerId: 'e1',
      text: 'Drew shocked the audience with a feud that swallowed the whole week.',
      delta: -21,
      week: 10,
      timestamp: 1001,
      isHeadline: true,
    },
    {
      id: 'headline-2',
      playerId: 'f1',
      text: 'Avery sent the ratings soaring with a power play nobody stopped talking about.',
      delta: 14,
      week: 11,
      timestamp: 1002,
      isHeadline: true,
    },
  ],
  lastUpdatedWeek: 11,
  feedPostsThisDay: 2,
  currentFeedDay: 11,
}

function getTimeline(publicOpinion: PublicOpinionState | undefined = PUBLIC_OPINION) {
  const data = buildSeasonRecapData(PLAYERS, 12, publicOpinion)
  const highlights = buildSeasonRecapHighlights(PLAYERS, publicOpinion, 3)
  return buildSeasonRecapTimeline(
    data.categories.map((category) => category.id),
    data.evictionWaves.length,
    highlights.length
  )
}

async function advanceToScene(sceneId: string) {
  const timeline = getTimeline()
  const target = timeline.findIndex((scene) => scene.id === sceneId)
  expect(target).toBeGreaterThanOrEqual(0)

  for (let index = 0; index < target; index += 1) {
    await act(async () => {
      await vi.advanceTimersByTimeAsync(timeline[index].durationMs)
    })
  }
  return timeline
}

describe('SeasonRecapCinematic', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    motionState.reduced = false
    if (!window.matchMedia) {
      window.matchMedia = vi.fn().mockImplementation((query: string) => ({
        matches: false,
        media: query,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      }))
    }
  })

  afterEach(() => {
    document.body.classList.remove('no-animations')
    document.body.style.overflow = ''
    vi.useRealTimers()
  })

  it('opens on the suspense card and identifies the actual season', () => {
    render(
      <SeasonRecapCinematic
        season={9}
        week={12}
        players={PLAYERS}
        publicOpinion={PUBLIC_OPINION}
        onComplete={vi.fn()}
      />
    )

    expect(screen.getByText('THE VOTES ARE IN.')).toBeInTheDocument()
    expect(screen.getByRole('dialog', { name: 'Season recap cinematic' })).toHaveAttribute(
      'data-season',
      '9'
    )
    expect(screen.getByText(/Season 9 archive/i)).toBeInTheDocument()
  })

  it('uses the real roster instead of fixed girls and boys plates', async () => {
    render(
      <SeasonRecapCinematic
        season={9}
        week={12}
        players={PLAYERS}
        publicOpinion={PUBLIC_OPINION}
        onComplete={vi.fn()}
      />
    )

    await advanceToScene('cast_overview')

    expect(screen.getByText('The Housemates')).toBeInTheDocument()
    expect(screen.getByText(/Season 9 · Through week 12/i)).toBeInTheDocument()
    const roster = screen.getByRole('list', { name: 'Season 9 housemates' })
    expect(within(roster).getAllByRole('listitem')).toHaveLength(PLAYERS.length)
    for (const player of PLAYERS) {
      expect(within(roster).getByText(player.name)).toBeInTheDocument()
    }
  })

  it('builds truthful highlights from recorded headlines and never injects stock incidents', () => {
    const highlights = buildSeasonRecapHighlights(PLAYERS, PUBLIC_OPINION, 3)
    expect(highlights).toHaveLength(3)
    expect(highlights.some((highlight) => highlight.caption.includes('ratings soaring'))).toBe(true)
    expect(highlights.some((highlight) => highlight.caption.includes('feud'))).toBe(true)
    expect(highlights.map((highlight) => highlight.caption).join(' ')).not.toMatch(
      /pancake|midnight cake|golden key/i
    )
  })

  it('renders the actual recorded public headline in the cinematic', async () => {
    render(
      <SeasonRecapCinematic
        season={9}
        week={12}
        players={PLAYERS}
        publicOpinion={PUBLIC_OPINION}
        onComplete={vi.fn()}
      />
    )

    await advanceToScene('highlight_0')
    expect(screen.getByText(/Drew shocked the audience/i)).toBeInTheDocument()
    expect(screen.getByText(/-21 approval/i)).toBeInTheDocument()
  })

  it('omits the entire ladder chapter when there are no eviction waves', () => {
    const timeline = buildSeasonRecapTimeline(['compzilla'], 0, 0)
    expect(timeline.some((scene) => scene.kind === 'ladder_intro')).toBe(false)
    expect(timeline.some((scene) => scene.kind === 'ladder_wave')).toBe(false)
    expect(timeline.at(-1)?.kind).toBe('moment_of_truth')
  })

  it('preserves readable scene durations in reduced-motion mode', async () => {
    motionState.reduced = true
    render(
      <SeasonRecapCinematic
        season={9}
        week={12}
        players={PLAYERS}
        publicOpinion={PUBLIC_OPINION}
        onComplete={vi.fn()}
      />
    )

    expect(document.querySelectorAll('.src-particle')).toHaveLength(0)
    await act(async () => {
      await vi.advanceTimersByTimeAsync(300)
    })
    expect(screen.getByText('THE VOTES ARE IN.')).toBeInTheDocument()
    expect(INTRO_MIN_DURATION_MS).toBeGreaterThan(300)
  })

  it('skips once, restores document scrolling, and completes after the exit fade', async () => {
    const onComplete = vi.fn()
    render(
      <SeasonRecapCinematic
        season={9}
        week={12}
        players={PLAYERS}
        publicOpinion={PUBLIC_OPINION}
        onComplete={onComplete}
      />
    )

    expect(document.body.style.overflow).toBe('hidden')
    fireEvent.click(screen.getByRole('button', { name: 'Skip recap' }))
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(onComplete).not.toHaveBeenCalled()

    await act(async () => {
      await vi.advanceTimersByTimeAsync(RECAP_EXIT_FADE_MS + 10)
    })
    expect(onComplete).toHaveBeenCalledTimes(1)
  })
})
