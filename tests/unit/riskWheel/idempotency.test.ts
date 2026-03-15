/**
 * Unit tests — resolveRiskWheelOutcome idempotency
 *
 * Validates that:
 *  1. Calling resolveRiskWheelOutcome() when phase !== 'complete' is a no-op.
 *  2. Calling it once (phase='complete', outcomeResolved=false) dispatches
 *     markRiskWheelOutcomeResolved and applyMinigameWinner exactly once.
 *  3. Calling it a second time (outcomeResolved=true) is a no-op — the winner
 *     is applied only once regardless of how many times the thunk fires.
 */

import { configureStore } from '@reduxjs/toolkit';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import reducer, {
  initRiskWheel,
  performSpin,
  advanceFrom666,
  playerStop,
  advanceFromTurnComplete,
  advanceFromRoundSummary,
} from '../../../src/features/riskWheel/riskWheelSlice';
import { resolveRiskWheelOutcome } from '../../../src/features/riskWheel/thunks';

// ─── Minimal store factory ────────────────────────────────────────────────────

/** Simulated game slice state — only the fields read by the thunk. */
interface MockGameState {
  phase: string;
  hohId: string | null;
  povWinnerId: string | null;
}

function makeGameReducer(initial: MockGameState) {
  return (state: MockGameState = initial, action: { type: string; payload?: unknown }) => {
    if (action.type === 'game/applyMinigameWinner') {
      // Record the winner so assertions can read it.
      const payload = action.payload as { winnerId?: string };
      return { ...state, hohId: payload?.winnerId ?? state.hohId };
    }
    return state;
  };
}

function makeStore(gamePhase: string = 'hoh_comp') {
  const gameInitial: MockGameState = { phase: gamePhase, hohId: null, povWinnerId: null };
  return configureStore({
    reducer: {
      riskWheel: reducer,
      game: makeGameReducer(gameInitial),
    },
  });
}

type TestStore = ReturnType<typeof makeStore>;

function getState(store: TestStore) {
  return store.getState().riskWheel;
}

/** Drive the game to completion with all-AI participants. */
function driveToComplete(store: TestStore): void {
  store.dispatch(
    initRiskWheel({
      participantIds: ['bot1', 'bot2'],
      competitionType: 'HOH',
      seed: 7,
      humanPlayerId: null,
    }),
  );
  let safety = 0;
  while (getState(store).phase !== 'complete' && safety++ < 5000) {
    const s = getState(store);
    if (s.phase === 'awaiting_spin') store.dispatch(performSpin());
    else if (s.phase === 'six_six_six') store.dispatch(advanceFrom666());
    else if (s.phase === 'awaiting_decision') store.dispatch(playerStop());
    else if (s.phase === 'turn_complete') store.dispatch(advanceFromTurnComplete());
    else if (s.phase === 'round_summary') store.dispatch(advanceFromRoundSummary());
    else break;
  }
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('resolveRiskWheelOutcome idempotency', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('is a no-op when phase is not complete', () => {
    const store = makeStore();
    store.dispatch(
      initRiskWheel({
        participantIds: ['bot1', 'bot2'],
        competitionType: 'HOH',
        seed: 5,
        humanPlayerId: null,
      }),
    );
    // phase should be 'awaiting_spin', not 'complete'
    expect(getState(store).phase).toBe('awaiting_spin');

    const dispatchSpy = vi.spyOn(store, 'dispatch');
    store.dispatch(resolveRiskWheelOutcome());

    // resolveRiskWheelOutcome should have returned early — only a single
    // dispatch call (the thunk itself, which produces zero inner dispatches).
    const innerCalls = dispatchSpy.mock.calls.filter(
      (c) => typeof c[0] === 'object' && 'type' in (c[0] as object),
    );
    expect(innerCalls).toHaveLength(0);
    expect(getState(store).outcomeResolved).toBe(false);
  });

  it('sets outcomeResolved and dispatches applyMinigameWinner on first call', () => {
    const store = makeStore('hoh_comp');
    driveToComplete(store);

    expect(getState(store).phase).toBe('complete');
    expect(getState(store).outcomeResolved).toBe(false);
    expect(getState(store).winnerId).not.toBeNull();

    store.dispatch(resolveRiskWheelOutcome());

    expect(getState(store).outcomeResolved).toBe(true);
    // The mock game reducer records hohId when applyMinigameWinner fires.
    const gameState = store.getState().game as MockGameState;
    expect(gameState.hohId).toBe(getState(store).winnerId);
  });

  it('calling the thunk a second time is a no-op (winner applied exactly once)', () => {
    const store = makeStore('hoh_comp');
    driveToComplete(store);

    // First call — applies winner
    store.dispatch(resolveRiskWheelOutcome());
    const firstHohId = (store.getState().game as MockGameState).hohId;
    expect(firstHohId).not.toBeNull();

    // Spy on dispatch AFTER the first call so we can detect any inner
    // dispatches that would indicate the winner is being applied again.
    const dispatchSpy = vi.spyOn(store, 'dispatch');

    // Second call — should be a no-op
    store.dispatch(resolveRiskWheelOutcome());

    // No inner action dispatches should have occurred.
    const innerCalls = dispatchSpy.mock.calls.filter(
      (c) => typeof c[0] === 'object' && 'type' in (c[0] as object),
    );
    expect(innerCalls).toHaveLength(0);

    // hohId unchanged from first call.
    expect((store.getState().game as MockGameState).hohId).toBe(firstHohId);
  });

  it('outcomeResolved stays true after multiple thunk calls', () => {
    const store = makeStore('hoh_comp');
    driveToComplete(store);

    store.dispatch(resolveRiskWheelOutcome());
    store.dispatch(resolveRiskWheelOutcome());
    store.dispatch(resolveRiskWheelOutcome());

    expect(getState(store).outcomeResolved).toBe(true);
  });
});
