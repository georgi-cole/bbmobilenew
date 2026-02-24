/**
 * Smoke tests: FEATURE_SOCIAL_V2 flag gates old SocialPanel rendering.
 *
 * Strategy: stub VITE_FEATURE_SOCIAL_V2 via vi.stubEnv, reset the module
 * registry so featureFlags re-evaluates, then dynamically import the flag and
 * render a conditional that mirrors GameScreen's logic.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import gameReducer from '../../../store/gameSlice';
import socialReducer, { setEnergyBankEntry } from '../../../social/socialSlice';
import { initManeuvers } from '../../../social/SocialManeuvers';

// ── Helpers ────────────────────────────────────────────────────────────────

function makeStore() {
  const store = configureStore({
    reducer: { game: gameReducer, social: socialReducer },
  });
  initManeuvers(store);
  store.dispatch(setEnergyBankEntry({ playerId: 'user', value: 5 }));
  return store;
}

// ── Tests ──────────────────────────────────────────────────────────────────

describe('FEATURE_SOCIAL_V2 feature flag – SocialPanel visibility', () => {
  let store: ReturnType<typeof makeStore>;

  beforeEach(() => {
    store = makeStore();
  });

  afterEach(() => {
    vi.resetModules();
    vi.unstubAllEnvs();
  });

  it('hides the old SocialPanel when FEATURE_SOCIAL_V2 is enabled (true)', async () => {
    vi.stubEnv('VITE_FEATURE_SOCIAL_V2', 'true');
    const { FEATURE_SOCIAL_V2 } = await import('../../../config/featureFlags');
    const { default: SocialPanel } = await import('../SocialPanel');
    render(
      <Provider store={store}>
        {!FEATURE_SOCIAL_V2 && <SocialPanel actorId="user" />}
      </Provider>,
    );
    expect(screen.queryByText(/Social Actions/)).toBeNull();
  });

  it('renders the old SocialPanel when FEATURE_SOCIAL_V2 is disabled (false)', async () => {
    vi.stubEnv('VITE_FEATURE_SOCIAL_V2', 'false');
    const { FEATURE_SOCIAL_V2 } = await import('../../../config/featureFlags');
    const { default: SocialPanel } = await import('../SocialPanel');
    render(
      <Provider store={store}>
        {!FEATURE_SOCIAL_V2 && <SocialPanel actorId="user" />}
      </Provider>,
    );
    expect(screen.getByText(/Social Actions/)).toBeDefined();
  });

  it('FEATURE_SOCIAL_V2 defaults to true when env var is not set', async () => {
    // No stub — env var absent; ?? 'true' fallback should apply
    const { FEATURE_SOCIAL_V2 } = await import('../../../config/featureFlags');
    expect(FEATURE_SOCIAL_V2).toBe(true);
  });

  it('FEATURE_SOCIAL_V2 is false when VITE_FEATURE_SOCIAL_V2=false', async () => {
    vi.stubEnv('VITE_FEATURE_SOCIAL_V2', 'false');
    const { FEATURE_SOCIAL_V2 } = await import('../../../config/featureFlags');
    expect(FEATURE_SOCIAL_V2).toBe(false);
  });
});
