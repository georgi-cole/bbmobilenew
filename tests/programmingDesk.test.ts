import { describe, expect, it } from 'vitest'
import type { GameState, Player, TvEvent } from '../src/types'
import {
  buildProgrammingCallbackCandidate,
  buildResumeRecapFromGame,
  RESUME_RECAP_MIN_ABSENCE_MS,
} from '../src/broadcasting/programmingDesk'

function player(
  id: string,
  name: string,
  status: Player['status'] = 'active',
  evictedAtWeek?: number
): Player {
  return {
    id,
    name,
    avatar: '',
    status,
    stats: { lohWins: 0, posWins: 0, timesNominated: 0 },
    ...(evictedAtWeek != null ? { evictedAtWeek } : {}),
  }
}

function twistEvent(
  id: string,
  text: string,
  week: number,
  options: { sensitive?: boolean; logOnly?: boolean } = {}
): TvEvent {
  return {
    id,
    text,
    type: 'twist',
    timestamp: week * 1000,
    major: 'double_eviction',
    meta: {
      week,
      broadcastLevel: 'critical',
      editorial: {
        importance: 'critical',
        presentationMode: options.logOnly ? 'log_only' : 'interrupt',
        sensitivity: options.sensitive ? 'sensitive' : 'public',
      },
    },
  }
}

function game(
  overrides: Partial<
    Pick<
      GameState,
      'phase' | 'week' | 'players' | 'tvFeed' | 'nomineeIds' | 'lohId' | 'posWinnerId'
    >
  > = {}
) {
  return {
    phase: 'social_2' as const,
    week: 6,
    players: [
      player('leo', 'Leo', 'loh'),
      player('mia', 'Mia', 'nominated'),
      player('zoe', 'Zoe', 'nominated+pos'),
      player('noah', 'Noah', 'evicted', 5),
    ],
    tvFeed: [] as TvEvent[],
    nomineeIds: ['mia', 'zoe'],
    lohId: 'leo',
    posWinnerId: 'zoe',
    ...overrides,
  }
}

describe('Big Eye programming desk', () => {
  it('does not show a Continue Last recap after a short absence', () => {
    const now = Date.parse('2026-09-12T12:00:00Z')
    const lastPlayedAt = now - RESUME_RECAP_MIN_ABSENCE_MS + 1

    expect(buildResumeRecapFromGame(game(), lastPlayedAt, now)).toBeNull()
  })

  it('selects at most three useful public facts after a meaningful absence', () => {
    const now = Date.parse('2026-09-12T12:00:00Z')
    const lastPlayedAt = now - RESUME_RECAP_MIN_ABSENCE_MS - 1
    const candidate = buildResumeRecapFromGame(game(), lastPlayedAt, now, 'save-a')

    expect(candidate?.text).toMatch(/^PREVIOUSLY ON THE BIG EYE/)
    expect(candidate?.facts).toEqual([
      'On the block: Mia and Zoe.',
      'Leo holds LOH.',
      'Zoe won the Power of Safety.',
    ])
    expect(candidate?.facts).toHaveLength(3)
  })

  it('does not manufacture a recap when there is nothing useful to reorient the player', () => {
    const now = 100_000_000
    const empty = game({
      phase: 'week_start',
      players: [player('leo', 'Leo')],
      nomineeIds: [],
      lohId: null,
      posWinnerId: null,
      tvFeed: [],
    })

    expect(
      buildResumeRecapFromGame(empty, now - RESUME_RECAP_MIN_ABSENCE_MS - 1, now, 'empty')
    ).toBeNull()
  })

  it('does not repeat a recap for the same hydrated save marker', () => {
    const now = 100_000_000
    const resumeKey = 'save-repeat'
    const prior: TvEvent = {
      id: 'resume-1',
      text: 'PREVIOUSLY ON THE BIG EYE',
      type: 'game',
      timestamp: 1,
      meta: {
        week: 6,
        resumeRecapKey: resumeKey,
        editorial: {
          importance: 'optional',
          presentationMode: 'ambient',
          sensitivity: 'public',
          category: 'programming_resume_recap',
          storyKey: `resume:${resumeKey}`,
        },
      },
    }

    expect(
      buildResumeRecapFromGame(
        game({ tvFeed: [prior] }),
        now - RESUME_RECAP_MIN_ABSENCE_MS - 1,
        now,
        resumeKey
      )
    ).toBeNull()
  })

  it('allows a later genuinely old save marker to receive a new recap', () => {
    const now = 100_000_000
    const prior: TvEvent = {
      id: 'resume-1',
      text: 'old recap',
      type: 'game',
      timestamp: 1,
      meta: {
        week: 5,
        resumeRecapKey: 'old-save',
        editorial: {
          importance: 'optional',
          presentationMode: 'ambient',
          sensitivity: 'public',
          category: 'programming_resume_recap',
          storyKey: 'resume:old-save',
        },
      },
    }

    const next = buildResumeRecapFromGame(
      game({ tvFeed: [prior] }),
      now - RESUME_RECAP_MIN_ABSENCE_MS - 1,
      now,
      'new-save'
    )
    expect(next?.storyKey).toBe('resume:new-save')
  })

  it('never includes sensitive or log-only twist material in a recap', () => {
    const now = 100_000_000
    const candidate = buildResumeRecapFromGame(
      game({
        phase: 'week_start',
        players: [player('leo', 'Leo')],
        nomineeIds: [],
        lohId: null,
        posWinnerId: null,
        tvFeed: [
          twistEvent('secret', 'SECRET TARGET: Mia', 6, { sensitive: true }),
          twistEvent('log-only', 'Internal diagnostic detail', 6, { logOnly: true }),
        ],
      }),
      now - RESUME_RECAP_MIN_ABSENCE_MS - 1,
      now,
      'safe-save'
    )

    expect(candidate).toBeNull()
  })

  it('uses a recent public critical shock only when it adds useful context', () => {
    const now = 100_000_000
    const candidate = buildResumeRecapFromGame(
      game({
        phase: 'week_start',
        players: [player('leo', 'Leo')],
        nomineeIds: [],
        lohId: null,
        posWinnerId: null,
        tvFeed: [twistEvent('shock', 'Double Elimination is active.', 6)],
      }),
      now - RESUME_RECAP_MIN_ABSENCE_MS - 1,
      now,
      'shock-save'
    )

    expect(candidate?.facts).toEqual(['Recent shock: Double Elimination is active.'])
  })

  it('adds a sparse Day Start callback only after a significant previous-day shock', () => {
    const candidate = buildProgrammingCallbackCandidate({
      phase: 'week_start',
      week: 7,
      tvFeed: [twistEvent('shock', 'Double Elimination changed the game.', 6)],
    })

    expect(candidate?.text).toMatch(/^THE AFTERSHOCK/)
    expect(candidate?.storyKey).toBe('programming:callback:shock')
  })

  it('applies a strong programming cooldown instead of filling every Day Start', () => {
    const previous = twistEvent('shock', 'Double Elimination changed the game.', 6)
    const alreadyAired: TvEvent = {
      id: 'callback-old',
      text: 'THE BIG EYE CONTINUES',
      type: 'game',
      timestamp: 2,
      meta: {
        week: 6,
        editorial: {
          importance: 'optional',
          presentationMode: 'ambient',
          sensitivity: 'public',
          category: 'big_eye_programming',
          storyKey: 'programming:callback:older',
        },
      },
    }

    expect(
      buildProgrammingCallbackCandidate({
        phase: 'week_start',
        week: 7,
        tvFeed: [previous, alreadyAired],
      })
    ).toBeNull()
  })
})
