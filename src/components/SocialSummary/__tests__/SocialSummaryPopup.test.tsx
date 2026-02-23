/**
 * Tests for the SocialSummaryPopup component and related store actions.
 *
 * Covers:
 *  1. uiSlice — openSocialSummary / closeSocialSummary actions.
 *  2. gameSlice — addSocialSummary persists a diary entry.
 *  3. SocialSummaryPopup renders summary text and week.
 *  4. Clicking close dispatches closeSocialSummary (diary persistence is handled
 *     by SocialEngine.endPhase() via SocialSummaryBridge, not the popup).
 *  5. SocialSummaryPopup returns null when no lastReport is present.
 */

import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import gameReducer, { addSocialSummary } from '../../../store/gameSlice';
import socialReducer, { setLastReport } from '../../../social/socialSlice';
import uiReducer, {
  openSocialSummary,
  closeSocialSummary,
  selectSocialSummaryOpen,
} from '../../../store/uiSlice';
import SocialSummaryPopup from '../SocialSummaryPopup';

// ── Helpers ────────────────────────────────────────────────────────────────

function makeStore() {
  return configureStore({
    reducer: {
      game: gameReducer,
      social: socialReducer,
      ui: uiReducer,
    },
  });
}

function renderPopup(store: ReturnType<typeof makeStore>) {
  return render(
    <Provider store={store}>
      <SocialSummaryPopup />
    </Provider>,
  );
}

// ── uiSlice ───────────────────────────────────────────────────────────────

describe('uiSlice – socialSummaryOpen', () => {
  it('starts closed (false)', () => {
    const store = makeStore();
    expect(selectSocialSummaryOpen(store.getState())).toBe(false);
  });

  it('openSocialSummary sets socialSummaryOpen to true', () => {
    const store = makeStore();
    store.dispatch(openSocialSummary());
    expect(selectSocialSummaryOpen(store.getState())).toBe(true);
  });

  it('closeSocialSummary sets socialSummaryOpen to false', () => {
    const store = makeStore();
    store.dispatch(openSocialSummary());
    store.dispatch(closeSocialSummary());
    expect(selectSocialSummaryOpen(store.getState())).toBe(false);
  });
});

// ── addSocialSummary ───────────────────────────────────────────────────────

describe('gameSlice – addSocialSummary', () => {
  it('adds a diary-type event to tvFeed', () => {
    const store = makeStore();
    store.dispatch(addSocialSummary({ summary: 'Everyone made nice.', week: 3 }));
    const { tvFeed } = store.getState().game;
    const diaryEvents = tvFeed.filter((e) => e.type === 'diary');
    expect(diaryEvents).toHaveLength(1);
  });

  it('diary event text includes the week and summary', () => {
    const store = makeStore();
    store.dispatch(addSocialSummary({ summary: 'Alliance formed.', week: 2 }));
    const { tvFeed } = store.getState().game;
    const entry = tvFeed.find((e) => e.type === 'diary');
    expect(entry?.text).toContain('Week 2');
    expect(entry?.text).toContain('Alliance formed.');
  });

  it('diary event has type "diary"', () => {
    const store = makeStore();
    store.dispatch(addSocialSummary({ summary: 'Drama this week.', week: 1 }));
    const { tvFeed } = store.getState().game;
    const entry = tvFeed.find((e) => e.text.includes('Drama this week.'));
    expect(entry?.type).toBe('diary');
  });
});

// ── SocialSummaryPopup ─────────────────────────────────────────────────────

describe('SocialSummaryPopup – rendering', () => {
  it('renders null when lastReport is null', () => {
    const store = makeStore();
    const { container } = renderPopup(store);
    expect(container.firstChild).toBeNull();
  });

  it('renders the summary text when lastReport is present', () => {
    const store = makeStore();
    store.dispatch(
      setLastReport({
        id: 'test-report-1',
        week: 4,
        summary: 'It was a quiet week in the house.',
        players: [],
        timestamp: Date.now(),
      }),
    );
    renderPopup(store);
    expect(screen.getByText('It was a quiet week in the house.')).toBeDefined();
  });

  it('renders the week number', () => {
    const store = makeStore();
    store.dispatch(
      setLastReport({
        id: 'test-report-2',
        week: 7,
        summary: 'Tensions rose.',
        players: [],
        timestamp: Date.now(),
      }),
    );
    renderPopup(store);
    expect(screen.getByText('Week 7')).toBeDefined();
  });

  it('renders the close button', () => {
    const store = makeStore();
    store.dispatch(
      setLastReport({
        id: 'rpt',
        week: 1,
        summary: 'All quiet.',
        players: [],
        timestamp: Date.now(),
      }),
    );
    renderPopup(store);
    expect(screen.getByRole('button')).toBeDefined();
  });
});

describe('SocialSummaryPopup – close behaviour', () => {
  it('dispatches closeSocialSummary when close button is clicked', () => {
    const store = makeStore();
    store.dispatch(openSocialSummary());
    store.dispatch(
      setLastReport({
        id: 'rpt-close',
        week: 2,
        summary: 'Votes were cast.',
        players: [],
        timestamp: Date.now(),
      }),
    );
    renderPopup(store);

    fireEvent.click(screen.getByRole('button'));

    expect(selectSocialSummaryOpen(store.getState())).toBe(false);
  });

  it('does not add a diary entry when closed (persistence is engine-side)', () => {
    const store = makeStore();
    store.dispatch(
      setLastReport({
        id: 'rpt-diary',
        week: 5,
        summary: 'Everyone campaigned hard.',
        players: [],
        timestamp: Date.now(),
      }),
    );
    renderPopup(store);

    fireEvent.click(screen.getByRole('button'));

    // The popup no longer dispatches addSocialSummary; diary persistence happens
    // automatically in SocialEngine.endPhase() via SocialSummaryBridge.
    const { tvFeed } = store.getState().game;
    const diaryEntry = tvFeed.find((e) => e.type === 'diary');
    expect(diaryEntry).toBeUndefined();
  });
});
