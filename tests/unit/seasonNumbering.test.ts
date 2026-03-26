/**
 * Season numbering — unit tests.
 *
 * Validates:
 *  1. resetGame() with empty archives starts Season 1.
 *  2. resetGame() with 1 archived season starts Season 2.
 *  3. resetGame() with 2 archived seasons starts Season 3.
 *  4. resetGame() without explicit archives falls back to current state archives.
 *  5. hydrateGame() preserves the saved season number unchanged.
 *  6. Welcome tvFeed message reflects the actual season number.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { configureStore } from '@reduxjs/toolkit';
import gameReducer, { resetGame, hydrateGame, archiveSeason, createInitialGameState } from '../../src/store/gameSlice';
import type { SeasonArchive } from '../../src/store/seasonArchive';
import type { GameState } from '../../src/types';

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeStore() {
  return configureStore({ reducer: { game: gameReducer } });
}

function buildArchive(seasonIndex: number): SeasonArchive {
  return {
    seasonIndex,
    seasonId: `season-${seasonIndex}-test`,
    endAt: new Date().toISOString(),
    playerSummaries: [],
  };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

beforeEach(() => {
  // Ensure localStorage is empty so archive loading starts fresh.
  localStorage.clear();
});

afterEach(() => {
  localStorage.clear();
});

describe('season numbering', () => {
  it('resetGame with empty archives produces Season 1', () => {
    const store = makeStore();
    store.dispatch(resetGame([]));
    expect(store.getState().game.season).toBe(1);
  });

  it('resetGame with 1 archived season produces Season 2', () => {
    const store = makeStore();
    store.dispatch(resetGame([buildArchive(1)]));
    expect(store.getState().game.season).toBe(2);
  });

  it('resetGame with 2 archived seasons produces Season 3', () => {
    const store = makeStore();
    store.dispatch(resetGame([buildArchive(1), buildArchive(2)]));
    expect(store.getState().game.season).toBe(3);
  });

  it('resetGame without explicit archives uses in-memory archives', () => {
    const store = makeStore();
    // Dispatch archiveSeason to add an archive to in-memory state.
    store.dispatch(archiveSeason(buildArchive(1)));
    // Now resetGame() without args should use state.seasonArchives (length=1).
    store.dispatch(resetGame());
    expect(store.getState().game.season).toBe(2);
  });

  it('hydrateGame preserves the saved season number', () => {
    const store = makeStore();
    // Simulate a snapshot from Season 2.
    const snapshot: GameState = { ...createInitialGameState(), season: 2 };
    store.dispatch(hydrateGame(snapshot));
    expect(store.getState().game.season).toBe(2);
  });

  it('resetGame welcome message reflects the correct season number', () => {
    const store = makeStore();
    store.dispatch(resetGame([buildArchive(1)]));
    const feed = store.getState().game.tvFeed;
    const welcome = feed.find((e) => e.id === 'e0');
    expect(welcome?.text).toContain('Season 2');
  });

  it('seasonArchives are preserved in fresh state after resetGame with explicit archives', () => {
    const archives = [buildArchive(1), buildArchive(2)];
    const store = makeStore();
    store.dispatch(resetGame(archives));
    expect(store.getState().game.seasonArchives).toHaveLength(2);
  });
});
