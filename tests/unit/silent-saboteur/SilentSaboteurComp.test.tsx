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

describe('SilentSaboteurComp — cinematic polish', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    document.body.classList.remove('no-animations');
  });

  afterEach(() => {
    vi.useRealTimers();
    document.body.classList.remove('no-animations');
  });

  it('shows the merged intro avatar grid and auto-advances after 3 seconds', async () => {
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

    expect(screen.getByTestId('ss-intro-screen')).toBeInTheDocument();
    expect(screen.getByLabelText('Houseguests')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /continue/i })).not.toBeInTheDocument();

    await act(async () => {
      vi.advanceTimersByTime(3000);
    });

    expect(ss(store).phase).toBe('select_victim');
  });

  it('keeps the bomb reveal on screen until Continue is clicked', async () => {
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

    await act(async () => {
      store.dispatch(advanceIntro());
    });

    const state = ss(store);
    const victimId = state.activeIds.find((id) => id !== state.saboteurId)!;

    await act(async () => {
      store.dispatch(selectVictim({ victimId }));
    });

    expect(screen.getByTestId('ss-bomb-reveal')).toBeInTheDocument();
    expect(screen.getByTestId('ss-bomb-reveal-continue-btn')).toBeInTheDocument();

    await act(async () => {
      vi.advanceTimersByTime(2500);
    });

    expect(screen.getByTestId('ss-bomb-reveal')).toBeInTheDocument();

    await act(async () => {
      fireEvent.click(screen.getByTestId('ss-bomb-reveal-continue-btn'));
    });

    expect(screen.queryByTestId('ss-bomb-reveal')).not.toBeInTheDocument();
    expect(screen.getByTestId('ss-investigation-screen')).toBeInTheDocument();
    expect(screen.getByLabelText('Saboteur suspects')).toBeInTheDocument();
  });

  it('requires Continue through accusation, elimination, and aftermath beats', async () => {
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

    const voters = ss(store).activeIds;

    await act(async () => {
      for (const voter of voters) {
        const accusedId = voters.find((id) => id !== voter && id !== victimId) ?? voters[0];
        store.dispatch(submitVote({ voterId: voter, accusedId }));
      }
      if (ss(store).phase === 'voting') {
        store.dispatch(endVotingPhase());
      }
    });

    await act(async () => {
      vi.advanceTimersByTime(5000);
    });

    expect(screen.getByTestId('ss-accusation-result')).toBeInTheDocument();
    expect(screen.getByTestId('ss-reveal-result-continue-btn')).toBeInTheDocument();

    await act(async () => {
      fireEvent.click(screen.getByTestId('ss-reveal-result-continue-btn'));
    });

    expect(screen.getByTestId('ss-elimination-card')).toBeInTheDocument();
    expect(screen.getByTestId('ss-elimination-continue-btn')).toBeInTheDocument();

    await act(async () => {
      fireEvent.click(screen.getByTestId('ss-elimination-continue-btn'));
    });

    expect(screen.getByTestId('ss-aftermath-card')).toBeInTheDocument();
    expect(screen.getByTestId('ss-round-transition-continue-btn')).toBeInTheDocument();
    expect(ss(store).phase).toBe('round_transition');

    await act(async () => {
      vi.advanceTimersByTime(2500);
    });

    expect(ss(store).phase).toBe('round_transition');

    await act(async () => {
      fireEvent.click(screen.getByTestId('ss-round-transition-continue-btn'));
    });

    expect(ss(store).phase).toBe('select_victim');
  });

  it('goes straight to accusation result when animations are disabled and still waits for Continue', async () => {
    const store = makeStore();
    document.body.classList.add('no-animations');

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

    const voters = ss(store).activeIds;

    await act(async () => {
      for (const voter of voters) {
        const accusedId = voters.find((id) => id !== voter && id !== victimId) ?? voters[0];
        store.dispatch(submitVote({ voterId: voter, accusedId }));
      }
      if (ss(store).phase === 'voting') {
        store.dispatch(endVotingPhase());
      }
    });

    expect(screen.getByTestId('ss-accusation-result')).toBeInTheDocument();
    expect(screen.getByTestId('ss-reveal-result-continue-btn')).toBeInTheDocument();
    expect(screen.queryByTestId('ss-vote-reveal')).not.toBeInTheDocument();

    await act(async () => {
      vi.advanceTimersByTime(3000);
    });

    expect(screen.getByTestId('ss-accusation-result')).toBeInTheDocument();
  });
});
