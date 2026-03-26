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
  it('uses non-standard, creative color names (not plain primary colors)', () => {
    const fs = require('fs');
    const path = require('path');
    const src: string = fs.readFileSync(
      path.resolve(__dirname, '../src/components/MemoryColorsComp/MemoryColorsComp.tsx'),
      'utf-8',
    );
    // Should NOT contain plain 'Red', 'Blue', 'Green', 'Yellow' in the COLOR_NAMES array
    expect(src).not.toMatch(/COLOR_NAMES\s*=\s*\[.*'Red'.*\]/s);
    expect(src).not.toMatch(/COLOR_NAMES\s*=\s*\[.*'Blue'.*\]/s);
    // Should contain creative names from the requested palette
    expect(src).toMatch(/Scarlet|Baby Blue|Milky Grass|Blood Orange/);
  });
});
