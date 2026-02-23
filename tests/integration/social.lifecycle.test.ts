/**
 * Social lifecycle integration smoke test.
 *
 * Validates the end-to-end flow:
 *  1. Dispatching setPhase('social_1') populates state.social.energyBank and
 *     starts the AI driver.
 *  2. After advancing fake timers the driver executes AI actions (ticks).
 *  3. Transitioning to a non-social phase ends the engine, sets
 *     state.social.lastReport, and persists a diary entry via
 *     game/addSocialSummary (state.game.tvFeed contains a 'diary' entry).
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { configureStore } from '@reduxjs/toolkit';
import gameReducer, { setPhase } from '../../src/store/gameSlice';
import socialReducer from '../../src/social/socialSlice';
import { socialMiddleware } from '../../src/social/socialMiddleware';
import { SocialEngine } from '../../src/social/SocialEngine';
import { socialAIDriver } from '../../src/social/socialAIDriver';
import { socialConfig } from '../../src/social/socialConfig';

// ── Helpers ────────────────────────────────────────────────────────────────

function makeStore() {
  return configureStore({
    reducer: {
      game: gameReducer,
      social: socialReducer,
    },
    middleware: (getDefaultMiddleware) => getDefaultMiddleware().concat(socialMiddleware),
  });
}

// ── Tests ──────────────────────────────────────────────────────────────────

describe('Social lifecycle – full end-to-end smoke test', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    socialAIDriver.stop();
    vi.useRealTimers();
  });

  it('engineReady: energyBank is populated when entering social_1', () => {
    const store = makeStore();
    SocialEngine.init(store);

    store.dispatch(setPhase('social_1'));

    const { energyBank } = store.getState().social;
    expect(Object.keys(energyBank).length).toBeGreaterThan(0);
    for (const value of Object.values(energyBank)) {
      expect(value).toBeGreaterThan(0);
    }
  });

  it('AI driver starts when entering social_1', () => {
    const store = makeStore();
    SocialEngine.init(store);

    store.dispatch(setPhase('social_1'));

    expect(socialAIDriver.getStatus().running).toBe(true);
  });

  it('AI driver ticks after fake timer advance', () => {
    const store = makeStore();
    SocialEngine.init(store);

    store.dispatch(setPhase('social_1'));
    expect(socialAIDriver.getStatus().tickCount).toBe(0);

    // Advance timers by one tick interval
    vi.advanceTimersByTime(socialConfig.tickIntervalMs);

    expect(socialAIDriver.getStatus().tickCount).toBeGreaterThan(0);
  });

  it('lastReport is populated when leaving a social phase', () => {
    const store = makeStore();
    SocialEngine.init(store);

    store.dispatch(setPhase('social_1'));
    store.dispatch(setPhase('nominations'));

    const { lastReport } = store.getState().social;
    expect(lastReport).not.toBeNull();
    expect(lastReport?.id).toMatch(/^social_1_/);
    expect(typeof lastReport?.summary).toBe('string');
  });

  it('diary entry is added to tvFeed when leaving a social phase', () => {
    const store = makeStore();
    SocialEngine.init(store);

    store.dispatch(setPhase('social_1'));
    store.dispatch(setPhase('nominations'));

    const { tvFeed } = store.getState().game;
    const diaryEntries = tvFeed.filter((e) => e.type === 'diary');
    expect(diaryEntries.length).toBeGreaterThan(0);
    expect(diaryEntries[0].text).toContain('Social Summary');
  });

  it('AI driver stops when leaving a social phase', () => {
    const store = makeStore();
    SocialEngine.init(store);

    store.dispatch(setPhase('social_1'));
    expect(socialAIDriver.getStatus().running).toBe(true);

    store.dispatch(setPhase('nominations'));
    expect(socialAIDriver.getStatus().running).toBe(false);
  });

  it('no extra game/eviction TV events are added by the summary logic', () => {
    const store = makeStore();
    SocialEngine.init(store);

    const tvFeedBefore = store.getState().game.tvFeed;
    const nonDiaryCountBefore = tvFeedBefore.filter((e) => e.type !== 'diary').length;

    store.dispatch(setPhase('social_1'));
    store.dispatch(setPhase('nominations'));

    const tvFeedAfter = store.getState().game.tvFeed;
    const nonDiaryCountAfter = tvFeedAfter.filter((e) => e.type !== 'diary').length;

    // The summary bridge must not add any non-diary events.
    expect(nonDiaryCountAfter).toBe(nonDiaryCountBefore);
  });
});
