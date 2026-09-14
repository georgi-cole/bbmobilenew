import { describe, expect, it } from 'vitest'
import type { GameState, Player, TvEvent } from '../src/types'
import {
  buildByTheNumbersCandidate,
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
    week: 6,
    players: [
      player('leo', 'Leo', { lohWins: 3, posWins: 0, timesNominated: 0 }),
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
  it('reserves power coverage for a genuinely notable third LOH win', () => {
    const candidate = buildByTheNumbersCandidate(state())

    expect(candidate?.storyKey).toBe('stats:loh:leo:3')
    expect(candidate?.text).toContain('first player this season')
    expect(candidate?.text).toContain('3 LOH wins')
    expect(candidate?.subjectIds).toEqual(['leo'])
  })

  it('does not manufacture a story for first or second power wins', () => {
    for (const count of [1, 2]) {
      const candidate = buildByTheNumbersCandidate(
        state({
          players: [
            player('leo', 'Leo', { lohWins: count, posWins: 0, timesNominated: 0 }),
            player('mia', 'Mia', { lohWins: 0, posWins: 0, timesNominated: 0 }),
          ],
        })
      )
      expect(candidate).toBeNull()
    }
  })

  it('requires a meaningful multi-power résumé before running versatility coverage', () => {
    const tooEarly = buildByTheNumbersCandidate(
      state({
        phase: 'pos_results',
        posWinnerId: 'leo',
        players: [player('leo', 'Leo', { lohWins: 1, posWins: 1, timesNominated: 0 })],
      })
    )
    expect(tooEarly).toBeNull()

    const candidate = buildByTheNumbersCandidate(
      state({
        phase: 'pos_results',
        posWinnerId: 'leo',
        players: [player('leo', 'Leo', { lohWins: 2, posWins: 1, timesNominated: 0 })],
      })
    )
    expect(candidate?.storyKey).toBe('stats:dual-power:leo')
    expect(candidate?.text).toContain('three-win résumé')
  })

  it('ignores ordinary nomination counts and selects a rare fifth trip to the block', () => {
    const candidate = buildByTheNumbersCandidate(
      state({
        phase: 'nomination_results',
        nomineeIds: ['leo', 'zoe'],
        players: [
          player('leo', 'Leo', { lohWins: 0, posWins: 0, timesNominated: 3 }),
          player('zoe', 'Zoe', { lohWins: 0, posWins: 0, timesNominated: 5 }),
        ],
      })
    )

    expect(candidate?.storyKey).toBe('stats:nominated:zoe:5')
    expect(candidate?.text).toContain('5th time')
  })

  it('suppresses an exact milestone that already aired', () => {
    const candidate = buildByTheNumbersCandidate(state({ tvFeed: [storyEvent('stats:loh:leo:3')] }))
    expect(candidate).toBeNull()
  })

  it('allows a later rare milestone after an earlier one was reported', () => {
    const candidate = buildByTheNumbersCandidate(
      state({
        phase: 'nomination_results',
        nomineeIds: ['leo'],
        players: [player('leo', 'Leo', { lohWins: 0, posWins: 0, timesNominated: 7 })],
        tvFeed: [storyEvent('stats:nominated:leo:5')],
      })
    )

    expect(candidate?.storyKey).toBe('stats:nominated:leo:7')
  })

  it('uses active public status for exceptional block-survival milestones', () => {
    const active = buildByTheNumbersCandidate(
      state({
        phase: 'week_end',
        lohId: null,
        players: [player('leo', 'Leo', { lohWins: 0, posWins: 0, timesNominated: 5 })],
      })
    )
    const evicted = buildByTheNumbersCandidate(
      state({
        phase: 'week_end',
        lohId: null,
        players: [player('leo', 'Leo', { lohWins: 0, posWins: 0, timesNominated: 5 }, 'evicted')],
      })
    )

    expect(active?.storyKey).toBe('stats:block-survival:leo:5')
    expect(evicted).toBeNull()
  })

  it('never reads hidden identity data into editorial copy', () => {
    const leo = player('leo', 'Leo', { lohWins: 3, posWins: 0, timesNominated: 0 })
    leo.aiGameIdentity = 'villain' as Player['aiGameIdentity']
    const candidate = buildByTheNumbersCandidate(state({ players: [leo] }))

    expect(candidate?.text).toContain('Leo')
    expect(candidate?.text.toLowerCase()).not.toContain('villain')
    expect(candidate?.text.toLowerCase()).not.toContain('target')
    expect(candidate?.text.toLowerCase()).not.toContain('alliance')
  })

  it('tracks the per-day statistical airtime marker from persisted tvFeed', () => {
    const history = [storyEvent('stats:loh:leo:3', 6)]
    expect(hasByTheNumbersStoryForWeek(history, 6)).toBe(true)
    expect(hasByTheNumbersStoryForWeek(history, 7)).toBe(false)
  })
})
