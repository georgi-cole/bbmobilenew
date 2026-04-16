import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act, within } from '@testing-library/react';
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

// autoStart skips the long ready state, then the first Quick Tap booster is
// scheduled for 6 seconds into play. A small buffer ensures the prompt is visible.
const FIRST_BOOSTER_PROMPT_MS = 6200;

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
      vi.advanceTimersByTime(FIRST_BOOSTER_PROMPT_MS);
    });

    const boosterButton = screen.getByRole('button', { name: /grab mystery booster/i });
    expect(boosterButton).toBeInTheDocument();
    expect(within(boosterButton).getByText('MYSTERY BOOSTER')).toBeInTheDocument();
    expect(boosterButton).not.toHaveTextContent(firstPrompt.label);
    expect(boosterButton).not.toHaveTextContent(firstPrompt.icon);
  });
});
