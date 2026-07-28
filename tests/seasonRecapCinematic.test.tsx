import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import SeasonRecapCinematic from '../src/components/SeasonRecapCinematic/SeasonRecapCinematic'
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

function getTimeline() {
  return buildSeasonRecapTimeline(3, 1, 2)
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
}

describe('SeasonRecapCinematic broadcast redesign', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    motionState.reduced = false
  })

  afterEach(() => {
    document.body.classList.remove('no-animations')
    document.body.style.overflow = ''
    vi.useRealTimers()
  })

  it('opens as a finale broadcast and identifies the actual season', () => {
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
    expect(screen.getByText('Season 9')).toBeInTheDocument()
    expect(screen.getByText('Finale')).toBeInTheDocument()
    expect(screen.queryByText(/01 \/ 14/i)).not.toBeInTheDocument()
  })

  it('restores the full-screen season photoshoot instead of an avatar wall', async () => {
    render(
      <SeasonRecapCinematic
        season={9}
        week={12}
        players={PLAYERS}
        publicOpinion={PUBLIC_OPINION}
        onComplete={vi.fn()}
      />
    )

    await advanceToScene('photoshoot')

    const photo = screen.getByAltText('Season housemates photoshoot')
    expect(photo.getAttribute('src')).toContain('thegirls.webp')
    expect(screen.getByText('The housemates who made the season.')).toBeInTheDocument()
    expect(document.querySelector('.src-cast-grid')).toBeNull()
  })

  it('turns recorded data into distinct editorial stories without raw deltas or counts', () => {
    const highlights = buildSeasonRecapHighlights(PLAYERS, PUBLIC_OPINION, 2)
    expect(highlights).toHaveLength(2)
    expect(new Set(highlights.map((highlight) => highlight.player.id)).size).toBe(2)
    expect(new Set(highlights.map((highlight) => highlight.storyType)).size).toBe(2)

    const presentation = highlights
      .flatMap((highlight) => [highlight.eyebrow, highlight.title, highlight.stamp])
      .join(' ')
    expect(presentation).not.toMatch(/[+-]\d/)
    expect(presentation).not.toMatch(/\bapproval\b|\bwins?\b|\bnominations?\b/i)
  })

  it('presents honors as character moments rather than stat cards', async () => {
    render(
      <SeasonRecapCinematic
        season={9}
        week={12}
        players={PLAYERS}
        publicOpinion={PUBLIC_OPINION}
        onComplete={vi.fn()}
      />
    )

    await advanceToScene('honor_0')

    expect(screen.getByText('The Season Favorite')).toBeInTheDocument()
    expect(screen.getByText('Avery')).toBeInTheDocument()
    expect(screen.queryByText(/82% approval/i)).not.toBeInTheDocument()
    expect(screen.queryByText('🏆')).not.toBeInTheDocument()
  })

  it('replaces the ranking ladder with a cinematic farewell lineup', async () => {
    render(
      <SeasonRecapCinematic
        season={9}
        week={12}
        players={PLAYERS}
        publicOpinion={PUBLIC_OPINION}
        onComplete={vi.fn()}
      />
    )

    await advanceToScene('farewell_0')

    expect(screen.getByText('The final goodbyes.')).toBeInTheDocument()
    expect(screen.getByText('Casey')).toBeInTheDocument()
    expect(screen.getByText('Drew')).toBeInTheDocument()
    expect(document.querySelector('.eviction-ladder')).toBeNull()
    expect(screen.queryByText(/3RD|4TH|FINALIST/i)).not.toBeInTheDocument()
  })

  it('keeps full reading time in reduced-motion mode', async () => {
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

    await act(async () => {
      await vi.advanceTimersByTimeAsync(300)
    })
    expect(screen.getByText('THE VOTES ARE IN.')).toBeInTheDocument()
    expect(INTRO_MIN_DURATION_MS).toBeGreaterThan(300)
  })

  it('skips once and restores the page after the exit fade', async () => {
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

    await act(async () => {
      await vi.advanceTimersByTimeAsync(RECAP_EXIT_FADE_MS + 10)
    })
    expect(onComplete).toHaveBeenCalledTimes(1)
  })
})
