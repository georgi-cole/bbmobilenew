/**
 * Tests for SocialPanelV2 session log transfer on close.
 *
 * Covers:
 *  1. Closing the panel when sessionLogs exist dispatches exactly ONE concise diary
 *     summary entry to game.tvFeed (not one entry per action).
 *  2. The diary summary entry has type 'diary'.
 *  3. The diary summary entry text includes the week and outcome counts.
 *  4. social.sessionLogs are cleared after the panel is closed.
 *  5. No diary entry is added when sessionLogs is empty on close.
 *  6. Multiple session logs (3) still produce only ONE summary diary entry.
 *  7. A 'social' type TV event is dispatched on close when sessionLogs exist.
 *  8. The TV close message is one of the preset messages from TV_SOCIAL_CLOSE_MESSAGES.
 *  9. No 'social' type TV event is dispatched when sessionLogs is empty on close.
 * 10. AI-initiated logs (actorId !== humanId) are not written as diary entries.
 * 11. The summary diary entry has source: 'manual' and channels: ['dr'].
 * 12. The TV close message has channels that includes 'tv'.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import gameReducer from '../../../store/gameSlice';
import socialReducer, { openSocialPanel, recordSocialAction } from '../../../social/socialSlice';
import { initManeuvers } from '../../../social/SocialManeuvers';
import SocialPanelV2 from '../SocialPanelV2';
import { TV_SOCIAL_CLOSE_MESSAGES } from '../socialNarratives';
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

  it('adds exactly one summary diary entry to tvFeed when sessionLogs exist on close', () => {
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
    // Exactly one summary diary entry regardless of session log count.
    expect(diaryCountAfter).toBe(diaryCountBefore + 1);
  });

  it('diary entry has type "diary"', () => {
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
    const diaryEntry = feed.find((e) => e.type === 'diary');
    expect(diaryEntry).toBeDefined();
    expect(diaryEntry!.type).toBe('diary');
  });

  it('diary entry text includes week and outcome counts', () => {
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
    const diaryEntry = feed.find((e) => e.type === 'diary');
    expect(diaryEntry).toBeDefined();
    expect(diaryEntry!.text).toContain('Week');
    expect(diaryEntry!.text).toContain('success');
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

  it('multiple session logs produce exactly ONE summary diary entry', () => {
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
    const diaryCountBefore = store.getState().game.tvFeed.filter((e) => e.type === 'diary').length;

    fireEvent.click(screen.getByRole('button', { name: 'Close social panel' }));

    const diaryCountAfter = store.getState().game.tvFeed.filter((e) => e.type === 'diary').length;
    // 3 session logs → ONE summary diary entry (not 3 individual entries).
    expect(diaryCountAfter).toBe(diaryCountBefore + 1);
  });

  it('dispatches a social type TV event on close when sessionLogs exist', () => {
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
    const socialCountBefore = store.getState().game.tvFeed.filter((e) => e.type === 'social').length;

    fireEvent.click(screen.getByRole('button', { name: 'Close social panel' }));

    const socialCountAfter = store.getState().game.tvFeed.filter((e) => e.type === 'social').length;
    expect(socialCountAfter).toBe(socialCountBefore + 1);
  });

  it('TV close message text is one of the preset messages', () => {
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

    // The social message is the newest entry (index 0) since it is dispatched last.
    const socialEntry = store.getState().game.tvFeed.find((e) => e.type === 'social');
    expect(socialEntry).toBeDefined();
    expect(TV_SOCIAL_CLOSE_MESSAGES).toContain(socialEntry!.text);
  });

  it('does not dispatch a social type TV event when sessionLogs is empty on close', () => {
    renderPanel(store);
    const socialCountBefore = store.getState().game.tvFeed.filter((e) => e.type === 'social').length;

    fireEvent.click(screen.getByRole('button', { name: 'Close social panel' }));

    const socialCountAfter = store.getState().game.tvFeed.filter((e) => e.type === 'social').length;
    expect(socialCountAfter).toBe(socialCountBefore);
  });

  it('AI-initiated logs are not written as diary entries and do not trigger a social TV event', () => {
    const aiPlayer = store.getState().game.players.find((p) => !p.isUser && p.id !== otherPlayerId);
    expect(aiPlayer).toBeDefined();
    const aiPlayerId = aiPlayer!.id;
    // Record a log where an AI player is the actor (not the human)
    store.dispatch(
      recordSocialAction({
        entry: {
          actionId: 'compliment',
          actorId: aiPlayerId,
          targetId: otherPlayerId,
          cost: 1,
          delta: 3,
          outcome: 'success',
          newEnergy: 4,
          timestamp: Date.now(),
        },
      }),
    );

    renderPanel(store);
    const diaryCountBefore = store.getState().game.tvFeed.filter((e) => e.type === 'diary').length;
    const socialCountBefore = store.getState().game.tvFeed.filter((e) => e.type === 'social').length;

    fireEvent.click(screen.getByRole('button', { name: 'Close social panel' }));

    // No diary entry and no social TV message — the only actor is AI, not the human player.
    const diaryCountAfter = store.getState().game.tvFeed.filter((e) => e.type === 'diary').length;
    const socialCountAfter = store.getState().game.tvFeed.filter((e) => e.type === 'social').length;
    expect(diaryCountAfter).toBe(diaryCountBefore);
    expect(socialCountAfter).toBe(socialCountBefore);
  });

  it('summary diary entry has source "manual" and channels ["dr"]', () => {
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

    const diaryEntry = store.getState().game.tvFeed.find((e) => e.type === 'diary');
    expect(diaryEntry).toBeDefined();
    expect(diaryEntry!.source).toBe('manual');
    expect(diaryEntry!.channels).toContain('dr');
  });

  it('TV close message has channels that includes "tv"', () => {
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

    const socialEntry = store.getState().game.tvFeed.find((e) => e.type === 'social');
    expect(socialEntry).toBeDefined();
    expect(socialEntry!.channels).toContain('tv');
  });
});
