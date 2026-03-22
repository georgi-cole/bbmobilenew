/**
 * Tests for the FloatingActionBar component.
 *
 * Covers:
 *  1. Social button badge shows human player's energy value from energyBank.
 *  2. Badge is absent when there is no human player.
 *  3. Flash CSS class is added to the social button when energy changes.
 *  4. Flash CSS class is removed after the animation interval.
 *  5. ARIA label on social button includes energy value.
 *  6. FAB button order reflects the redesigned layout.
 *  7. Social actions badge remains visible on the inbox-style button.
 *  8. Public Meter and Diary Room buttons navigate to their routes.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import { MemoryRouter, useLocation } from 'react-router-dom';
import gameReducer from '../../../store/gameSlice';
import socialReducer, {
  setEnergyBankEntry,
  applyEnergyDelta,
  pushIncomingInteraction,
} from '../../../social/socialSlice';
import profilesReducer from '../../../store/profilesSlice';
import challengeReducer from '../../../store/challengeSlice';
import publicOpinionReducer, { addDirection } from '../../../publicOpinion/publicOpinionSlice';
import FloatingActionBar from '../FloatingActionBar';
import type { RootState } from '../../../store/store';
import type { PublicDirection } from '../../../publicOpinion/types';

// ── Helpers ────────────────────────────────────────────────────────────────

function makeStore(hasHuman = true) {
  const base = configureStore({
    reducer: {
      game: gameReducer,
      social: socialReducer,
      profiles: profilesReducer,
      challenge: challengeReducer,
      publicOpinion: publicOpinionReducer,
    },
  });
  const defaultState = base.getState() as RootState;
  const players = hasHuman
    ? defaultState.game.players
    : defaultState.game.players.map((p) => ({ ...p, isUser: false }));

  return configureStore({
    reducer: {
      game: gameReducer,
      social: socialReducer,
      profiles: profilesReducer,
      challenge: challengeReducer,
      publicOpinion: publicOpinionReducer,
    },
    preloadedState: {
      game: { ...defaultState.game, players },
      social: defaultState.social,
      profiles: defaultState.profiles,
      challenge: defaultState.challenge,
      publicOpinion: defaultState.publicOpinion,
    },
  });
}

function makeDirection(playerId: string, overrides: Partial<PublicDirection> = {}): PublicDirection {
  return {
    id: `dir-${playerId}`,
    type: 'win_competition',
    playerId,
    description: 'Win the next competition!',
    status: 'active',
    createdWeek: 1,
    expiresAtWeek: 2,
    approvalDelta: 5,
    ...overrides,
  };
}

function LocationDisplay() {
  const location = useLocation();
  return <div data-testid="location">{`${location.pathname}${location.search}`}</div>;
}

function renderFAB(store: ReturnType<typeof makeStore>, initialEntry = '/game') {
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <Provider store={store}>
        <FloatingActionBar />
        <LocationDisplay />
      </Provider>
    </MemoryRouter>,
  );
}

// ── Tests ──────────────────────────────────────────────────────────────────

describe('FloatingActionBar – social energy badge', () => {
  it('shows a badge with the human player energy value', () => {
    const store = makeStore();
    const humanId = store.getState().game.players.find((p) => p.isUser)!.id;
    act(() => { store.dispatch(setEnergyBankEntry({ playerId: humanId, value: 8 })); });
    renderFAB(store);
    // Badge text should reflect energy value
    expect(screen.getByText('8')).toBeDefined();
  });

  it('shows 0 badge when human energy is 0', () => {
    const store = makeStore();
    renderFAB(store);
    // Default energy is 0 — badge should still show 0
    expect(screen.getByText('0')).toBeDefined();
  });

  it('shows 99+ badge when energy exceeds 99', () => {
    const store = makeStore();
    const humanId = store.getState().game.players.find((p) => p.isUser)!.id;
    act(() => { store.dispatch(setEnergyBankEntry({ playerId: humanId, value: 150 })); });
    renderFAB(store);
    expect(screen.getByText('99+')).toBeDefined();
  });

  it('ARIA label on social button includes energy value', () => {
    const store = makeStore();
    const humanId = store.getState().game.players.find((p) => p.isUser)!.id;
    act(() => { store.dispatch(setEnergyBankEntry({ playerId: humanId, value: 5 })); });
    renderFAB(store);
    expect(screen.getByRole('button', { name: /energy: 5/i })).toBeDefined();
  });
});

describe('FloatingActionBar – social button flash animation', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it('adds flash class to social button when energy changes', () => {
    const store = makeStore();
    const humanId = store.getState().game.players.find((p) => p.isUser)!.id;
    renderFAB(store);

    // Change energy — should trigger flash (deferred via setTimeout(0))
    act(() => {
      store.dispatch(setEnergyBankEntry({ playerId: humanId, value: 10 }));
    });
    act(() => { vi.advanceTimersByTime(0); });

    const btn = screen.getByRole('button', { name: /energy: 10/i });
    expect(btn.className).toContain('fab__side-btn--flash');
  });

  it('removes flash class after 600ms', () => {
    const store = makeStore();
    const humanId = store.getState().game.players.find((p) => p.isUser)!.id;
    renderFAB(store);

    act(() => {
      store.dispatch(setEnergyBankEntry({ playerId: humanId, value: 10 }));
    });

    act(() => { vi.advanceTimersByTime(600); });

    const btn = screen.getByRole('button', { name: /energy: 10/i });
    expect(btn.className).not.toContain('fab__side-btn--flash');
  });

  it('adds flash class when energy changes via applyEnergyDelta', () => {
    const store = makeStore();
    const humanId = store.getState().game.players.find((p) => p.isUser)!.id;
    act(() => { store.dispatch(setEnergyBankEntry({ playerId: humanId, value: 5 })); });
    act(() => { vi.advanceTimersByTime(0); }); // flush deferred flash-on from initial change
    renderFAB(store);

    act(() => {
      store.dispatch(applyEnergyDelta({ playerId: humanId, delta: -2 }));
    });
    act(() => { vi.advanceTimersByTime(0); });

    const btn = screen.getByRole('button', { name: /energy: 3/i });
    expect(btn.className).toContain('fab__side-btn--flash');
  });
});

describe('FloatingActionBar – inbox badge', () => {
  it('shows pending incoming interaction count on the inbox button', () => {
    const store = makeStore();
    act(() => {
      store.dispatch(
        pushIncomingInteraction({
          id: 'incoming-1',
          fromId: 'p2',
          type: 'compliment',
          text: 'Great move.',
          createdAt: 10,
          createdWeek: 1,
          expiresAtWeek: 1,
          read: false,
          requiresResponse: true,
          resolved: false,
        }),
      );
    });
    renderFAB(store);
    expect(screen.getByText('1')).toBeDefined();
    expect(screen.getByRole('button', { name: /social actions/i })).toBeDefined();
  });
});

describe('FloatingActionBar – layout', () => {
  it('renders the redesigned button order', () => {
    const store = makeStore();
    renderFAB(store);

    const toolbar = screen.getByRole('toolbar', { name: /game actions/i });
    const labels = Array.from(toolbar.querySelectorAll('button')).map((button) => button.getAttribute('aria-label'));
    expect(labels).toEqual([
      'Social (energy: 0)',
      'Social actions',
      'Advance to next phase',
      'Public meter',
      'Diary Room',
    ]);
  });

  it('no save button is present in the FAB', () => {
    const store = makeStore();
    renderFAB(store);
    expect(screen.queryByRole('button', { name: /save/i })).toBeNull();
  });
});

describe('FloatingActionBar – navigation buttons', () => {
  it('navigates to public meter when the Public meter button is clicked', async () => {
    const store = makeStore();
    renderFAB(store, '/game');
    act(() => {
      screen.getByRole('button', { name: 'Public meter' }).click();
    });
    expect(screen.getByTestId('location').textContent).toBe('/public-meter');
  });

  it('shows an active public request badge and opens requests tab when the user has active requests', async () => {
    const store = makeStore();
    const humanId = store.getState().game.players.find((p) => p.isUser)!.id;
    act(() => {
      store.dispatch(addDirection(makeDirection(humanId)));
      store.dispatch(addDirection(makeDirection(humanId, { id: 'dir-2' })));
    });
    renderFAB(store, '/game');

    expect(screen.queryByText('2')).not.toBeNull();
    act(() => {
      screen.getByRole('button', { name: /public meter \(2 active requests\)/i }).click();
    });
    expect(screen.getByTestId('location').textContent).toBe('/public-meter?tab=requests');
  });

  it('navigates to diary room when the Diary Room button is clicked', async () => {
    const store = makeStore();
    renderFAB(store, '/game');
    act(() => {
      screen.getByRole('button', { name: 'Diary Room' }).click();
    });
    expect(screen.getByTestId('location').textContent).toBe('/diary-room');
  });
});
