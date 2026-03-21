/**
 * Unit tests for the TvZone twist indicator change.
 *
 * Validates:
 *  1. When twistActive is false, no TWIST chip appears in the status-bar pills.
 *  2. When twistActive is false, no twist badge is rendered in the viewport.
 *  3. When twistActive is true, no TWIST StatusPill is rendered in the head pills.
 *  4. When twistActive is true, the .tv-zone__twist-badge element is rendered
 *     inside the viewport (the "main TV" zone).
 */

import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { Provider } from 'react-redux';
import { MemoryRouter } from 'react-router-dom';
import { configureStore } from '@reduxjs/toolkit';
import gameReducer from '../../../src/store/gameSlice';
import challengeReducer from '../../../src/store/challengeSlice';
import socialReducer from '../../../src/social/socialSlice';
import uiReducer from '../../../src/store/uiSlice';
import settingsReducer from '../../../src/store/settingsSlice';
import type { GameState, Player } from '../../../src/types';
import TvZone from '../../../src/components/ui/TvZone';

// ── Helpers ────────────────────────────────────────────────────────────────

function makePlayers(count: number): Player[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `p${i}`,
    name: `Player ${i}`,
    avatar: '🧑',
    status: 'active' as const,
    isUser: i === 0,
  }));
}

function makeStore(twistActive: boolean) {
  const base: GameState = {
    season: 1,
    week: 1,
    phase: 'hoh_comp',
    seed: 42,
    hohId: null,
    prevHohId: null,
    nomineeIds: [],
    povWinnerId: null,
    awaitingNominations: false,
    pendingNominee1Id: null,
    awaitingPovDecision: false,
    awaitingPovSaveTarget: false,
    votes: {},
    awaitingHumanVote: false,
    awaitingTieBreak: false,
    tiedNomineeIds: null,
    awaitingFinal3Eviction: false,
    f3Part1WinnerId: null,
    f3Part2WinnerId: null,
    voteResults: null,
    evictionSplashId: null,
    pendingMinigame: null,
    minigameResult: null,
    players: makePlayers(6),
    tvFeed: [],
    isLive: false,
    twistActive,
    doubleEviction: { usedCount: 0, weekActive: false, pendingSecondEviction: null },
  };
  return configureStore({
    reducer: {
      game: gameReducer,
      challenge: challengeReducer,
      social: socialReducer,
      ui: uiReducer,
      settings: settingsReducer,
    },
    preloadedState: { game: base },
  });
}

function renderTvZone(twistActive: boolean) {
  const store = makeStore(twistActive);
  const { container } = render(
    <Provider store={store}>
      <MemoryRouter>
        <TvZone />
      </MemoryRouter>
    </Provider>,
  );
  return { container, store };
}

// ── Tests ──────────────────────────────────────────────────────────────────

describe('TvZone — twist indicator placement', () => {
  it('renders no TWIST chip in the head-pills when twistActive is false', () => {
    const { container } = renderTvZone(false);
    const pills = container.querySelector('.tv-zone__head-pills');
    expect(pills).toBeTruthy();
    // No pill with TWIST text
    expect(pills!.textContent).not.toContain('TWIST');
  });

  it('renders no twist badge in the viewport when twistActive is false', () => {
    const { container } = renderTvZone(false);
    expect(container.querySelector('.tv-zone__twist-badge')).toBeNull();
  });

  it('renders no TWIST StatusPill in the head-pills when twistActive is true', () => {
    const { container } = renderTvZone(true);
    const pills = container.querySelector('.tv-zone__head-pills');
    expect(pills).toBeTruthy();
    // The head-pills should not contain a TWIST chip
    expect(pills!.textContent).not.toContain('TWIST');
  });

  it('renders .tv-zone__twist-badge inside the viewport when twistActive is true', () => {
    const { container } = renderTvZone(true);
    const badge = container.querySelector('.tv-zone__twist-badge');
    expect(badge).toBeTruthy();
    // The badge must be inside the viewport element
    const viewport = container.querySelector('.tv-zone__viewport');
    expect(viewport).toBeTruthy();
    expect(viewport!.contains(badge)).toBe(true);
  });

  it('twist badge is aria-hidden (does not pollute the viewport live region)', () => {
    const { container } = renderTvZone(true);
    const badge = container.querySelector('.tv-zone__twist-badge');
    expect(badge).toBeTruthy();
    expect(badge!.getAttribute('aria-hidden')).toBe('true');
  });
});
