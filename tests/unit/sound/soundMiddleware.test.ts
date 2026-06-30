import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { configureStore } from '@reduxjs/toolkit';
import { soundMiddleware } from '../../../src/store/soundMiddleware';
import { SoundManager } from '../../../src/services/sound/SoundManager';

interface TestGameState {
  phase: string;
  evictionOverlayPlayerId: string | null;
  battleBack: { used: boolean; winnerId: string | null } | null;
}

function makeTestStore(initialPhase = 'week_start') {
  let nextPhase = initialPhase;
  const initialGameState: TestGameState = {
    phase: initialPhase,
    evictionOverlayPlayerId: null,
    battleBack: null,
  };

  const gameReducer = (
    state: TestGameState = initialGameState,
    action: { type: string; payload?: unknown },
  ) => {
    if (action.type === '__SET_NEXT_PHASE__') return state;
    if (action.type === 'game/advance') return { ...state, phase: nextPhase };
    if (action.type === 'game/setPhase' || action.type === 'game/forcePhase') {
      return { ...state, phase: action.payload as string };
    }
    if (action.type === 'game/setEvictionOverlay') {
      return { ...state, evictionOverlayPlayerId: action.payload as string | null };
    }
    if (action.type === 'game/clearEvictionOverlay') {
      if (state.evictionOverlayPlayerId === (action.payload as string)) {
        return { ...state, evictionOverlayPlayerId: null };
      }
      return state;
    }
    if (action.type === '__SET_BATTLE_BACK__') {
      return { ...state, battleBack: action.payload as TestGameState['battleBack'] };
    }
    return state;
  };

  const socialReducer = (state = { panelOpen: false, incomingInboxOpen: false }, action: { type: string }) => {
    if (action.type === 'social/openSocialPanel') return { ...state, panelOpen: true };
    if (action.type === 'social/closeSocialPanel') return { ...state, panelOpen: false };
    if (action.type === 'social/openIncomingInbox') return { ...state, incomingInboxOpen: true };
    if (action.type === 'social/closeIncomingInbox') return { ...state, incomingInboxOpen: false };
    return state;
  };

  const store = configureStore({
    reducer: { game: gameReducer, social: socialReducer },
    middleware: (getDefault) => getDefault({ serializableCheck: false }).concat(soundMiddleware),
  });

  return {
    store,
    setNextPhase(phase: string) {
      nextPhase = phase;
    },
  };
}

let playMock: ReturnType<typeof vi.spyOn>;
let requestBgmMock: ReturnType<typeof vi.spyOn>;
let releaseBgmMock: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  makeTestStore().store.dispatch({ type: 'game/resetGame' });
  playMock = vi.spyOn(SoundManager, 'play').mockResolvedValue(undefined);
  requestBgmMock = vi.spyOn(SoundManager, 'requestBgm').mockImplementation(() => {});
  releaseBgmMock = vi.spyOn(SoundManager, 'releaseBgm').mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('soundMiddleware music-free phase policy', () => {
  it('plays only the minigame start stinger for loh_comp', () => {
    const { store, setNextPhase } = makeTestStore();
    setNextPhase('loh_comp');

    store.dispatch({ type: 'game/advance' });

    expect(playMock).toHaveBeenCalledWith('minigame:start');
    expect(requestBgmMock).not.toHaveBeenCalled();
    expect(releaseBgmMock).not.toHaveBeenCalled();
  });

  it('plays only the event stinger for loh_results', () => {
    const { store, setNextPhase } = makeTestStore();
    setNextPhase('loh_results');

    store.dispatch({ type: 'game/advance' });

    expect(playMock).toHaveBeenCalledWith('tv:event');
    expect(requestBgmMock).not.toHaveBeenCalled();
    expect(releaseBgmMock).not.toHaveBeenCalled();
  });

  it('plays only the veto ceremony stinger for pos_ceremony', () => {
    const { store, setNextPhase } = makeTestStore();
    setNextPhase('pos_ceremony');

    store.dispatch({ type: 'game/advance' });

    expect(playMock).toHaveBeenCalledWith('tv:veto_ceremony');
    expect(requestBgmMock).not.toHaveBeenCalled();
  });

  it('plays only the voting stinger for live_vote', () => {
    const { store, setNextPhase } = makeTestStore();
    setNextPhase('live_vote');

    store.dispatch({ type: 'game/advance' });

    expect(playMock).toHaveBeenCalledWith('tv:voting_eviction');
    expect(requestBgmMock).not.toHaveBeenCalled();
    expect(releaseBgmMock).not.toHaveBeenCalled();
  });

  it('does not call legacy music APIs for week boundaries or social panel toggles', () => {
    const { store, setNextPhase } = makeTestStore();
    setNextPhase('week_end');

    store.dispatch({ type: 'game/advance' });
    store.dispatch({ type: 'social/openSocialPanel' });
    store.dispatch({ type: 'social/closeSocialPanel' });
    store.dispatch({ type: 'social/openIncomingInbox' });
    store.dispatch({ type: 'social/closeIncomingInbox' });

    expect(requestBgmMock).not.toHaveBeenCalled();
    expect(releaseBgmMock).not.toHaveBeenCalled();
  });
});

describe('soundMiddleware eviction and finale SFX', () => {
  it('plays the eviction stinger on a null->id overlay transition only', () => {
    const { store } = makeTestStore();

    store.dispatch({ type: 'game/setEvictionOverlay', payload: 'player-1' });
    store.dispatch({ type: 'game/setEvictionOverlay', payload: 'player-1' });

    expect(playMock).toHaveBeenCalledTimes(1);
    expect(playMock).toHaveBeenCalledWith('player:evicted');
    expect(requestBgmMock).not.toHaveBeenCalled();
    expect(releaseBgmMock).not.toHaveBeenCalled();
  });

  it('replays the eviction stinger for a second eviction after the first overlay clears', () => {
    const { store } = makeTestStore();

    store.dispatch({ type: 'game/setEvictionOverlay', payload: 'player-1' });
    store.dispatch({ type: 'game/setEvictionOverlay', payload: null });
    store.dispatch({ type: 'game/setEvictionOverlay', payload: 'player-2' });

    expect(playMock).toHaveBeenCalledTimes(2);
    expect(playMock).toHaveBeenNthCalledWith(1, 'player:evicted');
    expect(playMock).toHaveBeenNthCalledWith(2, 'player:evicted');
  });

  it('suppresses eviction SFX for a Battle Back return overlay', () => {
    const { store } = makeTestStore();
    store.dispatch({
      type: '__SET_BATTLE_BACK__',
      payload: { used: true, winnerId: 'player-bb' },
    });
    vi.clearAllMocks();
    playMock = vi.spyOn(SoundManager, 'play').mockResolvedValue(undefined);

    store.dispatch({ type: 'game/setEvictionOverlay', payload: 'player-bb' });

    expect(playMock).not.toHaveBeenCalledWith('player:evicted');
  });

  it('plays the winner reveal stinger for startWinnerCinematic', () => {
    const { store } = makeTestStore();

    store.dispatch({ type: 'game/startWinnerCinematic' });

    expect(playMock).toHaveBeenCalledWith('tv:winner_reveal');
    expect(requestBgmMock).not.toHaveBeenCalled();
    expect(releaseBgmMock).not.toHaveBeenCalled();
  });
});
