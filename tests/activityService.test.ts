/**
 * Unit tests for src/services/activityService.ts
 *
 * Covers channel routing predicates and the DR session summary builder.
 */

import { describe, it, expect } from 'vitest'
import {
  isBattleBackReturnResultEvent,
  isRedundantCompetitionPreludeEvent,
  isVisibleInMainLog,
  isVisibleOnTv,
  isVisibleInDr,
  buildDrSessionSummary,
  type ActivityChannel,
  type ActivitySource,
} from '../src/services/activityService'

// ── isVisibleInMainLog ────────────────────────────────────────────────────────

describe('isVisibleInMainLog', () => {
  it('returns true when no channels are set (legacy event)', () => {
    expect(isVisibleInMainLog({})).toBe(true)
  })

  it('returns true when channels includes "mainLog"', () => {
    expect(isVisibleInMainLog({ channels: ['mainLog'] })).toBe(true)
  })

  it('returns true when channels includes "tv"', () => {
    expect(isVisibleInMainLog({ channels: ['tv', 'mainLog'] })).toBe(true)
    expect(isVisibleInMainLog({ channels: ['tv'] })).toBe(true)
  })

  it('returns false when channels is ["dr"] only', () => {
    expect(isVisibleInMainLog({ channels: ['dr'] })).toBe(false)
  })

  it('returns false when channels is ["recentActivity"] only', () => {
    expect(isVisibleInMainLog({ channels: ['recentActivity'] })).toBe(false)
  })

  it('removes redundant LOH and POS prelude messages from the log', () => {
    const lohPrelude = {
      type: 'game',
      text: 'The Leader of the House comp is about to begin! All eligible players will now battle for the title.',
      channels: ['tv', 'mainLog'] as ActivityChannel[],
    }
    const posPrelude = {
      type: 'game',
      text: 'It is time for the Power of Safety competition! Housemates, get ready.',
      channels: ['tv', 'mainLog'] as ActivityChannel[],
    }

    expect(isRedundantCompetitionPreludeEvent(lohPrelude)).toBe(true)
    expect(isRedundantCompetitionPreludeEvent(posPrelude)).toBe(true)
    expect(isVisibleInMainLog(lohPrelude)).toBe(false)
    expect(isVisibleInMainLog(posPrelude)).toBe(false)
  })
})

// ── isVisibleOnTv ─────────────────────────────────────────────────────────────

describe('isVisibleOnTv', () => {
  it('returns true when no channels are set (legacy event)', () => {
    expect(isVisibleOnTv({})).toBe(true)
  })

  it('returns true when channels includes "tv"', () => {
    expect(isVisibleOnTv({ channels: ['tv'] })).toBe(true)
  })

  it('returns true when channels includes "mainLog"', () => {
    expect(isVisibleOnTv({ channels: ['mainLog'] })).toBe(true)
  })

  it('returns false when channels is ["dr"] only', () => {
    expect(isVisibleOnTv({ channels: ['dr'] })).toBe(false)
  })

  it('keeps the Battle Back winner result in the main log but out of TV announcement selection', () => {
    const resultEvent = {
      type: 'twist',
      text: '🏆 Lia has won Back 2 the Game and returns to the game! 🔥',
    }

    expect(isBattleBackReturnResultEvent(resultEvent)).toBe(true)
    expect(isVisibleOnTv(resultEvent)).toBe(false)
    expect(isVisibleInMainLog(resultEvent)).toBe(true)
  })

  it('does not suppress the original Battle Back activation announcement', () => {
    const activationEvent = {
      type: 'twist',
      text: '🔥 SHOCK: Back 2 the Game is here! Tribunal members will compete for a chance to return! 🏆',
    }

    expect(isBattleBackReturnResultEvent(activationEvent)).toBe(false)
    expect(isVisibleOnTv(activationEvent)).toBe(true)
  })

  it('removes redundant LOH and POS prelude messages from the TV viewport', () => {
    expect(
      isVisibleOnTv({
        text: 'The Leader of the House competition is about to begin! All eligible players will now battle for the title.',
      })
    ).toBe(false)
    expect(
      isVisibleOnTv({ text: "It's time for the Power of Safety competition!" })
    ).toBe(false)
  })
})

// ── isVisibleInDr ─────────────────────────────────────────────────────────────

describe('isVisibleInDr', () => {
  it('returns true for legacy diary entries (no channels, type "diary")', () => {
    expect(isVisibleInDr({ type: 'diary' })).toBe(true)
  })

  it('returns false for legacy non-diary entries (no channels, type "game")', () => {
    expect(isVisibleInDr({ type: 'game' })).toBe(false)
  })

  it('returns true when channels includes "dr" and source is "manual"', () => {
    const ev: { channels: ActivityChannel[]; source: ActivitySource; type: string } = {
      channels: ['dr'],
      source: 'manual',
      type: 'diary',
    }
    expect(isVisibleInDr(ev)).toBe(true)
  })

  it('returns false when channels includes "dr" but source is "system"', () => {
    const ev: { channels: ActivityChannel[]; source: ActivitySource; type: string } = {
      channels: ['dr'],
      source: 'system',
      type: 'diary',
    }
    expect(isVisibleInDr(ev)).toBe(false)
  })

  it('returns false when channels is ["mainLog"] with source "manual"', () => {
    const ev: { channels: ActivityChannel[]; source: ActivitySource; type: string } = {
      channels: ['mainLog'],
      source: 'manual',
      type: 'game',
    }
    expect(isVisibleInDr(ev)).toBe(false)
  })
})

// ── buildDrSessionSummary ─────────────────────────────────────────────────────

describe('buildDrSessionSummary', () => {
  it('formats a concise one-line summary with week, count, successes and failures', () => {
    const summary = buildDrSessionSummary(3, 5, 4, 1)
    expect(summary).toContain('Day 3')
    expect(summary).toContain('5')
    expect(summary).toContain('4 successes')
    expect(summary).toContain('1 failure')
  })

  it('formats correctly when all actions succeed (zero failures)', () => {
    const summary = buildDrSessionSummary(1, 2, 2, 0)
    expect(summary).toContain('Day 1')
    expect(summary).toContain('2 successes')
    expect(summary).toContain('0 failure')
  })

  it('returns a single line (no newline characters)', () => {
    const summary = buildDrSessionSummary(2, 3, 2, 1)
    expect(summary).not.toContain('\n')
  })
})

// ── Integration: social action log entries ────────────────────────────────────

describe('activity routing for social action log entries', () => {
  it('manual social action entry is visible in DR when channels includes "dr"', () => {
    const ev: { channels: ActivityChannel[]; source: ActivitySource; type: string } = {
      channels: ['dr'],
      source: 'manual',
      type: 'diary',
    }
    expect(isVisibleInDr(ev)).toBe(true)
    expect(isVisibleInMainLog(ev)).toBe(false)
    expect(isVisibleOnTv(ev)).toBe(false)
  })

  it('system (AI) action entry is NOT visible in DR', () => {
    const ev: { channels: ActivityChannel[]; source: ActivitySource; type: string } = {
      channels: ['dr'],
      source: 'system',
      type: 'diary',
    }
    expect(isVisibleInDr(ev)).toBe(false)
  })

  it('TV close message is visible on TV and in main log but not in DR', () => {
    const ev: { channels: ActivityChannel[]; source?: ActivitySource; type: string } = {
      channels: ['tv', 'mainLog'],
      type: 'social',
    }
    expect(isVisibleOnTv(ev)).toBe(true)
    expect(isVisibleInMainLog(ev)).toBe(true)
    expect(isVisibleInDr(ev)).toBe(false)
  })
})
