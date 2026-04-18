/**
 * Unit tests for the pure Crystal Path: Shattered gameplay logic.
 * These cover SP damage bands, mystery cadence, effect resolution, and ranking.
 */
import { describe, expect, it } from 'vitest';
import { mulberry32 } from '../src/store/rng';
import {
  applyMysteryEffect,
  buildSummary,
  createRowStream,
  EFFECT_DURATION_MS,
  getRowBandDamage,
  HIDDEN_BRIDGE_LENGTH,
  MYSTERY_MAX_GAP,
  MYSTERY_MIN_GAP,
  mergeEffect,
  rankPlayers,
  resolveWrongTileDelta,
  rollMysteryEffect,
  STARTING_HINTS,
  STARTING_SP,
  type ActiveEffect,
  type PlayerState,
} from '../src/minigames/crystalPathShattered/shatteredLogic';

function mkPlayer(partial: Partial<PlayerState>): PlayerState {
  return {
    id: 'p',
    name: 'P',
    isHuman: false,
    sp: STARTING_SP,
    hints: STARTING_HINTS,
    furthestRow: 0,
    effects: [],
    eliminated: false,
    eliminatedRow: null,
    finishedAtMs: null,
    survivalIndex: 0,
    ...partial,
  };
}

describe('shatteredLogic · damage bands', () => {
  it('applies -10 SP for rows 1-10', () => {
    for (const r of [1, 5, 10]) expect(getRowBandDamage(r)).toBe(10);
  });
  it('applies -15 SP for rows 11-25', () => {
    for (const r of [11, 20, 25]) expect(getRowBandDamage(r)).toBe(15);
  });
  it('applies -20 SP for rows 26+', () => {
    for (const r of [26, 100, HIDDEN_BRIDGE_LENGTH]) expect(getRowBandDamage(r)).toBe(20);
  });
});

describe('shatteredLogic · resolveWrongTileDelta', () => {
  const now = 1_000;
  it('deals the base damage with no effects', () => {
    expect(resolveWrongTileDelta(15, [], now).delta).toBe(-15);
  });
  it('shield absorbs the wrong step and is consumed', () => {
    const shield: ActiveEffect = { kind: 'shield_5s', expiresAt: now + 1_000 };
    const res = resolveWrongTileDelta(20, [shield], now);
    expect(res.delta).toBe(0);
    expect(res.consumedKind).toBe('shield_5s');
    expect(res.newEffects).toHaveLength(0);
  });
  it('lucky heals instead of hurting', () => {
    const lucky: ActiveEffect = { kind: 'lucky_5s', expiresAt: now + 1_000 };
    const res = resolveWrongTileDelta(10, [lucky], now);
    expect(res.delta).toBe(10);
    expect(res.consumedKind).toBe('lucky_5s');
  });
  it('fragility doubles the damage', () => {
    const frag: ActiveEffect = { kind: 'fragility_5s', expiresAt: now + 1_000 };
    expect(resolveWrongTileDelta(10, [frag], now).delta).toBe(-20);
  });
  it('ignores expired effects', () => {
    const expired: ActiveEffect = { kind: 'shield_5s', expiresAt: now - 1 };
    expect(resolveWrongTileDelta(15, [expired], now).delta).toBe(-15);
  });
});

describe('shatteredLogic · mystery cadence', () => {
  it('generates mystery rows spaced within [MIN, MAX]', () => {
    const rng = mulberry32(12345);
    const stream = createRowStream(rng);
    const rows = stream.take(120);
    const mysteryIndices = rows.filter((r) => r.hasMystery).map((r) => r.index);
    expect(mysteryIndices.length).toBeGreaterThan(0);
    for (let i = 1; i < mysteryIndices.length; i += 1) {
      const gap = mysteryIndices[i] - mysteryIndices[i - 1];
      expect(gap).toBeGreaterThanOrEqual(MYSTERY_MIN_GAP);
      expect(gap).toBeLessThanOrEqual(MYSTERY_MAX_GAP);
    }
  });
  it('never places a mystery at or past the hidden bridge end', () => {
    const rng = mulberry32(99);
    const stream = createRowStream(rng);
    const rows = stream.take(HIDDEN_BRIDGE_LENGTH + 20);
    for (const r of rows) {
      if (r.hasMystery) expect(r.index).toBeLessThan(HIDDEN_BRIDGE_LENGTH);
    }
  });
});

describe('shatteredLogic · mystery effects', () => {
  it('rollMysteryEffect returns a valid kind', () => {
    const rng = mulberry32(7);
    for (let i = 0; i < 50; i += 1) {
      expect(rollMysteryEffect(rng)).toBeDefined();
    }
  });
  it('timed effects produce an ActiveEffect with 5s expiry', () => {
    const applied = applyMysteryEffect('shield_5s', 1_000);
    expect(applied.addedEffect?.expiresAt).toBe(1_000 + EFFECT_DURATION_MS);
    expect(applied.spDelta).toBe(0);
  });
  it('instant +20 applies SP delta only', () => {
    const applied = applyMysteryEffect('heal_20', 0);
    expect(applied.spDelta).toBe(20);
    expect(applied.addedEffect).toBeNull();
  });
  it('caps simultaneous active effects at the max', () => {
    const now = 0;
    let effects: ActiveEffect[] = [];
    effects = mergeEffect(effects, { kind: 'shield_5s', expiresAt: 1_000 }, now);
    effects = mergeEffect(effects, { kind: 'regen_5s',  expiresAt: 2_000 }, now);
    effects = mergeEffect(effects, { kind: 'lucky_5s',  expiresAt: 3_000 }, now);
    expect(effects).toHaveLength(2);
    // oldest-expiring (shield @1000) was dropped
    expect(effects.map((e) => e.kind)).not.toContain('shield_5s');
  });
});

describe('shatteredLogic · ranking', () => {
  it('ranks by furthest row then SP then survivalIndex', () => {
    const a = mkPlayer({ id: 'a', furthestRow: 40, sp: 50,  survivalIndex: 0 });
    const b = mkPlayer({ id: 'b', furthestRow: 40, sp: 120, survivalIndex: 0 });
    const c = mkPlayer({ id: 'c', furthestRow: 30, sp: 200, eliminated: true, survivalIndex: 2 });
    const d = mkPlayer({ id: 'd', furthestRow: 30, sp: 200, survivalIndex: 1, eliminated: true });
    const ranked = rankPlayers([a, b, c, d]);
    expect(ranked.map((p) => p.id)).toEqual(['b', 'a', 'c', 'd']);
  });
  it('secret 350-row winner is always first', () => {
    const a = mkPlayer({ id: 'a', furthestRow: 100, sp: 300 });
    const b = mkPlayer({ id: 'b', furthestRow: HIDDEN_BRIDGE_LENGTH, sp: 10, finishedAtMs: 5 });
    const ranked = rankPlayers([a, b]);
    expect(ranked[0].id).toBe('b');
  });
});

describe('shatteredLogic · summary', () => {
  it('identifies secretWinner when any player finished', () => {
    const a = mkPlayer({ id: 'a', furthestRow: HIDDEN_BRIDGE_LENGTH, finishedAtMs: 1 });
    const b = mkPlayer({ id: 'b', furthestRow: 50, eliminated: true });
    const summary = buildSummary([a, b]);
    expect(summary.secretWinner).toBe(true);
    expect(summary.winnerId).toBe('a');
    expect(summary.furthestRow.a).toBe(HIDDEN_BRIDGE_LENGTH);
  });
});
