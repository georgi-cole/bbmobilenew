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
 *  7. Season number is derived from max(seasonIndex)+1, not length+1 (handles cap/gaps).
 *  8. Non-contiguous season indices use the highest index.
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
    // Now resetGame() without args should use state.seasonArchives.
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
    const welcome = feed.find((event) => event.meta?.broadcastTemplateId === 'season.welcome');
    expect(welcome?.text).toContain('Season 2');
  });

  it('seasonArchives are preserved in fresh state after resetGame with explicit archives', () => {
    const archives = [buildArchive(1), buildArchive(2)];
    const store = makeStore();
    store.dispatch(resetGame(archives));
    expect(store.getState().game.seasonArchives).toHaveLength(2);
  });

  it('uses max(seasonIndex)+1 even when archives are capped at 50 entries (e.g. season 60 history)', () => {
    // Simulate: archives are capped at 50 but the last archived season was #60.
    // The array contains entries 11–60 (50 items) — length=50 but max=60.
    const archives = Array.from({ length: 50 }, (_, i) => buildArchive(i + 11));
    const store = makeStore();
    store.dispatch(resetGame(archives));
    // Expected: max(11..60)=60 → next = 61, not length+1=51.
    expect(store.getState().game.season).toBe(61);
  });

  it('uses max(seasonIndex)+1 for non-contiguous archive indices', () => {
    // E.g. manually created or partially migrated data with gaps.
    const archives = [buildArchive(1), buildArchive(5), buildArchive(3)];
    const store = makeStore();
    store.dispatch(resetGame(archives));
    expect(store.getState().game.season).toBe(6);
  });
});
