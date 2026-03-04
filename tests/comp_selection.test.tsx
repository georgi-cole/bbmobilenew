/**
 * Comp Selection — tests (Vitest).
 *
 * Covers:
 *  1. CompSelection React component — loading state, single-game dropdown
 *     populated from fetchGames, save flow (mode + selectedGameId).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import CompSelection from '../src/components/CompSelection';
import {
  type CompGame,
  type CompSelectionPayload,
} from '../src/components/compSelectionUtils';

// ── Fixtures ──────────────────────────────────────────────────────────────────

const MOCK_GAMES: CompGame[] = [
  { id: 'tap-race',     name: 'Tap Race',     icon: '👆', category: 'physical',  enabled: true  },
  { id: 'trivia-blitz', name: 'Trivia Blitz', icon: '❓', category: 'mental',    enabled: true  },
  { id: 'maze-run',     name: 'Maze Run',     icon: '🌀', category: 'endurance', enabled: false },
  { id: 'memory-match', name: 'Memory Match', icon: '🃏', category: 'mental',    enabled: false },
];

function fetchGamesMock(): Promise<CompGame[]> {
  return Promise.resolve(MOCK_GAMES);
}

// ── CompSelection component ───────────────────────────────────────────────────

describe('CompSelection component', () => {
  let onSave: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    onSave = vi.fn().mockResolvedValue(undefined);
  });

  it('shows loading state then populates the single-game dropdown', async () => {
    render(<CompSelection fetchGames={fetchGamesMock} onSave={onSave} />);

    // Loading state renders first
    expect(screen.getByText(/loading/i)).toBeTruthy();

    // Switch to single-game mode — wait for loading to finish first
    await waitFor(() => screen.getByLabelText('Selection mode'));

    fireEvent.change(screen.getByLabelText('Selection mode'), {
      target: { value: 'single-game' },
    });

    // Single-game dropdown should be visible and populated from fetchGames
    const gameSelect = await waitFor(() => screen.getByLabelText('Single game key'));
    expect(gameSelect).toBeTruthy();

    // All mock games should appear as options
    for (const game of MOCK_GAMES) {
      expect(screen.getByText(`${game.name} (${game.id})`)).toBeTruthy();
    }
  });

  it('shows an error message when fetchGames rejects', async () => {
    const failFetch = () => Promise.reject(new Error('network error'));
    render(<CompSelection fetchGames={failFetch} onSave={onSave} />);
    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeTruthy();
      expect(screen.getByText(/network error/i)).toBeTruthy();
    });
  });

  it('calls onSave with { mode, selectedGameId } when mode is single-game', async () => {
    render(<CompSelection fetchGames={fetchGamesMock} onSave={onSave} />);

    // Wait for loading to finish
    await waitFor(() => screen.getByLabelText('Selection mode'));

    // Switch to single-game mode
    fireEvent.change(screen.getByLabelText('Selection mode'), {
      target: { value: 'single-game' },
    });

    // Pick a game
    const gameSelect = await waitFor(() => screen.getByLabelText('Single game key'));
    fireEvent.change(gameSelect, { target: { value: 'tap-race' } });

    // Save
    fireEvent.click(screen.getByText('Save Selection'));

    await waitFor(() => {
      expect(onSave).toHaveBeenCalledTimes(1);
    });
    const [payload] = onSave.mock.calls[0] as [CompSelectionPayload];
    expect(payload.mode).toBe('single-game');
    expect(payload.selectedGameId).toBe('tap-race');
  });

  it('calls onSave with only { mode } when mode is not single-game', async () => {
    render(<CompSelection fetchGames={fetchGamesMock} onSave={onSave} />);

    await waitFor(() => screen.getByLabelText('Selection mode'));

    // Default mode is random-games — just click Save
    fireEvent.click(screen.getByText('Save Selection'));

    await waitFor(() => {
      expect(onSave).toHaveBeenCalledTimes(1);
    });
    const [payload] = onSave.mock.calls[0] as [CompSelectionPayload];
    expect(payload.mode).toBe('random-games');
    expect(payload.selectedGameId).toBeUndefined();
  });

  it('shows "Saved!" confirmation after a successful save', async () => {
    render(<CompSelection fetchGames={fetchGamesMock} onSave={onSave} />);

    await waitFor(() => screen.getByLabelText('Selection mode'));

    fireEvent.click(screen.getByText('Save Selection'));

    await waitFor(() => {
      expect(screen.getByText(/saved/i)).toBeTruthy();
    });
  });
});

