import { render, waitFor } from '@testing-library/react';
import { configureStore } from '@reduxjs/toolkit';
import { Provider } from 'react-redux';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import RiskWheelComp from '../../../src/components/RiskWheelComp/RiskWheelComp';
import type { RiskWheelState } from '../../../src/features/riskWheel/riskWheelSlice';

const { initRiskWheelMock, resolveRiskWheelOutcomeMock } = vi.hoisted(() => ({
  initRiskWheelMock: vi.fn(() => ({ type: 'riskWheel/initMock' })),
  resolveRiskWheelOutcomeMock: vi.fn(() => ({ type: 'riskWheel/resolveMock' })),
}));

vi.mock('../../../src/features/riskWheel/riskWheelSlice', async () => {
  const actual = await vi.importActual<typeof import('../../../src/features/riskWheel/riskWheelSlice')>(
    '../../../src/features/riskWheel/riskWheelSlice',
  );
  return {
    ...actual,
    initRiskWheel: initRiskWheelMock,
  };
});

vi.mock('../../../src/features/riskWheel/thunks', () => ({
  resolveRiskWheelOutcome: resolveRiskWheelOutcomeMock,
}));

vi.mock('../../../src/hooks/useRiskWheelAudio', () => ({
  useRiskWheelAudio: () => ({
    startWheelSound: vi.fn(),
    stopWheelSound: vi.fn(),
    playGoodRewardSound: vi.fn(),
    playBadRewardSound: vi.fn(),
    playScoreboardRevealSound: vi.fn(),
    playWinnerRevealSound: vi.fn(),
  }),
}));

const PARTICIPANTS = [
  { id: 'p0', name: 'Dex', isHuman: true, precomputedScore: 0, previousPR: null },
  { id: 'p1', name: 'AI-1', isHuman: false, precomputedScore: 0, previousPR: null },
];

function makeRiskWheelState(overrides: Partial<RiskWheelState> = {}): RiskWheelState {
  return {
    competitionType: 'HOH',
    phase: 'complete',
    allPlayerIds: ['p0', 'p1'],
    activePlayerIds: ['p0', 'p1'],
    eliminatedPlayerIds: [],
    humanPlayerId: 'p0',
    initialPlayerCount: 2,
    round: 3,
    roundScores: { p0: 100, p1: 80 },
    playersCompletedThisRound: ['p0', 'p1'],
    currentPlayerIndex: 0,
    currentSpinCount: 3,
    lastSectorIndex: 0,
    last666Effect: null,
    eliminatedThisRound: [],
    winnerId: 'p0',
    seed: 123,
    rngCallCount: 1,
    aiDecisionCallCount: 0,
    aiPersonalities: {},
    aiDecisionCounts: {},
    outcomeResolved: false,
    finalScores: { p0: 100, p1: 80 },
    ...overrides,
  };
}

function renderComponent({
  gamePhase,
  riskWheelState,
  onComplete = vi.fn(),
}: {
  gamePhase: string;
  riskWheelState: RiskWheelState;
  onComplete?: ReturnType<typeof vi.fn>;
}) {
  const store = configureStore({
    reducer: {
      riskWheel: (state: RiskWheelState = riskWheelState) => state,
      game: (state = { phase: gamePhase }) => state,
    },
  });

  const view = render(
    <Provider store={store}>
      <RiskWheelComp
        participantIds={PARTICIPANTS.map((p) => p.id)}
        participants={PARTICIPANTS}
        onComplete={onComplete}
      />
    </Provider>,
  );

  return { ...view, onComplete, store };
}

describe('RiskWheelComp completion flow', () => {
  beforeEach(() => {
    initRiskWheelMock.mockClear();
    resolveRiskWheelOutcomeMock.mockClear();
  });

  it('auto-completes hosted Final 3 winner screens without waiting for outcomeResolved', async () => {
    const { onComplete } = renderComponent({
      gamePhase: 'final3_comp3_minigame',
      riskWheelState: makeRiskWheelState({ outcomeResolved: false }),
    });

    await waitFor(() => {
      expect(onComplete).toHaveBeenCalledWith({ authoritativeWinnerId: 'p0' });
    });
    expect(onComplete).toHaveBeenCalledTimes(1);
    expect(resolveRiskWheelOutcomeMock).not.toHaveBeenCalled();
  });

  it('still resolves normal hosted HOH runs through the outcome thunk first', async () => {
    const { onComplete } = renderComponent({
      gamePhase: 'hoh_comp',
      riskWheelState: makeRiskWheelState({ outcomeResolved: false }),
    });

    await waitFor(() => {
      expect(resolveRiskWheelOutcomeMock).toHaveBeenCalledTimes(1);
    });
    expect(onComplete).not.toHaveBeenCalled();
  });

  it('still completes normal hosted runs after outcomeResolved is true', async () => {
    const { onComplete } = renderComponent({
      gamePhase: 'hoh_comp',
      riskWheelState: makeRiskWheelState({ outcomeResolved: true }),
    });

    await waitFor(() => {
      expect(onComplete).toHaveBeenCalledWith({ authoritativeWinnerId: 'p0' });
    });
    expect(onComplete).toHaveBeenCalledTimes(1);
    expect(resolveRiskWheelOutcomeMock).not.toHaveBeenCalled();
  });

  it('does not report hosted Final 3 completion more than once after a re-render', async () => {
    const { onComplete, rerender, store } = renderComponent({
      gamePhase: 'final3_comp3_minigame',
      riskWheelState: makeRiskWheelState({ outcomeResolved: false }),
    });

    await waitFor(() => {
      expect(onComplete).toHaveBeenCalledTimes(1);
    });

    rerender(
      <Provider store={store}>
        <RiskWheelComp
          participantIds={PARTICIPANTS.map((p) => p.id)}
          participants={PARTICIPANTS}
          onComplete={onComplete}
        />
      </Provider>,
    );

    await waitFor(() => {
      expect(onComplete).toHaveBeenCalledTimes(1);
    });
    expect(resolveRiskWheelOutcomeMock).not.toHaveBeenCalled();
  });
});
