import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
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

  it('auto-dismisses the bomb reveal and then shows avatar suspect tiles', async () => {
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
    expect(screen.queryByRole('button', { name: /continue/i })).not.toBeInTheDocument();

    await act(async () => {
      vi.advanceTimersByTime(2500);
    });

    expect(screen.queryByTestId('ss-bomb-reveal')).not.toBeInTheDocument();
    expect(screen.getByTestId('ss-investigation-screen')).toBeInTheDocument();
    expect(screen.getByLabelText('Saboteur suspects')).toBeInTheDocument();
  });

  it('reveals votes and elimination automatically before moving to the aftermath card', async () => {
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
      vi.advanceTimersByTime(2500);
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

    expect(screen.getByTestId('ss-elimination-card')).toBeInTheDocument();

    await act(async () => {
      vi.advanceTimersByTime(2500);
    });

    expect(screen.getByTestId('ss-aftermath-card')).toBeInTheDocument();
    expect(ss(store).phase).toBe('round_transition');

    await act(async () => {
      vi.advanceTimersByTime(2000);
    });

    expect(ss(store).phase).toBe('select_victim');
  });
});
