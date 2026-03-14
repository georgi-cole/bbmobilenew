/**
 * Integration tests — Silent Saboteur Final-2 staged cinematic flow.
 *
 * Verifies the UI-only Final-2 state machine introduced in SilentSaboteurComp:
 *
 *   FINAL2_INTRO  →(button)→  FINAL2_VOTING  →(timer)→  FINAL2_VERDICT_LOCKED
 *   →(button)→  FINAL2_REVEAL  →(delay + button)→  FINAL2_WINNER  →(button)→  onComplete
 *
 * Uses React Testing Library with jsdom and fake timers.
 * `no-animations` body class ensures timer delays collapse to 0 / 50 ms.
 *
 * Test setup: PARTICIPANTS = [user(human), ava(AI), bex(AI)] with seed=42.
 * With this seed the saboteur in round 1 is `ava`, so `user` (first
 * non-saboteur) is chosen as victim, gets eliminated, and becomes the sole
 * jury member.  Because humanIsJuror=true the slice does NOT auto-resolve
 * final2_jury in _startFinal2, which means the Redux phase settles at
 * 'final2_jury' and the component can drive the cinematic stages manually.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { render, screen, act, fireEvent } from '@testing-library/react';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import silentSaboteurReducer, {
  advanceIntro,
  selectVictim,
  endVotingPhase,
  advanceReveal,
  startNextRound,
} from '../../src/features/silentSaboteur/silentSaboteurSlice';
import type { SilentSaboteurState } from '../../src/features/silentSaboteur/silentSaboteurSlice';
import SilentSaboteurComp from '../../src/components/SilentSaboteurComp/SilentSaboteurComp';

// ─── Store factory ────────────────────────────────────────────────────────────

function makeStore() {
  const gameReducer = (
    state = { phase: 'hoh_comp', hohId: null as string | null, applyCount: 0 },
    action: { type: string; payload?: unknown },
  ) => {
    if (action.type === 'game/applyMinigameWinner') {
      const p = action.payload as { winnerId: string };
      return { ...state, hohId: p.winnerId, phase: 'hoh_results', applyCount: state.applyCount + 1 };
    }
    return state;
  };
  return configureStore({ reducer: { silentSaboteur: silentSaboteurReducer, game: gameReducer } });
}

type TestStore = ReturnType<typeof makeStore>;

function ss(store: TestStore): SilentSaboteurState {
  return store.getState().silentSaboteur;
}

/**
 * Participants for seed=42: 'ava' is the round-1 saboteur, so 'user' (first
 * non-saboteur) is chosen as victim → eliminated → jury member.
 * Having a human jury member (humanIsJuror=true) prevents the slice from
 * auto-resolving the final2_jury phase, keeping the game in 'final2_jury'.
 */
const PARTICIPANTS = [
  { id: 'user', name: 'User', isHuman: true, precomputedScore: 0, previousPR: null },
  { id: 'ava', name: 'Ava', isHuman: false, precomputedScore: 0, previousPR: null },
  { id: 'bex', name: 'Bex', isHuman: false, precomputedScore: 0, previousPR: null },
];
const IDS = PARTICIPANTS.map((p) => p.id);

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Advance the store through intro + rounds until reaching final2_jury.
 * When choosing the round victim, prefers the human player so they become
 * the jury member and prevent the slice from auto-resolving final2_jury.
 */
function advanceToFinal2Jury(store: TestStore) {
  if (ss(store).phase === 'intro') store.dispatch(advanceIntro());

  let iterations = 0;
  while (ss(store).phase !== 'final2_jury' && ss(store).phase !== 'complete' && iterations < 20) {
    iterations++;
    const phase = ss(store).phase;
    if (phase === 'select_victim') {
      const s = ss(store);
      // Prefer the human as victim → they become juror → prevents slice auto-resolve
      const humanId = s.humanPlayerId;
      const victimId =
        humanId && s.activeIds.includes(humanId) && humanId !== s.saboteurId
          ? humanId
          : s.activeIds.find((id) => id !== s.saboteurId)!;
      store.dispatch(selectVictim({ victimId }));
    } else if (phase === 'voting') {
      store.dispatch(endVotingPhase());
    } else if (phase === 'reveal') {
      store.dispatch(advanceReveal());
    } else if (phase === 'round_transition') {
      store.dispatch(startNextRound());
    } else {
      break;
    }
  }
}

function renderComp(store: TestStore, onComplete?: () => void, standalone = true) {
  return render(
    <Provider store={store}>
      <SilentSaboteurComp
        participantIds={IDS}
        participants={PARTICIPANTS}
        prizeType="HOH"
        seed={42}
        onComplete={onComplete}
        standalone={standalone}
      />
    </Provider>,
  );
}

function clickButton(testId: string) {
  act(() => { fireEvent.click(screen.getByTestId(testId)); });
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('SilentSaboteur Final-2 Cinematic Flow', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    document.body.classList.add('no-animations');
  });

  afterEach(() => {
    vi.useRealTimers();
    document.body.classList.remove('no-animations');
  });

  it('starts in FINAL2_INTRO when the game reaches final2_jury', async () => {
    const store = makeStore();
    renderComp(store);

    // Component init fires initSilentSaboteur; advanceToFinal2Jury drives to final2_jury
    await act(async () => { vi.advanceTimersByTime(0); });
    await act(async () => { advanceToFinal2Jury(store); });

    expect(ss(store).phase).toBe('final2_jury');

    expect(screen.getByTestId('ss-final2-intro')).toBeInTheDocument();
    expect(screen.getByTestId('ss-final2-proceed-btn')).toBeInTheDocument();
    // VOTING screen must NOT be visible yet
    expect(screen.queryByTestId('ss-final2-voting')).not.toBeInTheDocument();
  });

  it('clicking "Proceed to Jury Decision" transitions from FINAL2_INTRO to FINAL2_VOTING', async () => {
    const store = makeStore();
    renderComp(store);

    await act(async () => { vi.advanceTimersByTime(0); });
    await act(async () => { advanceToFinal2Jury(store); });

    expect(ss(store).phase).toBe('final2_jury');

    clickButton('ss-final2-proceed-btn');

    expect(screen.getByTestId('ss-final2-voting')).toBeInTheDocument();
    expect(screen.queryByTestId('ss-final2-intro')).not.toBeInTheDocument();
  });

  it('FINAL2_VOTING does not show victim, saboteur, or suspect role labels', async () => {
    const store = makeStore();
    renderComp(store);

    await act(async () => { vi.advanceTimersByTime(0); });
    await act(async () => { advanceToFinal2Jury(store); });

    expect(ss(store).phase).toBe('final2_jury');

    clickButton('ss-final2-proceed-btn');

    const votingPanel = screen.getByTestId('ss-final2-voting');
    // None of the role-revealing labels should appear in voting
    expect(votingPanel.textContent).not.toMatch(/\bVictim\b/);
    expect(votingPanel.textContent).not.toMatch(/\bSaboteur\b/);
    expect(votingPanel.textContent).not.toMatch(/\bSuspect\b/);
  });

  it('does not show any Continue-style cinematic CTA during active FINAL2_VOTING', async () => {
    const store = makeStore();
    renderComp(store);

    await act(async () => { vi.advanceTimersByTime(0); });
    await act(async () => { advanceToFinal2Jury(store); });

    clickButton('ss-final2-proceed-btn');

    expect(screen.getByTestId('ss-final2-voting')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Continue' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Reveal the Truth' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Proceed to Jury Decision' })).not.toBeInTheDocument();
  });

  it('transitions to FINAL2_VERDICT_LOCKED after jury votes (no auto-advance to winner screen)', async () => {
    const store = makeStore();
    renderComp(store);

    await act(async () => { vi.advanceTimersByTime(0); });
    await act(async () => { advanceToFinal2Jury(store); });

    expect(ss(store).phase).toBe('final2_jury');

    // Proceed to voting; the 50ms human juror fallback timer then fires
    clickButton('ss-final2-proceed-btn');
    // Advance past the 50ms human juror timeout (no-animations delay)
    await act(async () => { vi.advanceTimersByTime(200); });

    expect(ss(store).phase).toBe('winner');

    // Should be at VERDICT_LOCKED, NOT at the winner screen
    expect(screen.getByTestId('ss-final2-verdict-locked')).toBeInTheDocument();
    expect(screen.getByTestId('ss-final2-reveal-btn')).toBeInTheDocument();
    expect(screen.queryByTestId('ss-final2-winner')).not.toBeInTheDocument();
  });

  it('clicking "Reveal the Truth" shows the reveal screen with accused highlighted', async () => {
    const store = makeStore();
    renderComp(store);

    await act(async () => { vi.advanceTimersByTime(0); });
    await act(async () => { advanceToFinal2Jury(store); });

    expect(ss(store).phase).toBe('final2_jury');

    clickButton('ss-final2-proceed-btn');
    await act(async () => { vi.advanceTimersByTime(200); });

    expect(ss(store).phase).toBe('winner');

    clickButton('ss-final2-reveal-btn');

    expect(screen.getByTestId('ss-final2-reveal')).toBeInTheDocument();
    // Continue button is NOT visible before the reveal delay fires
    expect(screen.queryByTestId('ss-final2-reveal-continue-btn')).not.toBeInTheDocument();

    // Advance past the reveal delay (0 ms with no-animations)
    await act(async () => { vi.advanceTimersByTime(50); });

    // After the delay, Continue button and saboteur reveal should appear
    expect(screen.getByTestId('ss-final2-reveal-continue-btn')).toBeInTheDocument();
    // Role labels only appear after the reveal
    expect(screen.getByTestId('ss-final2-reveal').textContent).toMatch(/Saboteur|Victim/);
  });

  it('clicking Continue on FINAL2_REVEAL transitions to FINAL2_WINNER', async () => {
    const store = makeStore();
    renderComp(store);

    await act(async () => { vi.advanceTimersByTime(0); });
    await act(async () => { advanceToFinal2Jury(store); });

    expect(ss(store).phase).toBe('final2_jury');

    clickButton('ss-final2-proceed-btn');
    await act(async () => { vi.advanceTimersByTime(200); });

    expect(ss(store).phase).toBe('winner');

    clickButton('ss-final2-reveal-btn');
    await act(async () => { vi.advanceTimersByTime(50); });
    clickButton('ss-final2-reveal-continue-btn');

    expect(screen.getByTestId('ss-final2-winner')).toBeInTheDocument();
    expect(screen.getByTestId('ss-final2-winner-continue-btn')).toBeInTheDocument();
    expect(screen.queryByTestId('ss-final2-reveal')).not.toBeInTheDocument();
  });

  it('clicking Continue on FINAL2_WINNER calls onComplete and resolves the outcome', async () => {
    const store = makeStore();
    const onComplete = vi.fn();

    renderComp(store, onComplete, false);

    await act(async () => { vi.advanceTimersByTime(0); });
    await act(async () => { advanceToFinal2Jury(store); });

    expect(ss(store).phase).toBe('final2_jury');

    clickButton('ss-final2-proceed-btn');
    await act(async () => { vi.advanceTimersByTime(200); });

    expect(ss(store).phase).toBe('winner');

    clickButton('ss-final2-reveal-btn');
    await act(async () => { vi.advanceTimersByTime(50); });
    clickButton('ss-final2-reveal-continue-btn');
    await act(async () => { vi.advanceTimersByTime(50); });

    // Click the final Continue on FINAL2_WINNER
    clickButton('ss-final2-winner-continue-btn');
    await act(async () => { vi.advanceTimersByTime(100); });

    // onComplete should have been called exactly once
    expect(onComplete).toHaveBeenCalledTimes(1);
    // The outcome should be resolved in the store
    expect(ss(store).outcomeResolved).toBe(true);
  });

  it('ignores repeated clicks on the FINAL2_WINNER Continue button', async () => {
    const store = makeStore();
    const onComplete = vi.fn();

    renderComp(store, onComplete, false);

    await act(async () => { vi.advanceTimersByTime(0); });
    await act(async () => { advanceToFinal2Jury(store); });

    clickButton('ss-final2-proceed-btn');
    await act(async () => { vi.advanceTimersByTime(200); });
    clickButton('ss-final2-reveal-btn');
    await act(async () => { vi.advanceTimersByTime(50); });
    clickButton('ss-final2-reveal-continue-btn');
    await act(async () => { vi.advanceTimersByTime(50); });

    const winnerContinue = screen.getByTestId('ss-final2-winner-continue-btn');
    await act(async () => {
      fireEvent.click(winnerContinue);
      fireEvent.click(winnerContinue);
    });

    expect(onComplete).toHaveBeenCalledTimes(1);
  });
});
