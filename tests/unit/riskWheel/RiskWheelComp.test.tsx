import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import RiskWheelComp from '../../../src/components/RiskWheelComp/RiskWheelComp';
import riskWheelReducer, {
  performSpin,
  WHEEL_SECTORS,
  pickSectorIndex,
} from '../../../src/features/riskWheel/riskWheelSlice';

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

function makeStore() {
  return configureStore({
    reducer: {
      riskWheel: riskWheelReducer,
    },
  });
}

function findPositivePointsSeed(): number {
  let seed = 1;
  while (
    WHEEL_SECTORS[pickSectorIndex(seed, 0)].type !== 'points' ||
    (WHEEL_SECTORS[pickSectorIndex(seed, 0)].value ?? 0) <= 0
  ) {
    seed += 1;
  }
  return seed;
}

describe('RiskWheelComp', () => {
  it('advances straight to round results when the human taps Stop and Bank', async () => {
    const store = makeStore();
    const seed = findPositivePointsSeed();

    render(
      <Provider store={store}>
        <RiskWheelComp
          participantIds={['human', 'ai-1', 'ai-2']}
          participants={[
            { id: 'human', name: 'Human', isHuman: true },
            { id: 'ai-1', name: 'AI 1', isHuman: false },
            { id: 'ai-2', name: 'AI 2', isHuman: false },
          ]}
          prizeType="HOH"
          seed={seed}
          standalone
        />
      </Provider>,
    );

    await act(async () => {});

    await act(async () => {
      store.dispatch(performSpin());
    });

    const stopAndBankButton = screen.getByRole('button', { name: /stop and bank/i });
    expect(screen.queryByRole('button', { name: /continue/i })).not.toBeInTheDocument();

    await act(async () => {
      fireEvent.click(stopAndBankButton);
    });

    expect(screen.getByRole('heading', { name: 'Results' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /continue/i })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /start round 2/i })).toBeInTheDocument();
  });
});
