import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act, fireEvent } from '@testing-library/react';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import silentSaboteurReducer, {
  advanceIntro,
  selectVictim,
  submitVote,
  endVotingPhase,
} from '../../../src/features/silentSaboteur/silentSaboteurSlice';
import type { SilentSaboteurState } from '../../../src/features/silentSaboteur/silentSaboteurSlice';
import SilentSaboteurComp from '../../../src/components/SilentSaboteurComp/SilentSaboteurComp';

function makeStore() {
  return configureStore({
    reducer: {
      silentSaboteur: silentSaboteurReducer,
    },
  });
}

function ss(store: ReturnType<typeof makeStore>): SilentSaboteurState {
  return store.getState().silentSaboteur;
}

const PARTICIPANTS = [
  { id: 'user', name: 'You', isHuman: true, precomputedScore: 0, previousPR: null },
  { id: 'finn', name: 'Finn', isHuman: false, precomputedScore: 0, previousPR: null },
  { id: 'mimi', name: 'Mimi', isHuman: false, precomputedScore: 0, previousPR: null },
  { id: 'rae', name: 'Rae', isHuman: false, precomputedScore: 0, previousPR: null },
];

const AI_ONLY_FINALISTS = [
  { id: 'finn', name: 'Finn', isHuman: false, precomputedScore: 0, previousPR: null },
  { id: 'mimi', name: 'Mimi', isHuman: false, precomputedScore: 0, previousPR: null },
];

describe('SilentSaboteurComp — dramatic UI flow', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    document.body.classList.remove('no-animations');
  });

  afterEach(() => {
    vi.useRealTimers();
    document.body.classList.remove('no-animations');
  });

  it('shows a dedicated bomb reveal screen before the voting UI appears', async () => {
    const store = makeStore();

    render(
      <Provider store={store}>
        <SilentSaboteurComp
          participantIds={PARTICIPANTS.map((p) => p.id)}
          participants={PARTICIPANTS}
          prizeType="HOH"
          seed={42}
          standalone={true}
        />
      </Provider>,
    );

    await act(async () => {});

    await act(async () => {
      vi.advanceTimersByTime(7000);
    });

    const state = ss(store);
    expect(state.phase).toBe('select_victim');

    const victimId = state.activeIds.find((id) => id !== state.saboteurId)!;
    const victimName = PARTICIPANTS.find((p) => p.id === victimId)?.name ?? victimId;
    const expectedPortrait = `avatars/${victimName}.png`;

    await act(async () => {
      store.dispatch(selectVictim({ victimId }));
    });

    expect(screen.getByTestId('ss-bomb-reveal')).toBeInTheDocument();
    expect(screen.getByText('A bomb has been planted.')).toBeInTheDocument();
    expect(screen.getByTestId('ss-bomb-reveal-continue-btn')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /accuse/i })).not.toBeInTheDocument();
    const portrait = screen.getByTestId(`ss-portrait-${victimId}`);
    expect(portrait?.getAttribute('src')).toContain(expectedPortrait);
    expect(portrait?.getAttribute('src')).not.toContain('api.dicebear.com');

    await act(async () => {
      fireEvent.click(screen.getByTestId('ss-bomb-reveal-continue-btn'));
    });

    expect(screen.queryByTestId('ss-bomb-reveal')).not.toBeInTheDocument();
    expect(screen.queryByText(/investigation/i)).toBeInTheDocument();
  });

  it('waits for manual Continue from bomb reveal through accusation result, elimination result, and round summary phases', async () => {
    const store = makeStore();

    render(
      <Provider store={store}>
        <SilentSaboteurComp
          participantIds={PARTICIPANTS.map((p) => p.id)}
          participants={PARTICIPANTS}
          prizeType="HOH"
          seed={7}
          standalone={true}
        />
      </Provider>,
    );

    await act(async () => {});

    await act(async () => {
      store.dispatch(advanceIntro());
    });

    const selecting = ss(store);
    const victimId = selecting.activeIds.find((id) => id !== selecting.saboteurId)!;

    await act(async () => {
      store.dispatch(selectVictim({ victimId }));
    });

    await act(async () => {
      fireEvent.click(screen.getByTestId('ss-bomb-reveal-continue-btn'));
    });

    expect(screen.queryByLabelText('Active suspects')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Accuse a saboteur')).toBeInTheDocument();

    // Submit valid votes: each voter picks a valid suspect (not self, not victim)
    const voters = ss(store).activeIds;
    function pickValidVote(voter: string): string {
      return voters.find((id) => id !== voter && id !== victimId) ?? voters[0];
    }

    await act(async () => {
      for (const voter of voters) {
        store.dispatch(submitVote({ voterId: voter, accusedId: pickValidVote(voter) }));
      }
      // If auto-advance didn't fire (e.g. all candidates exhausted), end manually
      if (ss(store).phase === 'voting') {
        store.dispatch(endVotingPhase());
      }
    });

    expect(ss(store).phase).toBe('reveal');
    expect(screen.queryByText(/Vote 1/)).not.toBeInTheDocument();

    await act(async () => {
      vi.advanceTimersByTime(1200);
    });

    expect(screen.getByText(/Vote\s+\d+/)).toBeInTheDocument();

    await act(async () => {
      vi.advanceTimersByTime(8000);
    });

    expect(screen.getByTestId('ss-reveal-result-continue-btn')).toBeInTheDocument();
    expect(ss(store).phase).toBe('reveal');

    await act(async () => {
      fireEvent.click(screen.getByTestId('ss-reveal-result-continue-btn'));
    });

    expect(screen.getByTestId('ss-elimination-continue-btn')).toBeInTheDocument();
    expect(
      screen.getByText(/has been eliminated/),
    ).toBeInTheDocument();

    await act(async () => {
      fireEvent.click(screen.getByTestId('ss-elimination-continue-btn'));
    });

    expect(ss(store).phase).toBe('round_transition');
    expect(screen.getByTestId('ss-round-transition-continue-btn')).toBeInTheDocument();

    await act(async () => {
      vi.advanceTimersByTime(5000);
    });

    expect(ss(store).phase).toBe('round_transition');

    await act(async () => {
      fireEvent.click(screen.getByTestId('ss-round-transition-continue-btn'));
    });

    expect(ss(store).phase).toBe('select_victim');
  });

  it('keeps the non-Final-2 winner screen on screen until Continue is clicked', async () => {
    const store = makeStore();
    const onComplete = vi.fn();
    document.body.classList.add('no-animations');

    render(
      <Provider store={store}>
        <SilentSaboteurComp
          participantIds={AI_ONLY_FINALISTS.map((p) => p.id)}
          participants={AI_ONLY_FINALISTS}
          prizeType="HOH"
          seed={42}
          standalone={true}
          onComplete={onComplete}
        />
      </Provider>,
    );

    await act(async () => {
      store.dispatch(advanceIntro());
    });

    const selecting = ss(store);
    const victimId = selecting.activeIds.find((id) => id !== selecting.saboteurId)!;

    await act(async () => {
      store.dispatch(selectVictim({ victimId }));
    });

    await act(async () => {
      fireEvent.click(screen.getByTestId('ss-bomb-reveal-continue-btn'));
      store.dispatch(endVotingPhase());
    });

    await act(async () => {
      fireEvent.click(screen.getByTestId('ss-reveal-result-continue-btn'));
    });

    await act(async () => {
      fireEvent.click(screen.getByTestId('ss-elimination-continue-btn'));
    });

    expect(ss(store).phase).toBe('winner');
    expect(screen.getByTestId('ss-winner-continue-btn')).toBeInTheDocument();

    await act(async () => {
      vi.advanceTimersByTime(10_000);
    });

    expect(ss(store).phase).toBe('winner');
    expect(onComplete).not.toHaveBeenCalled();

    await act(async () => {
      fireEvent.click(screen.getByTestId('ss-winner-continue-btn'));
    });

    expect(ss(store).phase).toBe('complete');
    expect(onComplete).toHaveBeenCalledTimes(1);
  });
});
