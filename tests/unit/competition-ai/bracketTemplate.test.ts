import { describe, expect, it } from 'vitest';
import {
  DEFAULT_BRACKET_TEMPLATE,
  getBracketPoolForContext,
  type BracketTemplate,
} from '../../../src/ai/competition/bracketTemplate';
import { getGame } from '../../../src/minigames/registry';

// ── Helpers ───────────────────────────────────────────────────────────────────

function allKeys(template: BracketTemplate): string[] {
  return template.flatMap((band) => [...band.loh, ...band.pos]);
}

// ── Registry integrity ────────────────────────────────────────────────────────

describe('DEFAULT_BRACKET_TEMPLATE — registry integrity', () => {
  it('every game key in the template resolves to a known registry entry', () => {
    const unknown = allKeys(DEFAULT_BRACKET_TEMPLATE).filter((k) => !getGame(k));
    expect(unknown).toEqual([]);
  });

  it('every game key in the template is non-retired', () => {
    const retired = allKeys(DEFAULT_BRACKET_TEMPLATE).filter((k) => {
      const g = getGame(k);
      return g?.retired === true;
    });
    expect(retired).toEqual([]);
  });

  it('bands are ordered from highest maxPlayers to lowest', () => {
    const maxValues = DEFAULT_BRACKET_TEMPLATE.map((b) => b.maxPlayers);
    for (let i = 1; i < maxValues.length; i++) {
      expect(maxValues[i]).toBeLessThanOrEqual(maxValues[i - 1]);
    }
  });

  it('every LOH band has at least one game', () => {
    const empty = DEFAULT_BRACKET_TEMPLATE.filter((b) => b.loh.length === 0);
    expect(empty).toEqual([]);
  });

  it('final 3 band has an empty POS pool', () => {
    const f3 = DEFAULT_BRACKET_TEMPLATE.find(
      (b) => b.minPlayers === 3 && b.maxPlayers === 3,
    );
    expect(f3).toBeDefined();
    expect(f3?.pos).toEqual([]);
  });
});

// ── getBracketPoolForContext ───────────────────────────────────────────────────

describe('getBracketPoolForContext', () => {
  it('returns the 16–13 LOH pool for 16 players', () => {
    const pool = getBracketPoolForContext(16, 'LOH');
    expect(pool).toContain('majorityRules');
    expect(pool).toContain('trapAuction');
    expect(pool.length).toBeGreaterThan(0);
  });

  it('returns the 16–13 POS pool for 13 players', () => {
    const pool = getBracketPoolForContext(13, 'POS');
    expect(pool).toContain('quickTap');
    expect(pool).toContain('holdWall');
  });

  it('returns the 12–10 LOH pool for 10 players', () => {
    const pool = getBracketPoolForContext(10, 'LOH');
    expect(pool).toContain('blackjackTournament');
    expect(pool).toContain('silentSaboteur');
  });

  it('returns the 9–8 LOH pool for 9 players', () => {
    const pool = getBracketPoolForContext(9, 'LOH');
    expect(pool).toContain('famousFigures');
    expect(pool).toContain('wildcardWestern');
  });

  it('returns the 7–5 POS pool for 5 players', () => {
    const pool = getBracketPoolForContext(5, 'POS');
    expect(pool).toContain('cardClash');
    expect(pool).toContain('threeDigitsQuiz');
  });

  it('returns the 4-player LOH pool for 4 players', () => {
    const pool = getBracketPoolForContext(4, 'LOH');
    expect(pool).toContain('gridOfLuck');
    expect(pool).toContain('logicLocks');
  });

  it('returns an empty pool for final-3 POS (no POS at final 3)', () => {
    const pool = getBracketPoolForContext(3, 'POS');
    expect(pool).toEqual([]);
  });

  it('returns the final-3 LOH pool for 3 players', () => {
    const pool = getBracketPoolForContext(3, 'LOH');
    expect(pool).toContain('glass_bridge_brutal');
    expect(pool).toContain('chainOfGreed');
    expect(pool).toContain('gridOfLuck');
  });

  it('returns the widest band when player count exceeds all brackets', () => {
    const pool = getBracketPoolForContext(99, 'LOH');
    // Should match the 16–13 band (highest maxPlayers)
    expect(pool).toContain('majorityRules');
  });

  it('returns an empty pool when player count is below the smallest bracket (e.g. 1 player)', () => {
    // Below the narrowest bracket (3 players) — no fallback to template[0]
    const pool = getBracketPoolForContext(1, 'LOH');
    expect(pool).toEqual([]);
  });

  it('returns an empty pool when player count is 2 (below the narrowest bracket)', () => {
    const pool = getBracketPoolForContext(2, 'POS');
    expect(pool).toEqual([]);
  });

  it('returns a fresh copy each call (mutations do not bleed between calls)', () => {
    const a = getBracketPoolForContext(16, 'LOH');
    const b = getBracketPoolForContext(16, 'LOH');
    a.push('EXTRA');
    expect(b).not.toContain('EXTRA');
  });

  it('supports a custom template override', () => {
    const custom: BracketTemplate = [
      { label: 'test', minPlayers: 1, maxPlayers: 99, loh: ['quickTap'], pos: ['laneRacers'] },
    ];
    expect(getBracketPoolForContext(10, 'LOH', custom)).toEqual(['quickTap']);
    expect(getBracketPoolForContext(10, 'POS', custom)).toEqual(['laneRacers']);
  });
});
