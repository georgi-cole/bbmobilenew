/**
 * MemoryColors registry & store integration smoke tests.
 *
 * Covers:
 *  1. memoryMatch registry entry uses React architecture (no legacy).
 *  2. The memoryColors reducer is wired into the Redux store.
 *  3. The color names are non-standard/creative (not plain Red/Blue/Green/Yellow).
 */

import { describe, it, expect } from 'vitest';
import { getGame } from '../src/minigames/registry';
import {
  INITIAL_SEQUENCE_LENGTH,
  MAX_MISTAKES,
  MEMORY_COLOR_POOL,
} from '../src/features/memoryColors/memoryColorsSlice';

// ── 1. Registry checks ────────────────────────────────────────────────────────

describe('memoryMatch registry entry', () => {
  it('is active (not retired)', () => {
    const entry = getGame('memoryMatch');
    expect(entry).toBeDefined();
    expect(entry?.retired).toBe(false);
  });

  it('uses React implementation', () => {
    const entry = getGame('memoryMatch');
    expect(entry?.implementation).toBe('react');
    expect(entry?.legacy).toBe(false);
  });

  it('has reactComponentKey "MemoryColors"', () => {
    const entry = getGame('memoryMatch');
    expect(entry?.reactComponentKey).toBe('MemoryColors');
  });

  it('does not use legacy modulePath', () => {
    const entry = getGame('memoryMatch');
    expect((entry as Record<string, unknown>)?.modulePath).toBeUndefined();
  });
});

// ── 2. Redux store wires the memoryColors reducer ─────────────────────────────

describe('memoryColors store registration', () => {
  it('store has a memoryColors key after import', async () => {
    // Dynamically import the store so we test the actual configured store
    const { store } = await import('../src/store/store');
    const state = store.getState() as Record<string, unknown>;
    expect(state['memoryColors']).toBeDefined();
    expect((state['memoryColors'] as { phase: string }).phase).toBe('idle');
  });
});

// ── 3. Color names are creative / non-standard ───────────────────────────────

describe('MemoryColorsComp color names', () => {
  it('exports a 20-color creative palette', () => {
    expect(MEMORY_COLOR_POOL).toHaveLength(20);
    expect(MEMORY_COLOR_POOL.map((c) => c.name)).toEqual(
      expect.arrayContaining(['Scarlet', 'Baby Blue', 'Milky Grass', 'Blood Orange']),
    );
  });

  it('starts at 5 colors and allows 5 mistakes', () => {
    expect(INITIAL_SEQUENCE_LENGTH).toBe(5);
    expect(MAX_MISTAKES).toBe(5);
  });
});
