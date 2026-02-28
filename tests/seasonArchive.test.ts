/**
 * Season archive — unit tests.
 *
 * Validates:
 *  1. archiveSeason prepends an entry to seasonArchives.
 *  2. archiveSeason caps the list at 50 entries.
 *  3. replacePlayers replaces the player list wholesale.
 *  4. resetGame preserves existing seasonArchives.
 *  5. resetGame normalises all fresh players to status 'active'.
 *  6. archivePersistence helpers are safe to call (no-throw guard).
 */

import { describe, it, expect } from 'vitest';
import { configureStore } from '@reduxjs/toolkit';
import gameReducer, {
  archiveSeason,
  replacePlayers,
  resetGame,
} from '../src/store/gameSlice';
import settingsReducer, { DEFAULT_SETTINGS } from '../src/store/settingsSlice';
import type { GameState, Player } from '../src/types';
import type { SeasonArchive } from '../src/store/seasonArchive';
import { saveSeasonArchives, loadSeasonArchives, DEFAULT_ARCHIVE_KEY } from '../src/store/archivePersistence';

// ── Helpers ──────────────────────────────────────────────────────────────────

function makePlayers(count: number): Player[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `p${i}`,
    name: `Player ${i}`,
    avatar: '🧑',
    status: 'active' as const,
    isUser: i === 0,
  }));
}

function makeArchive(seasonIndex: number): SeasonArchive {
  return {
    seasonIndex,
    seasonId: `season-${seasonIndex}-${seasonIndex * 1000}`,
    playerSummaries: [],
  };
}

function makeStore(gameOverrides: Partial<GameState> = {}) {
  const base: GameState = {
    season: 1,
    week: 1,
    phase: 'week_start',
    seed: 42,
    hohId: null,
    prevHohId: null,
    nomineeIds: [],
    povWinnerId: null,
    replacementNeeded: false,
    povSavedId: null,
    awaitingNominations: false,
    pendingNominee1Id: null,
    awaitingPovDecision: false,
    awaitingPovSaveTarget: false,
    votes: {},
    awaitingHumanVote: false,
    awaitingTieBreak: false,
    tiedNomineeIds: null,
    awaitingFinal3Eviction: false,
    f3Part1WinnerId: null,
    f3Part2WinnerId: null,
    voteResults: null,
    evictionSplashId: null,
    players: makePlayers(6),
    tvFeed: [],
    isLive: false,
    seasonArchives: [],
  };

  return configureStore({
    reducer: { game: gameReducer, settings: settingsReducer },
    preloadedState: {
      game: { ...base, ...gameOverrides },
      settings: DEFAULT_SETTINGS,
    },
  });
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('archiveSeason reducer', () => {
  it('prepends an archive entry', () => {
    const store = makeStore();
    store.dispatch(archiveSeason(makeArchive(1)));
    const archives = store.getState().game.seasonArchives ?? [];
    expect(archives).toHaveLength(1);
    expect(archives[0].seasonIndex).toBe(1);
  });

  it('prepends so newest is first', () => {
    const store = makeStore();
    store.dispatch(archiveSeason(makeArchive(1)));
    store.dispatch(archiveSeason(makeArchive(2)));
    const archives = store.getState().game.seasonArchives ?? [];
    expect(archives[0].seasonIndex).toBe(2);
    expect(archives[1].seasonIndex).toBe(1);
  });

  it('caps list at 50 entries', () => {
    const existing: SeasonArchive[] = Array.from({ length: 50 }, (_, i) => makeArchive(i + 1));
    const store = makeStore({ seasonArchives: existing });
    store.dispatch(archiveSeason(makeArchive(51)));
    const archives = store.getState().game.seasonArchives ?? [];
    expect(archives).toHaveLength(50);
    expect(archives[0].seasonIndex).toBe(51);
  });
});

describe('replacePlayers reducer', () => {
  it('replaces the player list wholesale', () => {
    const store = makeStore({ players: makePlayers(6) });
    const newPlayers = makePlayers(4);
    store.dispatch(replacePlayers(newPlayers));
    expect(store.getState().game.players).toHaveLength(4);
    expect(store.getState().game.players).toEqual(newPlayers);
  });
});

describe('resetGame with archives', () => {
  it('preserves existing seasonArchives across reset', () => {
    const existing: SeasonArchive[] = [makeArchive(1), makeArchive(2)];
    const store = makeStore({ seasonArchives: existing });
    store.dispatch(resetGame());
    const archives = store.getState().game.seasonArchives ?? [];
    expect(archives).toHaveLength(2);
    expect(archives[0].seasonIndex).toBe(1);
  });

  it('all fresh players have status active after reset', () => {
    // Simulate end-game state with evicted/jury players
    const players: Player[] = [
      { id: 'p0', name: 'You', avatar: '👤', status: 'active', isUser: true },
      { id: 'p1', name: 'Alice', avatar: '👩', status: 'evicted' },
      { id: 'p2', name: 'Bob', avatar: '🧑', status: 'jury' },
      { id: 'p3', name: 'Carol', avatar: '👩', status: 'active' },
    ];
    const store = makeStore({ players });
    store.dispatch(resetGame());
    const freshPlayers = store.getState().game.players;
    expect(freshPlayers.every((p) => p.status === 'active')).toBe(true);
  });

  it('clears finalRank and isWinner after reset', () => {
    const players: Player[] = [
      { id: 'p0', name: 'You', avatar: '👤', status: 'active', isUser: true, finalRank: 1, isWinner: true },
      { id: 'p1', name: 'Alice', avatar: '👩', status: 'evicted', finalRank: 2 },
    ];
    const store = makeStore({ players });
    store.dispatch(resetGame());
    const freshPlayers = store.getState().game.players;
    expect(freshPlayers.every((p) => p.finalRank === undefined)).toBe(true);
    expect(freshPlayers.every((p) => p.isWinner === undefined)).toBe(true);
  });
});

describe('archivePersistence', () => {
  it('saveSeasonArchives and loadSeasonArchives round-trip via localStorage', () => {
    const archives: SeasonArchive[] = [makeArchive(1), makeArchive(2)];
    saveSeasonArchives(DEFAULT_ARCHIVE_KEY, archives);
    const loaded = loadSeasonArchives(DEFAULT_ARCHIVE_KEY);
    expect(loaded).toEqual(archives);
  });

  it('loadSeasonArchives returns undefined for unknown key', () => {
    const result = loadSeasonArchives('bbmobilenew:nonexistent-key-xyz');
    expect(result).toBeUndefined();
  });

  it('saveSeasonArchives does not throw when called', () => {
    expect(() => saveSeasonArchives(DEFAULT_ARCHIVE_KEY, [])).not.toThrow();
  });
});
