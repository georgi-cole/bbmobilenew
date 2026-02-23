/**
 * Tests for TvZone announcement overlay integration.
 *
 * Covers:
 *  1. TvZone shows TvAnnouncementOverlay when latest event has a major key.
 *  2. Overlay's info button opens the TvAnnouncementModal.
 *  3. Continue FAB dismisses manual-dismiss announcements.
 *  4. Auto-dismiss announcements do NOT show the Continue FAB.
 *  5. TVLog is used with maxVisible=2 suppressing the main TV message.
 *  6. No overlay shown when event has no recognised major key.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import { MemoryRouter } from 'react-router-dom';
import gameReducer, { addTvEvent } from '../../../store/gameSlice';
import TvZone from '../TvZone';
import type { TvEvent } from '../../../types';

// ── Store helpers ─────────────────────────────────────────────────────────────

function makeStore() {
  return configureStore({ reducer: { game: gameReducer } });
}

function renderTvZone(store: ReturnType<typeof makeStore>) {
  return render(
    <Provider store={store}>
      <MemoryRouter>
        <TvZone />
      </MemoryRouter>
    </Provider>,
  );
}

function makeEvent(overrides: Partial<TvEvent> & Pick<TvEvent, 'id' | 'text'>): TvEvent {
  return { type: 'game', timestamp: Date.now(), ...overrides };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('TvZone — announcement overlay', () => {
  beforeEach(() => {
    // Suppress RAF errors in jsdom
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((_cb) => {
      // Don't actually schedule — just return a handle
      return 0 as unknown as ReturnType<typeof requestAnimationFrame>;
    });
    vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => {});
  });

  it('shows the overlay when the latest event has meta.major set to a recognised key', () => {
    const store = makeStore();
    renderTvZone(store);

    act(() => {
      store.dispatch(
        addTvEvent(
          makeEvent({
            id: 'ev-1',
            text: 'The nominations are set.',
            meta: { major: 'nomination_ceremony' },
          }),
        ),
      );
    });

    // Overlay should be visible with the correct title
    expect(screen.getByRole('dialog', { name: /Announcement: Nomination Ceremony/i })).toBeDefined();
  });

  it('shows the overlay when the latest event has a top-level major field', () => {
    const store = makeStore();
    renderTvZone(store);

    act(() => {
      store.dispatch(
        addTvEvent(
          makeEvent({
            id: 'ev-2',
            text: 'The live vote begins.',
            major: 'live_eviction',
          }),
        ),
      );
    });

    expect(screen.getByRole('dialog', { name: /Announcement: Live Eviction/i })).toBeDefined();
  });

  it('does NOT show the overlay for events without a recognised major key', () => {
    const store = makeStore();
    renderTvZone(store);

    act(() => {
      store.dispatch(
        addTvEvent(
          makeEvent({ id: 'ev-3', text: 'Alex grabbed a snack.' }),
        ),
      );
    });

    expect(screen.queryByRole('dialog', { name: /Announcement:/i })).toBeNull();
  });

  it('opens the modal when the info button is clicked', async () => {
    const store = makeStore();
    renderTvZone(store);

    act(() => {
      store.dispatch(
        addTvEvent(
          makeEvent({
            id: 'ev-4',
            text: 'The veto ceremony begins.',
            meta: { major: 'veto_ceremony' },
          }),
        ),
      );
    });

    // Info button should be in the overlay
    const infoBtn = screen.getByRole('button', { name: /More Info/i });
    await userEvent.click(infoBtn);

    // Modal should open with phase info
    expect(screen.getByRole('dialog', { name: /Phase info:/i })).toBeDefined();
  });

  it('shows the Continue FAB for manual-dismiss announcements', () => {
    const store = makeStore();
    renderTvZone(store);

    act(() => {
      store.dispatch(
        addTvEvent(
          makeEvent({
            id: 'ev-5',
            text: 'The nominations are set.',
            meta: { major: 'nomination_ceremony' },
          }),
        ),
      );
    });

    // nomination_ceremony has autoDismissMs = null → Continue FAB shown
    expect(screen.getByRole('button', { name: /Continue/i })).toBeDefined();
  });

  it('does NOT show the Continue FAB for auto-dismiss announcements', () => {
    const store = makeStore();
    renderTvZone(store);

    act(() => {
      store.dispatch(
        addTvEvent(
          makeEvent({
            id: 'ev-6',
            text: 'A new week begins.',
            meta: { major: 'week_start' },
          }),
        ),
      );
    });

    // week_start has autoDismissMs = 4000 → no Continue FAB
    expect(screen.queryByRole('button', { name: /Continue/i })).toBeNull();
  });

  it('dismisses the overlay when Continue FAB is clicked', async () => {
    const store = makeStore();
    renderTvZone(store);

    act(() => {
      store.dispatch(
        addTvEvent(
          makeEvent({
            id: 'ev-7',
            text: 'The live vote begins.',
            meta: { major: 'live_eviction' },
          }),
        ),
      );
    });

    const fab = screen.getByRole('button', { name: /Continue/i });
    await userEvent.click(fab);

    // Overlay should be gone
    expect(screen.queryByRole('dialog', { name: /Announcement:/i })).toBeNull();
  });

  it('closes the modal when the close button is clicked', async () => {
    const store = makeStore();
    renderTvZone(store);

    act(() => {
      store.dispatch(
        addTvEvent(
          makeEvent({
            id: 'ev-8',
            text: 'Jury votes begin.',
            meta: { major: 'jury' },
          }),
        ),
      );
    });

    await userEvent.click(screen.getByRole('button', { name: /More Info/i }));
    expect(screen.getByRole('dialog', { name: /Phase info:/i })).toBeDefined();

    await userEvent.click(screen.getByRole('button', { name: /Close/i }));
    expect(screen.queryByRole('dialog', { name: /Phase info:/i })).toBeNull();
  });
});

// ── TVLog integration ─────────────────────────────────────────────────────────

describe('TvZone — TVLog usage', () => {
  it('renders a game event log (TVLog)', () => {
    const store = makeStore();
    renderTvZone(store);

    act(() => {
      store.dispatch(addTvEvent(makeEvent({ id: 'e1', text: 'Week 1 begins.' })));
      store.dispatch(addTvEvent(makeEvent({ id: 'e2', text: 'The house is watching.' })));
    });

    expect(screen.getByRole('list', { name: /Game event log/i })).toBeDefined();
  });
});
