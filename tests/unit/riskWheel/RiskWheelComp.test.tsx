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
import gameReducer from '../../../src/store/gameSlice';

const mockAudio = vi.hoisted(() => ({
  startWheelSound: vi.fn(),
  stopWheelSound: vi.fn(),
  playGoodRewardSound: vi.fn(),
  playBadRewardSound: vi.fn(),
  play666Sound: vi.fn(),
  playBankruptOrSkipSound: vi.fn(),
  playScoreboardRevealSound: vi.fn(),
  playWinnerRevealSound: vi.fn(),
  playStopAndBankSound: vi.fn(),
  playClickSound: vi.fn(),
}));

vi.mock('../../../src/hooks/useRiskWheelAudio', () => ({
  useRiskWheelAudio: () => mockAudio,
}));

function makeStore() {
  return configureStore({
    reducer: {
      riskWheel: riskWheelReducer,
      game: gameReducer,
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
  it('keeps the classic skin by default and enables the VIP skin only when requested', async () => {
    const classicStore = makeStore();
    const classic = render(
      <Provider store={classicStore}>
        <RiskWheelComp
          participantIds={['human', 'ai-1']}
          participants={[
            { id: 'human', name: 'Human', isHuman: true },
            { id: 'ai-1', name: 'AI 1', isHuman: false },
          ]}
          prizeType="LOH"
          seed={42}
          standalone
        />
      </Provider>,
    );

    await screen.findByRole('button', { name: /spin the wheel/i });
    expect(classic.container.querySelector('.rw-root--vip')).toBeNull();
    classic.unmount();

    const vipStore = makeStore();
    const vip = render(
      <Provider store={vipStore}>
        <RiskWheelComp
          participantIds={['human', 'ai-1']}
          participants={[
            { id: 'human', name: 'Human', isHuman: true },
            { id: 'ai-1', name: 'AI 1', isHuman: false },
          ]}
          prizeType="LOH"
          seed={42}
          standalone
          premiumPresentation
        />
      </Provider>,
    );

    await screen.findByRole('button', { name: /spin the wheel/i });
    expect(vip.container.querySelector('.rw-root--vip')).not.toBeNull();
    expect(screen.getByLabelText(/VIP Risk Wheel/i)).toBeInTheDocument();
    expect(vip.container.querySelectorAll('.rw-wheel-sector--vip')).toHaveLength(
      WHEEL_SECTORS.length,
    );
  });

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
          prizeType="LOH"
          seed={seed}
          standalone
        />
      </Provider>,
    );

    await screen.findByRole('button', { name: /spin the wheel/i });

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

  it('plays playStopAndBankSound when the Stop and Bank button is clicked', async () => {
    mockAudio.playStopAndBankSound.mockClear();

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
          prizeType="LOH"
          seed={seed}
          standalone
        />
      </Provider>,
    );

    await screen.findByRole('button', { name: /spin the wheel/i });

    await act(async () => {
      store.dispatch(performSpin());
    });

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /stop and bank/i }));
    });

    expect(mockAudio.playStopAndBankSound).toHaveBeenCalledTimes(1);
  });

  it('plays playClickSound when the Start Next Round button is clicked', async () => {
    mockAudio.playClickSound.mockClear();

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
          prizeType="LOH"
          seed={seed}
          standalone
        />
      </Provider>,
    );

    await screen.findByRole('button', { name: /spin the wheel/i });

    await act(async () => {
      store.dispatch(performSpin());
    });

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /stop and bank/i }));
    });

    // Now in round_summary; click "Start Round 2"
    const nextRoundBtn = screen.getByRole('button', { name: /start round 2/i });
    await act(async () => {
      fireEvent.click(nextRoundBtn);
    });

    expect(mockAudio.playClickSound).toHaveBeenCalledTimes(1);
  });
});
