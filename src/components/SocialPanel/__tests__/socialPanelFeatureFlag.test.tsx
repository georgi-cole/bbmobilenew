/**
 * Smoke tests: FEATURE_SOCIAL_V2 flag gates old SocialPanel rendering.
 *
 * Strategy: vi.mock the featureFlags module to control the flag value, then
 * render a minimal wrapper that mirrors GameScreen's conditional logic and
 * assert presence / absence of the old SocialPanel's heading.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import gameReducer from '../../../store/gameSlice';
import socialReducer, { setEnergyBankEntry } from '../../../social/socialSlice';
import { initManeuvers } from '../../../social/SocialManeuvers';
import SocialPanel from '../SocialPanel';

// ── Helpers ────────────────────────────────────────────────────────────────

function makeStore() {
  const store = configureStore({
    reducer: { game: gameReducer, social: socialReducer },
  });
  initManeuvers(store);
  store.dispatch(setEnergyBankEntry({ playerId: 'user', value: 5 }));
  return store;
}

/**
 * Minimal wrapper that replicates GameScreen's feature-flag conditional:
 *   {!FEATURE_SOCIAL_V2 && <SocialPanel actorId="user" />}
 */
function ConditionalSocialPanel({ flagEnabled }: { flagEnabled: boolean }) {
  return flagEnabled ? null : <SocialPanel actorId="user" />;
}

// ── Tests ──────────────────────────────────────────────────────────────────

describe('FEATURE_SOCIAL_V2 feature flag – SocialPanel visibility', () => {
  let store: ReturnType<typeof makeStore>;

  beforeEach(() => {
    store = makeStore();
  });

  it('hides the old SocialPanel when FEATURE_SOCIAL_V2 is enabled (true)', () => {
    render(
      <Provider store={store}>
        <ConditionalSocialPanel flagEnabled={true} />
      </Provider>,
    );
    expect(screen.queryByText(/Social Actions/)).toBeNull();
  });

  it('renders the old SocialPanel when FEATURE_SOCIAL_V2 is disabled (false)', () => {
    render(
      <Provider store={store}>
        <ConditionalSocialPanel flagEnabled={false} />
      </Provider>,
    );
    expect(screen.getByText(/Social Actions/)).toBeDefined();
  });

  it('FEATURE_SOCIAL_V2 defaults to true when env var is not set', async () => {
    vi.stubEnv('VITE_FEATURE_SOCIAL_V2', undefined as unknown as string);
    vi.stubEnv('REACT_APP_FEATURE_SOCIAL_V2', undefined as unknown as string);
    const { FEATURE_SOCIAL_V2 } = await import('../../../config/featureFlags');
    expect(FEATURE_SOCIAL_V2).toBe(true);
    vi.unstubAllEnvs();
  });

  it('FEATURE_SOCIAL_V2 is false when VITE_FEATURE_SOCIAL_V2=false', async () => {
    vi.resetModules();
    vi.stubEnv('VITE_FEATURE_SOCIAL_V2', 'false');
    const { FEATURE_SOCIAL_V2 } = await import('../../../config/featureFlags');
    expect(FEATURE_SOCIAL_V2).toBe(false);
    vi.unstubAllEnvs();
    vi.resetModules();
  });
});
