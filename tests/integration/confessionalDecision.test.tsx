/**
 * confessionalDecision.test.tsx
 *
 * Integration tests for the confessional-based ceremony decision routing.
 *
 * Validates:
 *  1. selectActiveConfessionalDecision correctly identifies active decisions
 *  2. Final 4 and Final 3 phases are excluded from confessional routing
 *  3. GameScreen shows confessional-call overlay (not in-game modal) when a
 *     decision is active
 *  4. DiaryRoom shows decision panel when a ceremony decision is pending
 *  5. DiaryRoom back button is locked when a decision is pending
 *  6. Double-vote offer and double-vote are routed separately
 *  7. selectConfessionalAlertCount includes ceremony decisions
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Provider } from 'react-redux';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { configureStore } from '@reduxjs/toolkit';
import gameReducer from '../../src/store/gameSlice';
import settingsReducer from '../../src/store/settingsSlice';
import challengeReducer from '../../src/store/challengeSlice';
import socialReducer from '../../src/social/socialSlice';
import uiReducer from '../../src/store/uiSlice';
import publicOpinionReducer from '../../src/publicOpinion/publicOpinionSlice';
import type { GameState, Player } from '../../src/types';
import { selectActiveConfessionalDecision } from '../../src/store/confessionalDecisionSelectors';
import { selectConfessionalAlertCount } from '../../src/store/selectors';
import GameScreen from '../../src/screens/GameScreen/GameScreen';
import DiaryRoom from '../../src/screens/DiaryRoom/DiaryRoom';

// ── Mocks ──────────────────────────────────────────────────────────────────

vi.mock('../../src/minigames/LegacyMinigameWrapper', () => ({
  default: () => null,
}));

vi.mock('../../src/components/ui/TvZone', () => ({
  default: () => <div data-testid="tv-zone" />,
}));

vi.mock('../../src/components/FloatingActionBar/FloatingActionBar', () => ({
  default: () => <div data-testid="fab" />,
}));

vi.mock('../../src/components/HouseguestGrid/HouseguestGrid', () => ({
  default: () => <div data-testid="houseguest-grid" />,
}));

vi.mock('../../src/components/SpotlightAnimation/spotlight-animation', () => ({
  default: () => null,
}));

vi.mock('../../src/components/Eviction/SpotlightEvictionOverlay', () => ({
  default: () => null,
}));

// ── Test helpers ────────────────────────────────────────────────────────────

function buildPlayers(count = 8): Player[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `p${i + 1}`,
    name: `Player ${i + 1}`,
    isUser: i === 0,
    status: 'active' as const,
    stats: {},
  }));
}

function makeStore(overrides: Partial<GameState> = {}) {
  const players = overrides.players ?? buildPlayers();
  const base: Partial<GameState> = {
    phase: 'live_vote',
    week: 2,
    players,
    nomineeIds: ['p2', 'p3'],
    lohId: 'p4',
    posWinnerId: null,
    votes: {},
    awaitingHumanVote: false,
    awaitingNominations: false,
    awaitingPovDecision: false,
    awaitingPovSaveTarget: false,
    replacementNeeded: false,
    awaitingTieBreak: false,
    awaitingDoubleVoteOffer: false,
    humanDoubleVoteActive: false,
    tiedNomineeIds: null,
    doubleEviction: undefined,
    specialVeto: undefined,
    seed: 12345,
    tvFeed: [],
    ...overrides,
  };

  return configureStore({
    reducer: {
      game: gameReducer,
      settings: settingsReducer,
      challenge: challengeReducer,
      social: socialReducer,
      ui: uiReducer,
      publicOpinion: publicOpinionReducer,
    },
    preloadedState: { game: base as GameState },
  });
}

function renderGameScreen(store: ReturnType<typeof makeStore>) {
  return render(
    <Provider store={store}>
      <MemoryRouter initialEntries={['/game']}>
        <Routes>
          <Route path="/game" element={<GameScreen />} />
          <Route path="/diary-room" element={<div data-testid="diary-room" />} />
        </Routes>
      </MemoryRouter>
    </Provider>,
  );
}

function renderDiaryRoom(store: ReturnType<typeof makeStore>) {
  return render(
    <Provider store={store}>
      <MemoryRouter
        initialEntries={['/game', '/diary-room']}
        initialIndex={1}
      >
        <Routes>
          <Route path="/game" element={<div data-testid="game-screen" />} />
          <Route path="/diary-room" element={<DiaryRoom />} />
        </Routes>
      </MemoryRouter>
    </Provider>,
  );
}

// ── selectActiveConfessionalDecision ──────────────────────────────────────────

describe('selectActiveConfessionalDecision', () => {
  it('returns null when no awaiting flags are set', () => {
    const store = makeStore({ phase: 'live_vote', awaitingHumanVote: false });
    expect(selectActiveConfessionalDecision(store.getState())).toBeNull();
  });

  it('returns eviction_vote when awaitingHumanVote is true in live_vote', () => {
    const store = makeStore({ phase: 'live_vote', awaitingHumanVote: true });
    const dec = selectActiveConfessionalDecision(store.getState());
    expect(dec?.type).toBe('eviction_vote');
  });

  it('returns double_vote when humanDoubleVoteActive and awaitingHumanVote', () => {
    const store = makeStore({
      phase: 'live_vote',
      awaitingHumanVote: true,
      humanDoubleVoteActive: true,
    });
    const dec = selectActiveConfessionalDecision(store.getState());
    expect(dec?.type).toBe('double_vote');
  });

  it('returns double_vote_offer when awaitingDoubleVoteOffer', () => {
    const store = makeStore({
      phase: 'live_vote',
      awaitingHumanVote: true,
      awaitingDoubleVoteOffer: true,
    });
    const dec = selectActiveConfessionalDecision(store.getState());
    expect(dec?.type).toBe('double_vote_offer');
  });

  it('returns nominations when awaitingNominations', () => {
    const players = buildPlayers();
    // make player 1 the LOH
    const store = makeStore({
      phase: 'nomination_results',
      lohId: 'p1',
      awaitingNominations: true,
      players,
    });
    const dec = selectActiveConfessionalDecision(store.getState());
    expect(dec?.type).toBe('nominations');
  });

  it('returns pos_decision when awaitingPovDecision', () => {
    const store = makeStore({
      phase: 'pos_ceremony_results',
      awaitingPovDecision: true,
      posWinnerId: 'p1',
    });
    const dec = selectActiveConfessionalDecision(store.getState());
    expect(dec?.type).toBe('pos_decision');
  });

  it('returns pos_save_target when awaitingPovSaveTarget', () => {
    const store = makeStore({
      phase: 'pos_ceremony_results',
      awaitingPovSaveTarget: true,
      posWinnerId: 'p1',
    });
    const dec = selectActiveConfessionalDecision(store.getState());
    expect(dec?.type).toBe('pos_save_target');
  });

  it('returns replacement_nominee when replacementNeeded', () => {
    const store = makeStore({
      phase: 'pos_ceremony_results',
      replacementNeeded: true,
      lohId: 'p1',
    });
    const dec = selectActiveConfessionalDecision(store.getState());
    expect(dec?.type).toBe('replacement_nominee');
  });

  it('returns tie_break when awaitingTieBreak', () => {
    const store = makeStore({
      phase: 'eviction_results',
      awaitingTieBreak: true,
      lohId: 'p1',
    });
    const dec = selectActiveConfessionalDecision(store.getState());
    expect(dec?.type).toBe('tie_break');
  });

  it('includes the current week in the result', () => {
    const store = makeStore({
      phase: 'live_vote',
      awaitingHumanVote: true,
      week: 5,
    });
    const dec = selectActiveConfessionalDecision(store.getState());
    expect(dec?.week).toBe(5);
  });
});

// ── Final 4 / Final 3 exclusion ────────────────────────────────────────────

describe('selectActiveConfessionalDecision — Final 4/3 exclusion', () => {
  const endgamePhases = [
    'final4_eviction',
    'final3',
    'final3_comp1',
    'final3_comp1_minigame',
    'final3_comp2',
    'final3_comp2_minigame',
    'final3_comp3',
    'final3_comp3_minigame',
    'final3_decision',
  ] as const;

  endgamePhases.forEach((phase) => {
    it(`returns null for endgame phase "${phase}" even when awaiting flags are set`, () => {
      const store = makeStore({
        phase,
        awaitingHumanVote: true,
        awaitingNominations: true,
        replacementNeeded: true,
      });
      expect(selectActiveConfessionalDecision(store.getState())).toBeNull();
    });
  });
});

// ── Human player status guards ──────────────────────────────────────────────

describe('selectActiveConfessionalDecision — player status guards', () => {
  it('returns null when the human player is evicted', () => {
    const players = buildPlayers();
    players[0] = { ...players[0], status: 'evicted' };
    const store = makeStore({ phase: 'live_vote', awaitingHumanVote: true, players });
    expect(selectActiveConfessionalDecision(store.getState())).toBeNull();
  });

  it('returns null when the human player is in jury', () => {
    const players = buildPlayers();
    players[0] = { ...players[0], status: 'jury' };
    const store = makeStore({ phase: 'live_vote', awaitingHumanVote: true, players });
    expect(selectActiveConfessionalDecision(store.getState())).toBeNull();
  });
});

// ── selectConfessionalAlertCount includes ceremony decisions ───────────────

describe('selectConfessionalAlertCount', () => {
  it('includes 1 for a pending confessional ceremony decision', () => {
    const store = makeStore({
      phase: 'live_vote',
      awaitingHumanVote: true,
      // No doubleVote flags, no mission
      awaitingDoubleVoteOffer: false,
      humanDoubleVoteActive: false,
    });
    // awaitingHumanVote = true → selectActiveConfessionalDecision = non-null → count >= 1
    expect(selectConfessionalAlertCount(store.getState())).toBeGreaterThanOrEqual(1);
  });

  it('does not count ceremony decisions for evicted human', () => {
    const players = buildPlayers();
    players[0] = { ...players[0], status: 'evicted' };
    const store = makeStore({ phase: 'live_vote', awaitingHumanVote: true, players });
    expect(selectConfessionalAlertCount(store.getState())).toBe(0);
  });

  it('does not double-count doubleVoteOffer (already counted separately + as confessional decision)', () => {
    const store = makeStore({
      phase: 'live_vote',
      awaitingHumanVote: true,
      awaitingDoubleVoteOffer: true,
    });
    // awaitingDoubleVoteOffer = 1 (from existing logic)
    // selectActiveConfessionalDecision = non-null → +1 for ceremony
    // Total = 2 (one for the offer flag, one for the confessional routing)
    const count = selectConfessionalAlertCount(store.getState());
    expect(count).toBeGreaterThanOrEqual(2);
  });
});

// ── GameScreen: confessional-call overlay ─────────────────────────────────

describe('GameScreen — confessional-call overlay', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('shows the confessional-call overlay when awaitingHumanVote is true', () => {
    const store = makeStore({ phase: 'live_vote', awaitingHumanVote: true });
    renderGameScreen(store);
    expect(screen.getByTestId('confessional-call-overlay')).toBeTruthy();
  });

  it('shows the confessional-call overlay when awaitingNominations is true', () => {
    const players = buildPlayers();
    const store = makeStore({
      phase: 'nomination_results',
      lohId: 'p1',
      awaitingNominations: true,
      players,
    });
    renderGameScreen(store);
    expect(screen.getByTestId('confessional-call-overlay')).toBeTruthy();
  });

  it('does NOT show the confessional-call overlay when no decision is pending', () => {
    const store = makeStore({ phase: 'live_vote', awaitingHumanVote: false });
    renderGameScreen(store);
    expect(screen.queryByTestId('confessional-call-overlay')).toBeNull();
  });

  it('does NOT show the confessional-call overlay for Final 4 phase', () => {
    const store = makeStore({
      phase: 'final4_eviction',
      awaitingHumanVote: true,
    });
    renderGameScreen(store);
    expect(screen.queryByTestId('confessional-call-overlay')).toBeNull();
  });

  it('hides the in-game live vote modal when confessional routing is active', () => {
    const store = makeStore({
      phase: 'live_vote',
      awaitingHumanVote: true,
    });
    renderGameScreen(store);
    // The confessional overlay is shown instead of the TvDecisionModal
    expect(screen.getByTestId('confessional-call-overlay')).toBeTruthy();
    // No "Live Elimination Vote" heading should be visible in-game
    expect(screen.queryByText(/Live Elimination Vote/i)).toBeNull();
  });
});

// ── DiaryRoom: decision panel and back-lock ────────────────────────────────

describe('DiaryRoom — confessional decision panel', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    sessionStorage.clear();
    localStorage.clear();
    Object.defineProperty(window.HTMLElement.prototype, 'scrollIntoView', {
      configurable: true,
      value: vi.fn(),
    });
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('shows the decision zone when a ceremony decision is pending', () => {
    const store = makeStore({ phase: 'live_vote', awaitingHumanVote: true });
    renderDiaryRoom(store);
    expect(screen.getByTestId('confessional-decision-zone')).toBeTruthy();
  });

  it('does NOT show the decision zone when no ceremony decision is pending', () => {
    const store = makeStore({ phase: 'live_vote', awaitingHumanVote: false });
    renderDiaryRoom(store);
    expect(screen.queryByTestId('confessional-decision-zone')).toBeNull();
  });

  it('locks the back button when a ceremony decision is pending', () => {
    const store = makeStore({ phase: 'live_vote', awaitingHumanVote: true });
    renderDiaryRoom(store);
    expect(screen.getByTestId('diary-room-back-locked')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /go back/i })).toBeNull();
  });

  it('shows the normal back button when no ceremony decision is pending', () => {
    const store = makeStore({ phase: 'live_vote', awaitingHumanVote: false });
    renderDiaryRoom(store);
    expect(screen.getByRole('button', { name: /go back/i })).toBeTruthy();
    expect(screen.queryByTestId('diary-room-back-locked')).toBeNull();
  });

  it('does NOT lock back or show decision zone for Final 4 phase', () => {
    const store = makeStore({
      phase: 'final4_eviction',
      awaitingHumanVote: true,
    });
    renderDiaryRoom(store);
    expect(screen.queryByTestId('diary-room-back-locked')).toBeNull();
    expect(screen.queryByTestId('confessional-decision-zone')).toBeNull();
    expect(screen.getByRole('button', { name: /go back/i })).toBeTruthy();
  });

  it('shows the eviction vote panel heading for eviction_vote decision', () => {
    const store = makeStore({ phase: 'live_vote', awaitingHumanVote: true });
    renderDiaryRoom(store);
    expect(screen.getByText(/Live Elimination Vote/i)).toBeTruthy();
  });

  it('shows the nomination panel heading for nominations decision', () => {
    const players = buildPlayers();
    const store = makeStore({
      phase: 'nomination_results',
      lohId: 'p1',
      awaitingNominations: true,
      players,
    });
    renderDiaryRoom(store);
    expect(screen.getByText(/Nomination Ceremony/i)).toBeTruthy();
  });

  it('shows the POS decision panel heading for pos_decision', () => {
    const store = makeStore({
      phase: 'pos_ceremony_results',
      awaitingPovDecision: true,
      posWinnerId: 'p1',
    });
    renderDiaryRoom(store);
    expect(screen.getAllByText(/Power of Safety/i).length).toBeGreaterThan(0);
  });

  it('shows the double vote offer panel heading for double_vote_offer', () => {
    const store = makeStore({
      phase: 'live_vote',
      awaitingHumanVote: true,
      awaitingDoubleVoteOffer: true,
    });
    renderDiaryRoom(store);
    expect(screen.getByText(/Secret Power/i)).toBeTruthy();
  });

  it('shows the double vote panel heading for double_vote type', () => {
    const store = makeStore({
      phase: 'live_vote',
      awaitingHumanVote: true,
      humanDoubleVoteActive: true,
    });
    renderDiaryRoom(store);
    expect(screen.getByText(/Double Vote/i)).toBeTruthy();
  });
});
