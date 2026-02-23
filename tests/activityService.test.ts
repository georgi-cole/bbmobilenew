/**
 * Unit tests for src/services/activityService.ts
 *
 * Covers channel routing predicates and the DR session summary builder:
 *  1.  isVisibleInMainLog — no channels (legacy): always visible.
 *  2.  isVisibleInMainLog — channels includes 'mainLog': visible.
 *  3.  isVisibleInMainLog — channels includes 'tv': visible (TV messages appear in log).
 *  4.  isVisibleInMainLog — channels is ['dr'] only: NOT visible.
 *  5.  isVisibleInMainLog — channels is ['recentActivity'] only: NOT visible.
 *  6.  isVisibleOnTv — no channels: always visible.
 *  7.  isVisibleOnTv — channels includes 'tv': visible.
 *  8.  isVisibleOnTv — channels includes 'mainLog': visible.
 *  9.  isVisibleOnTv — channels is ['dr'] only: NOT visible.
 * 10.  isVisibleInDr — no channels, type 'diary': visible (legacy confessional entries).
 * 11.  isVisibleInDr — no channels, type 'game': NOT visible.
 * 12.  isVisibleInDr — channels includes 'dr', source 'manual': visible.
 * 13.  isVisibleInDr — channels includes 'dr', source 'system': NOT visible.
 * 14.  isVisibleInDr — channels is ['mainLog'], source 'manual': NOT visible.
 * 15.  buildDrSessionSummary — formats concise one-line summary correctly.
 * 16.  buildDrSessionSummary — zero failures produces correct copy.
 * 17.  Social action entries with source 'manual' pass isVisibleInDr when channels includes 'dr'.
 * 18.  Social action entries with source 'system' do NOT pass isVisibleInDr.
 */

import { describe, it, expect } from 'vitest';
import {
  isVisibleInMainLog,
  isVisibleOnTv,
  isVisibleInDr,
  buildDrSessionSummary,
  type ActivityChannel,
  type ActivitySource,
} from '../src/services/activityService';

// ── isVisibleInMainLog ────────────────────────────────────────────────────────

describe('isVisibleInMainLog', () => {
  it('returns true when no channels are set (legacy event)', () => {
    expect(isVisibleInMainLog({})).toBe(true);
  });

  it('returns true when channels includes "mainLog"', () => {
    expect(isVisibleInMainLog({ channels: ['mainLog'] })).toBe(true);
  });

  it('returns true when channels includes "tv"', () => {
    expect(isVisibleInMainLog({ channels: ['tv', 'mainLog'] })).toBe(true);
    expect(isVisibleInMainLog({ channels: ['tv'] })).toBe(true);
  });

  it('returns false when channels is ["dr"] only', () => {
    expect(isVisibleInMainLog({ channels: ['dr'] })).toBe(false);
  });

  it('returns false when channels is ["recentActivity"] only', () => {
    expect(isVisibleInMainLog({ channels: ['recentActivity'] })).toBe(false);
  });
});

// ── isVisibleOnTv ─────────────────────────────────────────────────────────────

describe('isVisibleOnTv', () => {
  it('returns true when no channels are set (legacy event)', () => {
    expect(isVisibleOnTv({})).toBe(true);
  });

  it('returns true when channels includes "tv"', () => {
    expect(isVisibleOnTv({ channels: ['tv'] })).toBe(true);
  });

  it('returns true when channels includes "mainLog"', () => {
    expect(isVisibleOnTv({ channels: ['mainLog'] })).toBe(true);
  });

  it('returns false when channels is ["dr"] only', () => {
    expect(isVisibleOnTv({ channels: ['dr'] })).toBe(false);
  });
});

// ── isVisibleInDr ─────────────────────────────────────────────────────────────

describe('isVisibleInDr', () => {
  it('returns true for legacy diary entries (no channels, type "diary")', () => {
    expect(isVisibleInDr({ type: 'diary' })).toBe(true);
  });

  it('returns false for legacy non-diary entries (no channels, type "game")', () => {
    expect(isVisibleInDr({ type: 'game' })).toBe(false);
  });

  it('returns true when channels includes "dr" and source is "manual"', () => {
    const ev: { channels: ActivityChannel[]; source: ActivitySource; type: string } = {
      channels: ['dr'],
      source: 'manual',
      type: 'diary',
    };
    expect(isVisibleInDr(ev)).toBe(true);
  });

  it('returns false when channels includes "dr" but source is "system"', () => {
    const ev: { channels: ActivityChannel[]; source: ActivitySource; type: string } = {
      channels: ['dr'],
      source: 'system',
      type: 'diary',
    };
    expect(isVisibleInDr(ev)).toBe(false);
  });

  it('returns false when channels is ["mainLog"] with source "manual"', () => {
    const ev: { channels: ActivityChannel[]; source: ActivitySource; type: string } = {
      channels: ['mainLog'],
      source: 'manual',
      type: 'game',
    };
    expect(isVisibleInDr(ev)).toBe(false);
  });
});

// ── buildDrSessionSummary ─────────────────────────────────────────────────────

describe('buildDrSessionSummary', () => {
  it('formats a concise one-line summary with week, count, successes and failures', () => {
    const summary = buildDrSessionSummary(3, 5, 4, 1);
    expect(summary).toContain('Week 3');
    expect(summary).toContain('5');
    expect(summary).toContain('4 success');
    expect(summary).toContain('1 failure');
  });

  it('formats correctly when all actions succeed (zero failures)', () => {
    const summary = buildDrSessionSummary(1, 2, 2, 0);
    expect(summary).toContain('Week 1');
    expect(summary).toContain('2 success');
    expect(summary).toContain('0 failure');
  });

  it('returns a single line (no newline characters)', () => {
    const summary = buildDrSessionSummary(2, 3, 2, 1);
    expect(summary).not.toContain('\n');
  });
});

// ── Integration: social action log entries ────────────────────────────────────

describe('activity routing for social action log entries', () => {
  it('manual social action entry is visible in DR when channels includes "dr"', () => {
    const ev: { channels: ActivityChannel[]; source: ActivitySource; type: string } = {
      channels: ['dr'],
      source: 'manual',
      type: 'diary',
    };
    expect(isVisibleInDr(ev)).toBe(true);
    expect(isVisibleInMainLog(ev)).toBe(false);
    expect(isVisibleOnTv(ev)).toBe(false);
  });

  it('system (AI) action entry is NOT visible in DR', () => {
    const ev: { channels: ActivityChannel[]; source: ActivitySource; type: string } = {
      channels: ['dr'],
      source: 'system',
      type: 'diary',
    };
    expect(isVisibleInDr(ev)).toBe(false);
  });

  it('TV close message is visible on TV and in main log but not in DR', () => {
    const ev: { channels: ActivityChannel[]; source?: ActivitySource; type: string } = {
      channels: ['tv', 'mainLog'],
      type: 'social',
    };
    expect(isVisibleOnTv(ev)).toBe(true);
    expect(isVisibleInMainLog(ev)).toBe(true);
    expect(isVisibleInDr(ev)).toBe(false);
  });
});
