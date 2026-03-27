import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import QuickTapRace from '../src/components/QuickTapRace/QuickTapRace';
import { selectBoosterPrompts } from '../src/ai/competition/quickTapSimulation';

vi.mock('../src/components/QuickTapRace/QuickTapRace.css', () => ({}));
vi.mock('../src/hooks/useQuickTapRaceAudio', () => ({
  useQuickTapRaceAudio: () => ({
    playTap: vi.fn(),
    playBooster: vi.fn(),
    playHalfTap: vi.fn(),
  }),
}));

function renderQuickTapRace() {
  const store = configureStore({
    reducer: {
      game: (
        state = {
          players: [{ id: 'p0', name: 'You', avatar: '🙂', status: 'active', isUser: true }],
        },
      ) => state,
    },
  });

  return render(
    <Provider store={store}>
      <QuickTapRace seed={42} autoStart onFinish={vi.fn()} />
    </Provider>,
  );
}

describe('QuickTapRace mystery booster prompt', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('hides the actual booster details until the player taps it', () => {
    const [firstPrompt] = selectBoosterPrompts(42);
    renderQuickTapRace();

    act(() => {
      vi.advanceTimersByTime(6200);
    });

    expect(screen.getByRole('button', { name: /grab mystery booster/i })).toBeInTheDocument();
    expect(screen.getByText('MYSTERY BOOSTER')).toBeInTheDocument();
    expect(screen.queryByText(firstPrompt.label)).not.toBeInTheDocument();
    expect(screen.queryByText(firstPrompt.icon)).not.toBeInTheDocument();
  });
});
