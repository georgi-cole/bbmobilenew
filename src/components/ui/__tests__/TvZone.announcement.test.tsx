/**
 * Tests for TvZone announcement overlay integration.
 *
 * Covers:
 *  1. TvZone shows TvAnnouncementOverlay when latest event has a major key.
 *  2. Overlay's info button opens the TvAnnouncementModal.
 *  3. 'tv:announcement-dismiss' event dismisses active announcements.
 *  4. Auto-dismiss announcements do NOT show a Continue FAB.
 *  5. TVLog is used with maxVisible=2 suppressing the main TV message.
 *  6. No overlay shown when event has no recognised major key.
 *  7. Stale overlay is cleared when a new non-major event arrives.
 *  8. Modal stays open after overlay dismisses (independent key tracking).
 *  9. Auto-dismiss onDismiss fires at completion; no visible progress bar.
 * 10. Countdown pauses on hover/focus and resumes on leave/blur.
 * 11. Phase-based triggers: overlay shown on phase transition to popup phases.
 * 12. Phase-based non-triggers: week_start, hoh_comp, pov_comp show no overlay.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import { MemoryRouter } from 'react-router-dom';
import gameReducer, { addTvEvent, setPhase, updatePlayer } from '../../../store/gameSlice';
import TvZone from '../TvZone';
import TvAnnouncementOverlay from '../TvAnnouncementOverlay/TvAnnouncementOverlay';
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
    // Suppress RAF scheduling in jsdom so auto-dismiss timers don't fire
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((_cb) => {
      return 0 as unknown as ReturnType<typeof requestAnimationFrame>;
    });
    vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
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

  it('clears the overlay when a new non-major event arrives after a major event', () => {
    const store = makeStore();
    renderTvZone(store);

    // First: major event shows overlay
    act(() => {
      store.dispatch(
        addTvEvent(makeEvent({ id: 'ev-a', text: 'Noms set.', meta: { major: 'nomination_ceremony' } })),
      );
    });
    expect(screen.getByRole('dialog', { name: /Announcement:/i })).toBeDefined();

    // Then: non-major event clears overlay
    act(() => {
      store.dispatch(addTvEvent(makeEvent({ id: 'ev-b', text: 'Everyone eats pizza.' })));
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

  it('modal stays open after overlay is dismissed via tv:announcement-dismiss event', async () => {
    const store = makeStore();
    renderTvZone(store);

    act(() => {
      store.dispatch(
        addTvEvent(
          makeEvent({ id: 'ev-modal-persist', text: 'Jury votes.', meta: { major: 'jury' } }),
        ),
      );
    });

    // Open modal first
    await userEvent.click(screen.getByRole('button', { name: /More Info/i }));
    expect(screen.getByRole('dialog', { name: /Phase info:/i })).toBeDefined();

    // Dismiss overlay via central FAB event
    act(() => {
      window.dispatchEvent(new CustomEvent('tv:announcement-dismiss'));
    });

    // Overlay gone, but modal is still open
    expect(screen.queryByRole('dialog', { name: /Announcement:/i })).toBeNull();
    expect(screen.getByRole('dialog', { name: /Phase info:/i })).toBeDefined();
  });

  it('does NOT show a Continue FAB for any announcement (per-card FAB removed)', () => {
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

    // Per-card Continue FAB has been removed — rely on central Play/Continue FAB
    expect(screen.queryByRole('button', { name: /Continue/i })).toBeNull();
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

    // week_start has autoDismissMs = 4500 → no Continue FAB
    expect(screen.queryByRole('button', { name: /Continue/i })).toBeNull();
  });

  it('dismisses the overlay when tv:announcement-dismiss event is dispatched', () => {
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

    expect(screen.getByRole('dialog', { name: /Announcement:/i })).toBeDefined();

    act(() => {
      window.dispatchEvent(new CustomEvent('tv:announcement-dismiss'));
    });

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
  afterEach(() => {
    vi.restoreAllMocks();
  });

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

// ── TvAnnouncementOverlay countdown unit tests ─────────────────────────────────

describe('TvAnnouncementOverlay — countdown logic', () => {
  let rafCallback: FrameRequestCallback | null = null;
  let rafHandleCounter = 0;

  beforeEach(() => {
    rafCallback = null;
    rafHandleCounter = 0;
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => {
      rafCallback = cb;
      return ++rafHandleCounter;
    });
    vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => {
      rafCallback = null;
    });
    vi.spyOn(window.performance, 'now').mockReturnValue(0);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  function advanceTime(ms: number) {
    vi.spyOn(window.performance, 'now').mockReturnValue(ms);
    const cb = rafCallback;
    if (cb) {
      act(() => { cb(ms); });
    }
  }

  it('auto-dismiss timer fires onDismiss when countdown reaches zero (no visible progress bar)', () => {
    const onDismiss = vi.fn();
    const { getByRole } = render(
      <TvAnnouncementOverlay
        announcement={{ key: 'week_start', title: 'New Week', subtitle: '', isLive: false, autoDismissMs: 4500 }}
        onInfo={() => {}}
        onDismiss={onDismiss}
      />,
    );

    const overlay = getByRole('dialog');
    expect(overlay).toBeDefined();

    // Progress bar has been removed — no visible fill element
    expect(overlay.querySelector('.tv-announcement__progress-fill')).toBeNull();

    // Advance half-way through — onDismiss should not have fired yet
    advanceTime(2250);
    expect(onDismiss).not.toHaveBeenCalled();
  });

  it('calls onDismiss when the countdown reaches zero', () => {
    const onDismiss = vi.fn();
    render(
      <TvAnnouncementOverlay
        announcement={{ key: 'week_start', title: 'New Week', subtitle: '', isLive: false, autoDismissMs: 4500 }}
        onInfo={() => {}}
        onDismiss={onDismiss}
      />,
    );

    // Advance past the full duration
    advanceTime(4501);
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it('cancels RAF on mouse enter and restarts on mouse leave', () => {
    const onDismiss = vi.fn();
    const { getByRole } = render(
      <TvAnnouncementOverlay
        announcement={{ key: 'week_start', title: 'New Week', subtitle: '', isLive: false, autoDismissMs: 4500 }}
        onInfo={() => {}}
        onDismiss={onDismiss}
      />,
    );

    const overlay = getByRole('dialog');

    // Mouse enter should cancel RAF
    act(() => { fireEvent.mouseEnter(overlay); });
    expect(window.cancelAnimationFrame).toHaveBeenCalled();

    const cancelCallsBefore = (window.cancelAnimationFrame as ReturnType<typeof vi.fn>).mock.calls.length;
    const requestCallsBefore = (window.requestAnimationFrame as ReturnType<typeof vi.fn>).mock.calls.length;

    // Mouse leave should restart RAF
    act(() => { fireEvent.mouseLeave(overlay); });
    expect((window.requestAnimationFrame as ReturnType<typeof vi.fn>).mock.calls.length).toBeGreaterThan(requestCallsBefore);
    expect((window.cancelAnimationFrame as ReturnType<typeof vi.fn>).mock.calls.length).toBe(cancelCallsBefore); // no extra cancels
  });

  it('does NOT restart RAF on mouse leave when paused prop is true', () => {
    const onDismiss = vi.fn();
    const { getByRole } = render(
      <TvAnnouncementOverlay
        announcement={{ key: 'week_start', title: 'New Week', subtitle: '', isLive: false, autoDismissMs: 4500 }}
        onInfo={() => {}}
        onDismiss={onDismiss}
        paused={true}
      />,
    );

    const overlay = getByRole('dialog');
    const requestCallsBefore = (window.requestAnimationFrame as ReturnType<typeof vi.fn>).mock.calls.length;

    // Mouse leave should NOT restart because paused=true
    act(() => { fireEvent.mouseLeave(overlay); });
    expect((window.requestAnimationFrame as ReturnType<typeof vi.fn>).mock.calls.length).toBe(requestCallsBefore);
  });
});

// ── Phase-based announcement trigger tests ────────────────────────────────────

describe('TvZone — phase-based announcement triggers', () => {
  beforeEach(() => {
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((_cb) => {
      return 0 as unknown as ReturnType<typeof requestAnimationFrame>;
    });
    vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('shows Nomination Ceremony overlay when phase transitions to nominations', () => {
    const store = makeStore();
    renderTvZone(store);

    act(() => { store.dispatch(setPhase('nominations')); });

    expect(screen.getByRole('dialog', { name: /Announcement: Nomination Ceremony/i })).toBeDefined();
  });

  it('shows Veto Ceremony overlay when phase transitions to pov_ceremony (non-final-4)', () => {
    const store = makeStore();
    renderTvZone(store);

    // Default state has 12 alive players (GAME_ROSTER_SIZE); pov_ceremony → veto_ceremony
    act(() => { store.dispatch(setPhase('pov_ceremony')); });

    expect(screen.getByRole('dialog', { name: /Announcement: Veto Ceremony/i })).toBeDefined();
  });

  it('shows Final 4 — Veto Ceremony overlay when phase transitions to pov_ceremony with exactly 4 alive players', () => {
    const store = makeStore();

    // Evict players until only 4 remain
    const state = store.getState().game;
    const toEvict = state.players.filter((p) => p.status !== 'evicted').slice(4);
    act(() => {
      toEvict.forEach((p) => store.dispatch(updatePlayer({ ...p, status: 'evicted' })));
    });

    renderTvZone(store);

    act(() => { store.dispatch(setPhase('pov_ceremony')); });

    expect(screen.getByRole('dialog', { name: /Announcement: Final 4/i })).toBeDefined();
  });

  it('shows Live Eviction overlay when phase transitions to live_vote', () => {
    const store = makeStore();
    renderTvZone(store);

    act(() => { store.dispatch(setPhase('live_vote')); });

    expect(screen.getByRole('dialog', { name: /Announcement: Live Eviction/i })).toBeDefined();
  });

  it('shows Final 3 overlay when phase transitions to final3 with exactly 3 alive players', () => {
    const store = makeStore();

    // Evict players until only 3 remain
    const state = store.getState().game;
    const toEvict = state.players.filter((p) => p.status !== 'evicted').slice(3);
    act(() => {
      toEvict.forEach((p) => store.dispatch(updatePlayer({ ...p, status: 'evicted' })));
    });

    renderTvZone(store);

    act(() => { store.dispatch(setPhase('final3')); });

    expect(screen.getByRole('dialog', { name: /Announcement: Final 3/i })).toBeDefined();
  });

  it('shows Final HOH Decision overlay when phase transitions to final3_decision', () => {
    const store = makeStore();
    renderTvZone(store);

    act(() => { store.dispatch(setPhase('final3_decision')); });

    expect(screen.getByRole('dialog', { name: /Announcement: Final HOH Decision/i })).toBeDefined();
  });

  it('shows Jury Votes overlay when phase transitions to jury', () => {
    const store = makeStore();
    renderTvZone(store);

    act(() => { store.dispatch(setPhase('jury')); });

    expect(screen.getByRole('dialog', { name: /Announcement: Jury Votes/i })).toBeDefined();
  });

  it('does NOT show any overlay when phase transitions to week_start', () => {
    const store = makeStore();
    renderTvZone(store);

    // Move away from default week_start first, then come back
    act(() => { store.dispatch(setPhase('nominations')); });
    // Verify nomination overlay appeared before dismissing
    expect(screen.getByRole('dialog', { name: /Announcement: Nomination Ceremony/i })).toBeDefined();
    // Dismiss the nomination overlay
    act(() => { window.dispatchEvent(new CustomEvent('tv:announcement-dismiss')); });
    act(() => { store.dispatch(setPhase('week_start')); });

    expect(screen.queryByRole('dialog', { name: /Announcement:/i })).toBeNull();
  });

  it('does NOT show any overlay when phase transitions to hoh_comp', () => {
    const store = makeStore();
    renderTvZone(store);

    act(() => { store.dispatch(setPhase('hoh_comp')); });

    expect(screen.queryByRole('dialog', { name: /Announcement:/i })).toBeNull();
  });

  it('does NOT show any overlay when phase transitions to pov_comp', () => {
    const store = makeStore();
    renderTvZone(store);

    act(() => { store.dispatch(setPhase('pov_comp')); });

    expect(screen.queryByRole('dialog', { name: /Announcement:/i })).toBeNull();
  });

  it('does NOT show any overlay when phase transitions to final3_comp1', () => {
    const store = makeStore();
    renderTvZone(store);

    act(() => { store.dispatch(setPhase('final3_comp1')); });

    expect(screen.queryByRole('dialog', { name: /Announcement:/i })).toBeNull();
  });

  it('does NOT show an overlay on initial mount (no phase transition)', () => {
    // week_start is the default phase — no transition occurs on mount
    const store = makeStore();
    renderTvZone(store);

    expect(screen.queryByRole('dialog', { name: /Announcement:/i })).toBeNull();
  });

  it('does NOT repeat the phase overlay after it has been dismissed (same phase)', () => {
    const store = makeStore();
    renderTvZone(store);

    act(() => { store.dispatch(setPhase('nominations')); });
    expect(screen.getByRole('dialog', { name: /Announcement:/i })).toBeDefined();

    // Dismiss the overlay
    act(() => { window.dispatchEvent(new CustomEvent('tv:announcement-dismiss')); });
    expect(screen.queryByRole('dialog', { name: /Announcement:/i })).toBeNull();

    // Dispatching more events while still in 'nominations' must not re-show the overlay
    act(() => {
      store.dispatch(addTvEvent(makeEvent({ id: 'ev-extra', text: 'Houseguests deliberate.' })));
    });
    expect(screen.queryByRole('dialog', { name: /Announcement:/i })).toBeNull();
  });
});
