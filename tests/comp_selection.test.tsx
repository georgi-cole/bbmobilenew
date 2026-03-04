/**
 * Comp Selection — test skeleton (Vitest).
 *
 * Covers:
 *  1. validateCompSelection — pure validation logic (no DOM required).
 *  2. CompSelection React component — render, toggle, bulk actions, save flow.
 *
 * WIP: stubs are intentionally thin. Extend once the component is wired to
 * the real API endpoints.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import CompSelection, {
  validateCompSelection,
  type CompGame,
  type CompSelectionPayload,
} from '../src/components/CompSelection';

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

// ── validateCompSelection ─────────────────────────────────────────────────────

describe('validateCompSelection', () => {
  it('is valid when at least one game is enabled with no weeklyLimit', () => {
    const payload: CompSelectionPayload = {
      enabledIds:     ['tap-race'],
      weeklyLimit:    null,
      filterCategory: null,
    };
    const result = validateCompSelection(payload, MOCK_GAMES);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('is invalid when enabledIds is empty', () => {
    const payload: CompSelectionPayload = {
      enabledIds:     [],
      weeklyLimit:    null,
      filterCategory: null,
    };
    const result = validateCompSelection(payload, MOCK_GAMES);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.toLowerCase().includes('at least one'))).toBe(true);
  });

  it('is invalid when enabledIds contains an unknown game ID', () => {
    const payload: CompSelectionPayload = {
      enabledIds:     ['tap-race', 'ghost-game'],
      weeklyLimit:    null,
      filterCategory: null,
    };
    const result = validateCompSelection(payload, MOCK_GAMES);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('ghost-game'))).toBe(true);
  });

  it('is invalid when weeklyLimit exceeds the number of enabled IDs', () => {
    const payload: CompSelectionPayload = {
      enabledIds:     ['tap-race'],
      weeklyLimit:    5,
      filterCategory: null,
    };
    const result = validateCompSelection(payload, MOCK_GAMES);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('Weekly limit cannot exceed'))).toBe(true);
  });

  it('is invalid when weeklyLimit is zero', () => {
    const payload: CompSelectionPayload = {
      enabledIds:     ['tap-race', 'trivia-blitz'],
      weeklyLimit:    0,
      filterCategory: null,
    };
    const result = validateCompSelection(payload, MOCK_GAMES);
    expect(result.valid).toBe(false);
  });

  it('is valid when weeklyLimit equals the number of enabled IDs', () => {
    const payload: CompSelectionPayload = {
      enabledIds:     ['tap-race', 'trivia-blitz'],
      weeklyLimit:    2,
      filterCategory: null,
    };
    const result = validateCompSelection(payload, MOCK_GAMES);
    expect(result.valid).toBe(true);
  });
});

// ── CompSelection component ───────────────────────────────────────────────────

describe('CompSelection component', () => {
  let onSave: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    onSave = vi.fn().mockResolvedValue(undefined);
  });

  it('renders the list of competitions after loading', async () => {
    render(<CompSelection fetchGames={fetchGamesMock} onSave={onSave} />);

    // Loading state first
    expect(screen.getByText(/loading/i)).toBeTruthy();

    // Then game names appear
    await waitFor(() => {
      expect(screen.getByText('Tap Race')).toBeTruthy();
      expect(screen.getByText('Trivia Blitz')).toBeTruthy();
      expect(screen.getByText('Maze Run')).toBeTruthy();
      expect(screen.getByText('Memory Match')).toBeTruthy();
    });
  });

  it('shows an error message when fetchGames rejects', async () => {
    const failFetch = () => Promise.reject(new Error('network error'));
    render(<CompSelection fetchGames={failFetch} onSave={onSave} />);
    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeTruthy();
      expect(screen.getByText(/network error/i)).toBeTruthy();
    });
  });

  it('toggles a game on/off when its checkbox is clicked', async () => {
    render(<CompSelection fetchGames={fetchGamesMock} onSave={onSave} />);
    await waitFor(() => screen.getByText('Maze Run'));

    const mazeCheckbox = screen.getByLabelText('Toggle Maze Run') as HTMLInputElement;
    // Maze Run starts disabled (enabled: false in fixture → not in initial set)
    expect(mazeCheckbox.checked).toBe(false);

    fireEvent.click(mazeCheckbox);
    expect(mazeCheckbox.checked).toBe(true);

    fireEvent.click(mazeCheckbox);
    expect(mazeCheckbox.checked).toBe(false);
  });

  it('"Select all" enables all games', async () => {
    render(<CompSelection fetchGames={fetchGamesMock} onSave={onSave} />);
    await waitFor(() => screen.getByText('Tap Race'));

    fireEvent.click(screen.getByLabelText('Enable all competitions'));

    for (const game of MOCK_GAMES) {
      const cb = screen.getByLabelText(`Toggle ${game.name}`) as HTMLInputElement;
      expect(cb.checked).toBe(true);
    }
  });

  it('"Select none" disables all games', async () => {
    render(<CompSelection fetchGames={fetchGamesMock} onSave={onSave} />);
    await waitFor(() => screen.getByText('Tap Race'));

    fireEvent.click(screen.getByLabelText('Disable all competitions'));

    for (const game of MOCK_GAMES) {
      const cb = screen.getByLabelText(`Toggle ${game.name}`) as HTMLInputElement;
      expect(cb.checked).toBe(false);
    }
  });

  it('shows validation error and does not call onSave when no games are enabled', async () => {
    render(<CompSelection fetchGames={fetchGamesMock} onSave={onSave} />);
    await waitFor(() => screen.getByText('Tap Race'));

    fireEvent.click(screen.getByLabelText('Disable all competitions'));
    fireEvent.click(screen.getByText('Save Selection'));

    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeTruthy();
      expect(screen.getByText(/at least one/i)).toBeTruthy();
    });
    expect(onSave).not.toHaveBeenCalled();
  });

  it('calls onSave with the correct payload when valid', async () => {
    render(<CompSelection fetchGames={fetchGamesMock} onSave={onSave} />);
    await waitFor(() => screen.getByText('Tap Race'));

    // Default selection: games with enabled:true (tap-race, trivia-blitz)
    fireEvent.click(screen.getByText('Save Selection'));

    await waitFor(() => {
      expect(onSave).toHaveBeenCalledTimes(1);
    });
    const [payload] = onSave.mock.calls[0] as [CompSelectionPayload];
    expect(payload.enabledIds).toEqual(expect.arrayContaining(['tap-race', 'trivia-blitz']));
    expect(payload.weeklyLimit).toBeNull();
  });

  it('shows "Saved!" confirmation after a successful save', async () => {
    render(<CompSelection fetchGames={fetchGamesMock} onSave={onSave} />);
    await waitFor(() => screen.getByText('Tap Race'));

    fireEvent.click(screen.getByText('Save Selection'));

    await waitFor(() => {
      expect(screen.getByText(/saved/i)).toBeTruthy();
    });
  });
});
