import { describe, expect, it } from 'vitest'
import type { GameState, Player, TvEvent } from '../src/types'
import {
  buildByTheNumbersCandidate,
  buildDailyNumbersCandidate,
  hasByTheNumbersStoryForWeek,
} from '../src/broadcasting/seasonDesk'

function player(
  id: string,
  name: string,
  stats: { lohWins: number; posWins: number; timesNominated: number },
  status: Player['status'] = 'active'
): Player {
  return { id, name, avatar: '', status, stats }
}

function storyEvent(storyKey: string, week = 4): TvEvent {
  return {
    id: `event:${storyKey}`,
    text: 'old story',
    type: 'game',
    timestamp: 1,
    meta: {
      week,
      editorial: {
        importance: 'optional',
        presentationMode: 'ambient',
        category: 'by_the_numbers',
        sensitivity: 'public',
        storyKey,
      },
    },
  }
}

function state(
  overrides: Partial<
    Pick<
      GameState,
      'phase' | 'week' | 'players' | 'tvFeed' | 'lohId' | 'posWinnerId' | 'nomineeIds'
    >
  > = {}
) {
  return {
    phase: 'loh_results' as const,
    week: 4,
    players: [
      player('leo', 'Leo', { lohWins: 2, posWins: 0, timesNominated: 0 }),
      player('mia', 'Mia', { lohWins: 0, posWins: 0, timesNominated: 0 }),
    ],
    tvFeed: [] as TvEvent[],
    lohId: 'leo',
    posWinnerId: null,
    nomineeIds: [] as string[],
    ...overrides,
  }
}

describe('By the Numbers season desk', () => {
  it('announces a genuinely notable first repeat LOH win', () => {
    const candidate = buildByTheNumbersCandidate(state())

    expect(candidate?.storyKey).toBe('stats:loh:leo:2')
    expect(candidate?.text).toContain('first player this season')
    expect(candidate?.text).toContain('2 LOH wins')
    expect(candidate?.subjectIds).toEqual(['leo'])
  })

  it('does not manufacture a story for a trivial first power win', () => {
    const candidate = buildByTheNumbersCandidate(
      state({
        players: [
          player('leo', 'Leo', { lohWins: 1, posWins: 0, timesNominated: 0 }),
          player('mia', 'Mia', { lohWins: 0, posWins: 0, timesNominated: 0 }),
        ],
      })
    )

    expect(candidate).toBeNull()
  })

  it('recognizes the first player to win both LOH and Power of Safety', () => {
    const candidate = buildByTheNumbersCandidate(
      state({
        phase: 'pos_results',
        lohId: 'leo',
        posWinnerId: 'leo',
        players: [
          player('leo', 'Leo', { lohWins: 1, posWins: 1, timesNominated: 0 }),
          player('mia', 'Mia', { lohWins: 0, posWins: 0, timesNominated: 0 }),
        ],
      })
    )

    expect(candidate?.storyKey).toBe('stats:dual-power:leo')
    expect(candidate?.text).toContain('first player this season to win both LOH')
  })

  it('selects the more significant nomination milestone deterministically', () => {
    const candidate = buildByTheNumbersCandidate(
      state({
        phase: 'nomination_results',
        lohId: 'mia',
        nomineeIds: ['leo', 'zoe'],
        players: [
          player('leo', 'Leo', { lohWins: 0, posWins: 0, timesNominated: 3 }),
          player('zoe', 'Zoe', { lohWins: 0, posWins: 0, timesNominated: 5 }),
          player('mia', 'Mia', { lohWins: 1, posWins: 0, timesNominated: 0 }, 'loh'),
        ],
      })
    )

    expect(candidate?.storyKey).toBe('stats:nominated:zoe:5')
    expect(candidate?.text).toContain('5th time')
  })

  it('suppresses an exact milestone that already aired', () => {
    const candidate = buildByTheNumbersCandidate(state({ tvFeed: [storyEvent('stats:loh:leo:2')] }))

    expect(candidate).toBeNull()
  })

  it('allows a later milestone to progress after an earlier one was reported', () => {
    const candidate = buildByTheNumbersCandidate(
      state({
        phase: 'nomination_results',
        nomineeIds: ['leo'],
        players: [player('leo', 'Leo', { lohWins: 0, posWins: 0, timesNominated: 5 })],
        tvFeed: [storyEvent('stats:nominated:leo:3')],
      })
    )

    expect(candidate?.storyKey).toBe('stats:nominated:leo:5')
  })

  it('uses active public status for block-survival milestones and ignores eliminated players', () => {
    const active = buildByTheNumbersCandidate(
      state({
        phase: 'week_end',
        lohId: null,
        players: [player('leo', 'Leo', { lohWins: 0, posWins: 0, timesNominated: 3 })],
      })
    )
    const evicted = buildByTheNumbersCandidate(
      state({
        phase: 'week_end',
        lohId: null,
        players: [player('leo', 'Leo', { lohWins: 0, posWins: 0, timesNominated: 3 }, 'evicted')],
      })
    )

    expect(active?.storyKey).toBe('stats:block-survival:leo:3')
    expect(evicted).toBeNull()
  })

  it('never reads hidden identity data into editorial copy', () => {
    const leo = player('leo', 'Leo', { lohWins: 2, posWins: 0, timesNominated: 0 })
    leo.aiGameIdentity = 'villain' as Player['aiGameIdentity']
    const candidate = buildByTheNumbersCandidate(state({ players: [leo] }))

    expect(candidate?.text).toContain('Leo')
    expect(candidate?.text.toLowerCase()).not.toContain('villain')
    expect(candidate?.text.toLowerCase()).not.toContain('target')
    expect(candidate?.text.toLowerCase()).not.toContain('alliance')
  })

  it('waits until the Day 2 social check-in before offering the ordinary daily ledger', () => {
    const ordinaryPlayers = [
      player('leo', 'Leo', { lohWins: 1, posWins: 0, timesNominated: 1 }),
      player('mia', 'Mia', { lohWins: 0, posWins: 1, timesNominated: 1 }),
    ]

    expect(
      buildDailyNumbersCandidate(
        state({ phase: 'social_1', week: 1, players: ordinaryPlayers, lohId: null })
      )
    ).toBeNull()
    expect(
      buildDailyNumbersCandidate(
        state({ phase: 'loh_results', week: 2, players: ordinaryPlayers, lohId: null })
      )
    ).toBeNull()

    const candidate = buildDailyNumbersCandidate(
      state({ phase: 'social_1', week: 2, players: ordinaryPlayers, lohId: null })
    )
    expect(candidate?.storyKey).toBe('stats:daily:2')
    expect(candidate?.category).toBe('by_the_numbers')
    expect(candidate?.text).toContain('Day 2')
  })

  it('uses public season state for a deterministic quiet-day fallback', () => {
    const candidate = buildDailyNumbersCandidate(
      state({
        phase: 'social_1',
        week: 4,
        lohId: null,
        players: [
          player('leo', 'Leo', { lohWins: 1, posWins: 0, timesNominated: 2 }),
          player('mia', 'Mia', { lohWins: 0, posWins: 1, timesNominated: 1 }),
          player('zoe', 'Zoe', { lohWins: 0, posWins: 0, timesNominated: 1 }),
        ],
      })
    )

    expect(candidate?.storyKey).toBe('stats:daily:4')
    expect(candidate?.text).toContain('nomination appearances')
    expect(candidate?.text).toContain('3 remaining players')
  })

  it('does not add routine statistics after any By the Numbers story already aired that day', () => {
    const candidate = buildDailyNumbersCandidate(
      state({
        phase: 'social_1',
        week: 4,
        tvFeed: [storyEvent('stats:loh:leo:2', 4)],
      })
    )

    expect(candidate).toBeNull()
  })

  it('tracks the per-day statistical airtime marker from persisted tvFeed', () => {
    const history = [storyEvent('stats:loh:leo:2', 4)]
    expect(hasByTheNumbersStoryForWeek(history, 4)).toBe(true)
    expect(hasByTheNumbersStoryForWeek(history, 5)).toBe(false)
  })
})
