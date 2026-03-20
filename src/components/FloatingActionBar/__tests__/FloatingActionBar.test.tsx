/**
 * Tests for the FloatingActionBar component.
 *
 * Covers:
 *  1. Social button badge shows human player's energy value from energyBank.
 *  2. Badge is absent when there is no human player.
 *  3. Flash CSS class is added to the social button when energy changes.
 *  4. Flash CSS class is removed after the animation interval.
 *  5. ARIA label on social button includes energy value.
 *  6. Save button is present and disabled at game start (nothing to save yet).
 *  7. Save button is disabled in guest mode.
 *  8. Help button navigates to /rules.
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
import profilesReducer, { enterGuestMode } from '../../../store/profilesSlice';
import challengeReducer from '../../../store/challengeSlice';
import FloatingActionBar from '../FloatingActionBar';
import type { RootState } from '../../../store/store';

// ── Helpers ────────────────────────────────────────────────────────────────

function makeStore(hasHuman = true) {
  const base = configureStore({
    reducer: {
      game: gameReducer,
      social: socialReducer,
      profiles: profilesReducer,
      challenge: challengeReducer,
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
    },
    preloadedState: {
      game: { ...defaultState.game, players },
      social: defaultState.social,
      profiles: defaultState.profiles,
      challenge: defaultState.challenge,
    },
  });
}

function LocationDisplay() {
  const location = useLocation();
  return <div data-testid="location">{location.pathname}</div>;
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
    expect(screen.getByRole('button', { name: /inbox/i })).toBeDefined();
  });
});

describe('FloatingActionBar – save button', () => {
  it('save button is present and disabled at game start (nothing to save yet)', () => {
    const store = makeStore();
    // Pre-set an active profile so the "nothing to save yet" branch is reached
    // (an active profile is required for save to be contextually meaningful).
    const profileId = 'test-profile-1';
    store.dispatch({
      type: 'profiles/initProfiles',
      payload: {
        profiles: [{ id: profileId, name: 'Tester', avatar: '🧑', createdAt: new Date().toISOString() }],
        activeProfileId: profileId,
        isGuest: false,
      },
    });
    renderFAB(store);
    // At game start (week 1, phase 'week_start'), there's nothing to save yet.
    const saveBtn = screen.getByRole('button', { name: /nothing to save yet/i });
    expect(saveBtn).toBeDefined();
    expect((saveBtn as HTMLButtonElement).disabled).toBe(true);
  });

  it('save button is disabled in guest mode (no persistence)', () => {
    const store = makeStore();
    // Use the real action creator instead of a hard-coded action type string.
    act(() => { store.dispatch(enterGuestMode()); });
    renderFAB(store);
    const saveBtn = screen.getByRole('button', { name: /unavailable in guest mode/i });
    expect(saveBtn).toBeDefined();
    expect((saveBtn as HTMLButtonElement).disabled).toBe(true);
  });

  it('save button is disabled when no active profile is selected', () => {
    const store = makeStore();
    // Default state has no active profile — button should reflect that.
    renderFAB(store);
    const saveBtn = screen.getByRole('button', { name: /no active profile selected/i });
    expect(saveBtn).toBeDefined();
    expect((saveBtn as HTMLButtonElement).disabled).toBe(true);
  });

  it('no Diary Room navigation button is present', () => {
    const store = makeStore();
    renderFAB(store);
    // The DR button should no longer exist in the FAB
    const drBtn = screen.queryByRole('button', { name: /diary room/i });
    expect(drBtn).toBeNull();
  });
});

describe('FloatingActionBar – navigation buttons', () => {
  it('navigates to rules when the Help button is clicked', async () => {
    const store = makeStore();
    renderFAB(store, '/game');
    act(() => {
      screen.getByRole('button', { name: 'Help' }).click();
    });
    expect(screen.getByTestId('location').textContent).toBe('/rules');
  });
});
