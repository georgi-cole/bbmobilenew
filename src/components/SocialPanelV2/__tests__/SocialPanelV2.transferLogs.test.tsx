/**
 * Tests for SocialPanelV2 session log transfer on close.
 *
 * Covers:
 *  1. Closing the panel when sessionLogs exist dispatches one consolidated
 *     diary entry to game.tvFeed.
 *  2. The consolidated diary entry has type 'diary'.
 *  3. The consolidated entry text includes actor/target names and action outcome.
 *  4. social.sessionLogs are cleared after the panel is closed.
 *  5. No diary entry is added when sessionLogs is empty on close.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import gameReducer from '../../../store/gameSlice';
import socialReducer, { openSocialPanel, recordSocialAction } from '../../../social/socialSlice';
import { initManeuvers } from '../../../social/SocialManeuvers';
import SocialPanelV2 from '../SocialPanelV2';
import type { RootState } from '../../../store/store';

// ── Helpers ────────────────────────────────────────────────────────────────

function makeStore() {
  const base = configureStore({ reducer: { game: gameReducer, social: socialReducer } });
  const defaultState = base.getState() as RootState;
  const store = configureStore({
    reducer: { game: gameReducer, social: socialReducer },
    preloadedState: {
      game: { ...defaultState.game, phase: 'social_1' as RootState['game']['phase'] },
      social: defaultState.social,
    },
  });
  initManeuvers(store);
  return store;
}

function renderPanel(store: ReturnType<typeof makeStore>) {
  return render(
    <Provider store={store}>
      <SocialPanelV2 />
    </Provider>,
  );
}

// ── Tests ──────────────────────────────────────────────────────────────────

describe('SocialPanelV2 – session log transfer on close', () => {
  let store: ReturnType<typeof makeStore>;
  let humanId: string;
  let otherPlayerId: string;

  beforeEach(() => {
    store = makeStore();
    const players = store.getState().game.players;
    humanId = players.find((p) => p.isUser)!.id;
    otherPlayerId = players.find((p) => !p.isUser)!.id;
    store.dispatch(openSocialPanel());
  });

  it('adds one consolidated diary entry to tvFeed when sessionLogs exist on close', () => {
    store.dispatch(
      recordSocialAction({
        entry: {
          actionId: 'compliment',
          actorId: humanId,
          targetId: otherPlayerId,
          cost: 1,
          delta: 5,
          outcome: 'success',
          newEnergy: 4,
          timestamp: Date.now(),
        },
      }),
    );

    renderPanel(store);
    const diaryCountBefore = store.getState().game.tvFeed.filter((e) => e.type === 'diary').length;

    fireEvent.click(screen.getByRole('button', { name: 'Close social panel' }));

    const diaryCountAfter = store.getState().game.tvFeed.filter((e) => e.type === 'diary').length;
    // Exactly one consolidated entry should have been added.
    expect(diaryCountAfter).toBe(diaryCountBefore + 1);
  });

  it('consolidated diary entry has type "diary"', () => {
    store.dispatch(
      recordSocialAction({
        entry: {
          actionId: 'compliment',
          actorId: humanId,
          targetId: otherPlayerId,
          cost: 1,
          delta: 5,
          outcome: 'success',
          newEnergy: 4,
          timestamp: Date.now(),
        },
      }),
    );

    renderPanel(store);
    fireEvent.click(screen.getByRole('button', { name: 'Close social panel' }));

    const feed = store.getState().game.tvFeed;
    // addTvEvent prepends; newest entry is at index 0
    expect(feed[0].type).toBe('diary');
  });

  it('consolidated entry text includes actor → target and outcome', () => {
    store.dispatch(
      recordSocialAction({
        entry: {
          actionId: 'compliment',
          actorId: humanId,
          targetId: otherPlayerId,
          cost: 1,
          delta: 5,
          outcome: 'success',
          newEnergy: 4,
          timestamp: Date.now(),
        },
      }),
    );

    renderPanel(store);
    fireEvent.click(screen.getByRole('button', { name: 'Close social panel' }));

    // addTvEvent prepends; newest entry is at index 0
    const entry = store.getState().game.tvFeed[0];
    expect(entry.text).toContain('→');
    expect(entry.text).toContain('success');
    // Should mention week
    expect(entry.text).toContain('Week');
  });

  it('clears social.sessionLogs after close', () => {
    store.dispatch(
      recordSocialAction({
        entry: {
          actionId: 'compliment',
          actorId: humanId,
          targetId: otherPlayerId,
          cost: 1,
          delta: 5,
          outcome: 'success',
          newEnergy: 4,
          timestamp: Date.now(),
        },
      }),
    );

    renderPanel(store);
    expect(store.getState().social.sessionLogs.length).toBe(1);

    fireEvent.click(screen.getByRole('button', { name: 'Close social panel' }));

    expect(store.getState().social.sessionLogs.length).toBe(0);
  });

  it('does not add a diary entry when sessionLogs is empty on close', () => {
    renderPanel(store);
    const diaryCountBefore = store.getState().game.tvFeed.filter((e) => e.type === 'diary').length;

    fireEvent.click(screen.getByRole('button', { name: 'Close social panel' }));

    const diaryCountAfter = store.getState().game.tvFeed.filter((e) => e.type === 'diary').length;
    expect(diaryCountAfter).toBe(diaryCountBefore);
  });

  it('adds multiple action summaries in a single consolidated entry', () => {
    for (let i = 0; i < 3; i++) {
      store.dispatch(
        recordSocialAction({
          entry: {
            actionId: 'compliment',
            actorId: humanId,
            targetId: otherPlayerId,
            cost: 1,
            delta: 2,
            outcome: 'success',
            newEnergy: 4 - i,
            timestamp: Date.now() + i,
          },
        }),
      );
    }

    renderPanel(store);
    fireEvent.click(screen.getByRole('button', { name: 'Close social panel' }));

    const feed = store.getState().game.tvFeed;
    // addTvEvent prepends; newest entry is at index 0
    const newEntry = feed[0];
    expect(newEntry.type).toBe('diary');
    // The separator '|' should appear twice for 3 actions
    expect((newEntry.text.match(/\|/g) ?? []).length).toBe(2);
  });
});
