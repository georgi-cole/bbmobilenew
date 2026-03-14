import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import silentSaboteurReducer, {
  advanceIntro,
  selectVictim,
  submitVote,
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
  { id: 'a1', name: 'Alice', isHuman: false, precomputedScore: 0, previousPR: null },
  { id: 'a2', name: 'Bob', isHuman: false, precomputedScore: 0, previousPR: null },
  { id: 'a3', name: 'Carol', isHuman: false, precomputedScore: 0, previousPR: null },
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
      vi.advanceTimersByTime(2500);
    });

    const state = ss(store);
    expect(state.phase).toBe('select_victim');

    const victimId = state.activeIds.find((id) => id !== state.saboteurId)!;

    await act(async () => {
      store.dispatch(selectVictim({ victimId }));
    });

    expect(screen.getByTestId('ss-bomb-reveal')).toBeInTheDocument();
    expect(screen.getByText('BOMB_REVEAL_PHASE')).toBeInTheDocument();
    expect(screen.getByText('💣 A bomb has been planted!')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /accuse/i })).not.toBeInTheDocument();
  });

  it('reveals votes sequentially before showing the elimination result', async () => {
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

    const voters = ss(store).activeIds;
    await act(async () => {
      store.dispatch(submitVote({ voterId: voters[0], accusedId: voters[1] }));
      store.dispatch(submitVote({ voterId: voters[1], accusedId: voters[2] }));
      store.dispatch(submitVote({ voterId: voters[2], accusedId: voters[3] }));
      store.dispatch(submitVote({ voterId: voters[3], accusedId: voters[0] }));
    });

    expect(ss(store).phase).toBe('reveal');
    expect(screen.getByText('RESOLUTION_PHASE')).toBeInTheDocument();
    expect(screen.queryByText(/Vote 1/)).not.toBeInTheDocument();

    await act(async () => {
      vi.advanceTimersByTime(700);
    });

    expect(screen.getByText(/Vote 1/)).toBeInTheDocument();

    await act(async () => {
      vi.advanceTimersByTime(2600);
    });

    expect(screen.getByText('ELIMINATION_PHASE')).toBeInTheDocument();
    expect(
      screen.getByText(/The saboteur has been exposed!|Wrong choice!/),
    ).toBeInTheDocument();
  });
});
