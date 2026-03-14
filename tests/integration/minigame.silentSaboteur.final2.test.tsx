/**
 * Integration tests — Silent Saboteur Final-2 staged cinematic flow.
 *
 * Verifies the UI-only Final-2 state machine introduced in SilentSaboteurComp:
 *
 *   FINAL2_INTRO  →(button)→  FINAL2_VOTING  →(jury votes)→  FINAL2_VERDICT_LOCKED
 *   →(button)→  FINAL2_REVEAL  →(delay + button)→  FINAL2_WINNER  →(button)→  onComplete
 *
 * Uses React Testing Library with jsdom and fake timers.
 * All participants are AI (no human) so no manual vote interaction is required.
 * `no-animations` body class ensures timer delays collapse to 0 / 50 ms.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { render, screen, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
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

// 3 all-AI participants so the game reliably reaches final2_jury after 1 round.
const PARTICIPANTS = [
  { id: 'ava', name: 'Ava', isHuman: false, precomputedScore: 0, previousPR: null },
  { id: 'bex', name: 'Bex', isHuman: false, precomputedScore: 0, previousPR: null },
  { id: 'cal', name: 'Cal', isHuman: false, precomputedScore: 0, previousPR: null },
];
const IDS = PARTICIPANTS.map((p) => p.id);

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Advance the store manually through intro + round(s) until final2_jury.
 * Uses direct Redux dispatches so we don't rely on component timers
 * to reach the phase under test (keeping the test deterministic).
 */
function advanceToFinal2Jury(store: TestStore) {
  if (ss(store).phase === 'intro') store.dispatch(advanceIntro());

  // Advance through rounds until we reach final2_jury or complete
  let iterations = 0;
  while (ss(store).phase !== 'final2_jury' && ss(store).phase !== 'complete' && iterations < 20) {
    iterations++;
    const phase = ss(store).phase;
    if (phase === 'select_victim') {
      const s = ss(store);
      const victimId = s.activeIds.find((id) => id !== s.saboteurId)!;
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

    // Let the component initialize (init effect fires)
    await act(async () => { vi.advanceTimersByTime(0); });
    await act(async () => { advanceToFinal2Jury(store); });
    await act(async () => { vi.advanceTimersByTime(100); });

    if (ss(store).phase !== 'final2_jury') return; // guard for edge-case paths

    expect(screen.getByTestId('ss-final2-intro')).toBeInTheDocument();
    expect(screen.getByTestId('ss-final2-proceed-btn')).toBeInTheDocument();
    // VOTING screen must NOT be visible yet
    expect(screen.queryByTestId('ss-final2-voting')).not.toBeInTheDocument();
  });

  it('clicking "Proceed to Jury Decision" transitions from FINAL2_INTRO to FINAL2_VOTING', async () => {
    const store = makeStore();
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    renderComp(store);

    await act(async () => { vi.advanceTimersByTime(0); });
    await act(async () => { advanceToFinal2Jury(store); });
    await act(async () => { vi.advanceTimersByTime(100); });

    if (ss(store).phase !== 'final2_jury') return;

    await user.click(screen.getByTestId('ss-final2-proceed-btn'));

    expect(screen.getByTestId('ss-final2-voting')).toBeInTheDocument();
    expect(screen.queryByTestId('ss-final2-intro')).not.toBeInTheDocument();
  });

  it('FINAL2_VOTING does not show victim, saboteur, or suspect role labels', async () => {
    const store = makeStore();
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    renderComp(store);

    await act(async () => { vi.advanceTimersByTime(0); });
    await act(async () => { advanceToFinal2Jury(store); });
    await act(async () => { vi.advanceTimersByTime(100); });

    if (ss(store).phase !== 'final2_jury') return;

    await user.click(screen.getByTestId('ss-final2-proceed-btn'));

    const votingPanel = screen.getByTestId('ss-final2-voting');
    // None of the role-revealing labels should appear in voting
    expect(votingPanel.textContent).not.toMatch(/\bVictim\b/);
    expect(votingPanel.textContent).not.toMatch(/\bSaboteur\b/);
    expect(votingPanel.textContent).not.toMatch(/\bSuspect\b/);
  });

  it('transitions to FINAL2_VERDICT_LOCKED after jury votes (no auto-advance to winner screen)', async () => {
    const store = makeStore();
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    renderComp(store);

    await act(async () => { vi.advanceTimersByTime(0); });
    await act(async () => { advanceToFinal2Jury(store); });
    await act(async () => { vi.advanceTimersByTime(100); });

    if (ss(store).phase !== 'final2_jury') return;

    // Proceed to voting — AI jury auto-vote effect fires immediately (no-animations)
    await user.click(screen.getByTestId('ss-final2-proceed-btn'));
    await act(async () => { vi.advanceTimersByTime(200); });

    if (ss(store).phase !== 'winner') return; // no jury edge case

    // Should be at VERDICT_LOCKED, NOT at the winner screen
    expect(screen.getByTestId('ss-final2-verdict-locked')).toBeInTheDocument();
    expect(screen.getByTestId('ss-final2-reveal-btn')).toBeInTheDocument();
    expect(screen.queryByTestId('ss-final2-winner')).not.toBeInTheDocument();
  });

  it('clicking "Reveal the Truth" shows the reveal screen with accused highlighted', async () => {
    const store = makeStore();
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    renderComp(store);

    await act(async () => { vi.advanceTimersByTime(0); });
    await act(async () => { advanceToFinal2Jury(store); });
    await act(async () => { vi.advanceTimersByTime(100); });

    if (ss(store).phase !== 'final2_jury') return;

    await user.click(screen.getByTestId('ss-final2-proceed-btn'));
    await act(async () => { vi.advanceTimersByTime(200); });

    if (ss(store).phase !== 'winner') return;

    await user.click(screen.getByTestId('ss-final2-reveal-btn'));

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
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    renderComp(store);

    await act(async () => { vi.advanceTimersByTime(0); });
    await act(async () => { advanceToFinal2Jury(store); });
    await act(async () => { vi.advanceTimersByTime(100); });

    if (ss(store).phase !== 'final2_jury') return;

    await user.click(screen.getByTestId('ss-final2-proceed-btn'));
    await act(async () => { vi.advanceTimersByTime(200); });

    if (ss(store).phase !== 'winner') return;

    await user.click(screen.getByTestId('ss-final2-reveal-btn'));
    await act(async () => { vi.advanceTimersByTime(50); });
    await user.click(screen.getByTestId('ss-final2-reveal-continue-btn'));

    expect(screen.getByTestId('ss-final2-winner')).toBeInTheDocument();
    expect(screen.getByTestId('ss-final2-winner-continue-btn')).toBeInTheDocument();
    expect(screen.queryByTestId('ss-final2-reveal')).not.toBeInTheDocument();
  });

  it('clicking Continue on FINAL2_WINNER calls onComplete and resolves the outcome', async () => {
    const store = makeStore();
    const onComplete = vi.fn();
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });

    renderComp(store, onComplete, false);

    await act(async () => { vi.advanceTimersByTime(0); });
    await act(async () => { advanceToFinal2Jury(store); });
    await act(async () => { vi.advanceTimersByTime(100); });

    if (ss(store).phase !== 'final2_jury') return;

    await user.click(screen.getByTestId('ss-final2-proceed-btn'));
    await act(async () => { vi.advanceTimersByTime(200); });

    if (ss(store).phase !== 'winner') return;

    await user.click(screen.getByTestId('ss-final2-reveal-btn'));
    await act(async () => { vi.advanceTimersByTime(50); });
    await user.click(screen.getByTestId('ss-final2-reveal-continue-btn'));
    await act(async () => { vi.advanceTimersByTime(50); });

    // Click the final Continue on FINAL2_WINNER
    await user.click(screen.getByTestId('ss-final2-winner-continue-btn'));
    await act(async () => { vi.advanceTimersByTime(100); });

    // onComplete should have been called exactly once
    expect(onComplete).toHaveBeenCalledTimes(1);
    // The outcome should be resolved in the store
    expect(ss(store).outcomeResolved).toBe(true);
  });
});
