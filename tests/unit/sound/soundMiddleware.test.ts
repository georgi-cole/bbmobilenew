/**
 * Tests for soundMiddleware phase-driven audio policy.
 *
 * Covers:
 *  1. game/advance dispatches — phase → SoundManager.play/requestBgm/releaseBgm
 *  2. game/setPhase / game/forcePhase dispatch — same policy applied
 *  3. Social-music override guard — requestBgm/releaseBgm not called while
 *     _socialMusicActive is true
 *  4. game/setEvictionOverlay — eviction SFX, idempotency, and Battle Back gate
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { configureStore } from '@reduxjs/toolkit';
import { soundMiddleware } from '../../../src/store/soundMiddleware';
import { SoundManager } from '../../../src/services/sound/SoundManager';

// ── helpers ───────────────────────────────────────────────────────────────────

interface TestGameState {
  phase: string;
  evictionOverlayPlayerId: string | null;
  battleBack: { used: boolean; winnerId: string | null } | null;
}

/**
 * Build a minimal Redux store wired with soundMiddleware.
 * The game reducer is replaced with a simple identity reducer that stores
 * whatever phase is injected via SET_PHASE_FOR_TEST, so we don't need to
 * reproduce all of gameSlice's real transition logic.
 */
function makeTestStore(initialPhase = 'week_start') {
  // Minimal game reducer: responds to our test-only SET_PHASE_FOR_TEST action
  // and to game/advance by reading the pre-set nextPhase.
  let _nextPhase = initialPhase;
  const initialGameState: TestGameState = {
    phase: initialPhase,
    evictionOverlayPlayerId: null,
    battleBack: null,
  };
  const gameReducer = (
    state: TestGameState = initialGameState,
    action: { type: string; payload?: unknown },
  ) => {
    if (action.type === '__SET_NEXT_PHASE__') {
      _nextPhase = action.payload as string;
      return state; // don't change phase yet — advance() will commit it
    }
    if (action.type === 'game/advance') {
      return { ...state, phase: _nextPhase };
    }
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
      return { ...state, battleBack: action.payload as { used: boolean; winnerId: string | null } | null };
    }
    return state;
  };

  const socialReducer = (
    state = { panelOpen: false, incomingInboxOpen: false },
    action: { type: string; payload?: unknown },
  ) => {
    if (action.type === 'social/openSocialPanel') return { ...state, panelOpen: true };
    if (action.type === 'social/closeSocialPanel') return { ...state, panelOpen: false };
    if (action.type === 'social/openIncomingInbox') return { ...state, incomingInboxOpen: true };
    if (action.type === 'social/closeIncomingInbox') return { ...state, incomingInboxOpen: false };
    return state;
  };

  return configureStore({
    reducer: { game: gameReducer, social: socialReducer },
    middleware: (getDefault) => getDefault({ serializableCheck: false }).concat(soundMiddleware),
  });
}

/** Helper: advance the store to a given phase via game/advance. */
function advanceTo(store: ReturnType<typeof makeTestStore>, phase: string) {
  store.dispatch({ type: '__SET_NEXT_PHASE__', payload: phase });
  store.dispatch({ type: 'game/advance' });
}

/** Helper: set phase directly (like Debug panel). */
function setPhase(store: ReturnType<typeof makeTestStore>, phase: string) {
  store.dispatch({ type: 'game/setPhase', payload: phase });
}

/** Helper: forcePhase (like Debug panel). */
function forcePhase(store: ReturnType<typeof makeTestStore>, phase: string) {
  store.dispatch({ type: 'game/forcePhase', payload: phase });
}

// ── Setup / teardown ──────────────────────────────────────────────────────────

let playMock: ReturnType<typeof vi.spyOn>;
let requestBgmMock: ReturnType<typeof vi.spyOn>;
let releaseBgmMock: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  playMock = vi.spyOn(SoundManager, 'play').mockResolvedValue(undefined);
  requestBgmMock = vi.spyOn(SoundManager, 'requestBgm').mockImplementation(() => {});
  releaseBgmMock = vi.spyOn(SoundManager, 'releaseBgm').mockImplementation(() => {});
  // Reset the module-level _socialMusicActive flag by dispatching a full
  // open+close cycle.
  const s = makeTestStore();
  s.dispatch({ type: 'social/openSocialPanel' });
  s.dispatch({ type: 'social/closeSocialPanel' });
  // Reset the module-level _lastEvictionSfxId by dispatching setEvictionOverlay(null).
  s.dispatch({ type: 'game/setEvictionOverlay', payload: null });
  // Clear call history accumulated during the reset so tests start clean.
  vi.clearAllMocks();
  // Re-establish the spies (clearAllMocks removes mock implementations).
  playMock = vi.spyOn(SoundManager, 'play').mockResolvedValue(undefined);
  requestBgmMock = vi.spyOn(SoundManager, 'requestBgm').mockImplementation(() => {});
  releaseBgmMock = vi.spyOn(SoundManager, 'releaseBgm').mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ── 1. game/advance phase→audio policy ───────────────────────────────────────

describe('soundMiddleware — game/advance phase music policy', () => {
  it('loh_comp: starts music:hoh_comp_general and plays minigame:start', () => {
    const store = makeTestStore();
    advanceTo(store, 'loh_comp');
    expect(requestBgmMock).toHaveBeenCalledWith('music:hoh_comp_general', 'phase');
    expect(playMock).toHaveBeenCalledWith('minigame:start');
  });

  it('loh_results: starts music:hoh_comp_general and plays tv:event stinger', () => {
    const store = makeTestStore();
    advanceTo(store, 'loh_results');
    expect(requestBgmMock).toHaveBeenCalledWith('music:hoh_comp_general', 'phase');
    expect(playMock).toHaveBeenCalledWith('tv:event');
  });

  it('pos_comp: starts music:hoh_comp_general and plays minigame:start', () => {
    const store = makeTestStore();
    advanceTo(store, 'pos_comp');
    expect(requestBgmMock).toHaveBeenCalledWith('music:hoh_comp_general', 'phase');
    expect(playMock).toHaveBeenCalledWith('minigame:start');
  });

  it('pos_results: starts music:hoh_comp_general and plays tv:event stinger', () => {
    const store = makeTestStore();
    advanceTo(store, 'pos_results');
    expect(requestBgmMock).toHaveBeenCalledWith('music:hoh_comp_general', 'phase');
    expect(playMock).toHaveBeenCalledWith('tv:event');
  });

  it('nominations: starts music:nominations_main', () => {
    const store = makeTestStore();
    advanceTo(store, 'nominations');
    expect(requestBgmMock).toHaveBeenCalledWith('music:nominations_main', 'phase');
    expect(playMock).not.toHaveBeenCalledWith('tv:event');
  });

  it('nomination_results: starts music:nominations_main', () => {
    const store = makeTestStore();
    advanceTo(store, 'nomination_results');
    expect(requestBgmMock).toHaveBeenCalledWith('music:nominations_main', 'phase');
  });

  it('pos_ceremony: plays tv:veto_ceremony stinger + starts music:veto_phase', () => {
    const store = makeTestStore();
    advanceTo(store, 'pos_ceremony');
    expect(playMock).toHaveBeenCalledWith('tv:veto_ceremony');
    expect(requestBgmMock).toHaveBeenCalledWith('music:veto_phase', 'phase');
  });

  it('pos_ceremony_results: continues music:veto_phase WITHOUT replaying stinger', () => {
    const store = makeTestStore();
    advanceTo(store, 'pos_ceremony_results');
    // Stinger must NOT replay on results — it already fired on pos_ceremony
    expect(playMock).not.toHaveBeenCalledWith('tv:veto_ceremony');
    // Veto loop must still be started (in case of direct jump to results)
    expect(requestBgmMock).toHaveBeenCalledWith('music:veto_phase', 'phase');
  });

  it('live_vote: plays tv:voting_eviction stinger (no music change)', () => {
    const store = makeTestStore();
    advanceTo(store, 'live_vote');
    expect(playMock).toHaveBeenCalledWith('tv:voting_eviction');
    expect(requestBgmMock).not.toHaveBeenCalled();
    expect(releaseBgmMock).not.toHaveBeenCalled();
  });

  it('eviction_results: does NOT play player:evicted (deferred to cinematic overlay)', () => {
    const store = makeTestStore();
    advanceTo(store, 'eviction_results');
    expect(playMock).not.toHaveBeenCalledWith('player:evicted');
    expect(requestBgmMock).not.toHaveBeenCalled();
  });

  it('final4_eviction: does NOT play player:evicted (deferred to cinematic overlay)', () => {
    const store = makeTestStore();
    advanceTo(store, 'final4_eviction');
    expect(playMock).not.toHaveBeenCalledWith('player:evicted');
  });

  it('week_start: releases phase BGM (clean slate)', () => {
    const store = makeTestStore();
    advanceTo(store, 'week_start');
    expect(releaseBgmMock).toHaveBeenCalledWith('phase');
    expect(requestBgmMock).not.toHaveBeenCalled();
  });

  it('week_end: releases phase BGM (clean slate)', () => {
    const store = makeTestStore();
    advanceTo(store, 'week_end');
    expect(releaseBgmMock).toHaveBeenCalledWith('phase');
    expect(requestBgmMock).not.toHaveBeenCalled();
  });

  it('social_1 / social_2: no music or SFX triggered', () => {
    const store = makeTestStore();
    advanceTo(store, 'social_1');
    expect(playMock).not.toHaveBeenCalled();
    expect(requestBgmMock).not.toHaveBeenCalled();
    expect(releaseBgmMock).not.toHaveBeenCalled();

    vi.clearAllMocks();
    advanceTo(store, 'social_2');
    expect(playMock).not.toHaveBeenCalled();
    expect(requestBgmMock).not.toHaveBeenCalled();
    expect(releaseBgmMock).not.toHaveBeenCalled();
  });
});

// ── 2. game/setPhase and game/forcePhase apply the same policy ────────────────

describe('soundMiddleware — game/setPhase / game/forcePhase', () => {
  it('setPhase("loh_comp") starts music:hoh_comp_general', () => {
    const store = makeTestStore();
    setPhase(store, 'loh_comp');
    expect(requestBgmMock).toHaveBeenCalledWith('music:hoh_comp_general', 'phase');
  });

  it('setPhase("nominations") starts music:nominations_main', () => {
    const store = makeTestStore();
    setPhase(store, 'nominations');
    expect(requestBgmMock).toHaveBeenCalledWith('music:nominations_main', 'phase');
  });

  it('setPhase("eviction_results") does NOT play player:evicted (deferred to cinematic overlay)', () => {
    const store = makeTestStore();
    setPhase(store, 'eviction_results');
    expect(playMock).not.toHaveBeenCalledWith('player:evicted');
  });

  it('forcePhase("pos_ceremony") plays veto_ceremony stinger + music:veto_phase', () => {
    const store = makeTestStore();
    forcePhase(store, 'pos_ceremony');
    expect(playMock).toHaveBeenCalledWith('tv:veto_ceremony');
    expect(requestBgmMock).toHaveBeenCalledWith('music:veto_phase', 'phase');
  });

  it('forcePhase("week_end") releases phase BGM', () => {
    const store = makeTestStore();
    forcePhase(store, 'week_end');
    expect(releaseBgmMock).toHaveBeenCalledWith('phase');
  });
});

describe('soundMiddleware — resetGame lifecycle cleanup', () => {
  it('clears stale social-audio override state so phase music can start after reset', () => {
    const store = makeTestStore();

    store.dispatch({ type: 'social/openSocialPanel' });
    vi.clearAllMocks();
    requestBgmMock = vi.spyOn(SoundManager, 'requestBgm').mockImplementation(() => {});
    releaseBgmMock = vi.spyOn(SoundManager, 'releaseBgm').mockImplementation(() => {});

    store.dispatch({ type: 'game/resetGame' });
    advanceTo(store, 'nominations');

    expect(requestBgmMock).toHaveBeenCalledWith('music:nominations_main', 'phase');
  });
});

// ── 3. Social override guard ──────────────────────────────────────────────────

describe('soundMiddleware — social music override guard', () => {
  it('phase transition does NOT start phase music while social panel is open', () => {
    const store = makeTestStore();
    // Open social panel — activates _socialMusicActive
    store.dispatch({ type: 'social/openSocialPanel' });
    vi.clearAllMocks();
    requestBgmMock = vi.spyOn(SoundManager, 'requestBgm').mockImplementation(() => {});

    // Phase advances while panel is open — music:hoh_comp_general must NOT start
    advanceTo(store, 'loh_comp');
    // requestBgm for social was called on open; this assertion is about phase BGM not being called
    // After clearAllMocks, only the phase advance calls should be checked
    expect(requestBgmMock).not.toHaveBeenCalledWith('music:hoh_comp_general', 'phase');
  });

  it('phase transition does NOT start nominations music while social inbox is open', () => {
    const store = makeTestStore();
    store.dispatch({ type: 'social/openIncomingInbox' });
    vi.clearAllMocks();
    requestBgmMock = vi.spyOn(SoundManager, 'requestBgm').mockImplementation(() => {});

    advanceTo(store, 'nominations');
    expect(requestBgmMock).not.toHaveBeenCalledWith('music:nominations_main', 'phase');
  });

  it('phase stingers still play while social is active (only music is guarded)', () => {
    const store = makeTestStore();
    store.dispatch({ type: 'social/openSocialPanel' });
    vi.clearAllMocks();
    playMock = vi.spyOn(SoundManager, 'play').mockResolvedValue(undefined);
    requestBgmMock = vi.spyOn(SoundManager, 'requestBgm').mockImplementation(() => {});

    advanceTo(store, 'pos_ceremony');
    // Stinger should still fire
    expect(playMock).toHaveBeenCalledWith('tv:veto_ceremony');
    // But phase music should NOT start
    expect(requestBgmMock).not.toHaveBeenCalledWith('music:veto_phase', 'phase');
  });

  it('week_end does NOT release phase BGM while social is active', () => {
    const store = makeTestStore();
    store.dispatch({ type: 'social/openSocialPanel' });
    vi.clearAllMocks();
    releaseBgmMock = vi.spyOn(SoundManager, 'releaseBgm').mockImplementation(() => {});

    advanceTo(store, 'week_end');
    expect(releaseBgmMock).not.toHaveBeenCalledWith('phase');
  });

  it('phase music starts after social panel closes', () => {
    const store = makeTestStore();
    store.dispatch({ type: 'social/openSocialPanel' });
    vi.clearAllMocks();
    requestBgmMock = vi.spyOn(SoundManager, 'requestBgm').mockImplementation(() => {});
    releaseBgmMock = vi.spyOn(SoundManager, 'releaseBgm').mockImplementation(() => {});

    // Close panel: _socialMusicActive resets, releaseBgm('social') is called
    store.dispatch({ type: 'social/closeSocialPanel' });
    expect(releaseBgmMock).toHaveBeenCalledWith('social');

    vi.clearAllMocks();
    requestBgmMock = vi.spyOn(SoundManager, 'requestBgm').mockImplementation(() => {});

    // Now phase advance should be allowed to start music
    advanceTo(store, 'loh_comp');
    expect(requestBgmMock).toHaveBeenCalledWith('music:hoh_comp_general', 'phase');
  });
});

// ── 4. game/setEvictionOverlay — eviction cinematic SFX ──────────────────────

describe('soundMiddleware — game/setEvictionOverlay eviction SFX', () => {
  it('setEvictionOverlay with a player id plays player:evicted', () => {
    const store = makeTestStore();
    store.dispatch({ type: 'game/setEvictionOverlay', payload: 'player-42' });
    expect(playMock).toHaveBeenCalledWith('player:evicted');
  });

  it('setEvictionOverlay with null does NOT play player:evicted', () => {
    const store = makeTestStore();
    store.dispatch({ type: 'game/setEvictionOverlay', payload: null });
    expect(playMock).not.toHaveBeenCalledWith('player:evicted');
  });

  it('clearEvictionOverlay does NOT play player:evicted', () => {
    const store = makeTestStore();
    store.dispatch({ type: 'game/clearEvictionOverlay', payload: 'player-42' });
    expect(playMock).not.toHaveBeenCalledWith('player:evicted');
  });

  it('setEvictionOverlay does not start or stop music', () => {
    const store = makeTestStore();
    store.dispatch({ type: 'game/setEvictionOverlay', payload: 'player-42' });
    expect(requestBgmMock).not.toHaveBeenCalled();
    expect(releaseBgmMock).not.toHaveBeenCalled();
  });

  it('idempotency: dispatching the same id twice (e.g. Final3Ceremony + SpotlightEvictionOverlay mount) only plays SFX once', () => {
    const store = makeTestStore();
    // First dispatch: null → 'player-1' → SFX plays
    store.dispatch({ type: 'game/setEvictionOverlay', payload: 'player-1' });
    // Second dispatch (SpotlightEvictionOverlay mount effect): 'player-1' → 'player-1'
    // The id was already non-null before next(); this is NOT a null→id transition.
    store.dispatch({ type: 'game/setEvictionOverlay', payload: 'player-1' });
    expect(playMock).toHaveBeenCalledTimes(1);
    expect(playMock).toHaveBeenCalledWith('player:evicted');
  });

  it('clearEvictionOverlay resets the guard so the next eviction can play SFX again', () => {
    const store = makeTestStore();
    // First eviction cycle
    store.dispatch({ type: 'game/setEvictionOverlay', payload: 'player-1' });
    expect(playMock).toHaveBeenCalledWith('player:evicted');
    vi.clearAllMocks();
    playMock = vi.spyOn(SoundManager, 'play').mockResolvedValue(undefined);

    // Overlay cleared (unmount)
    store.dispatch({ type: 'game/clearEvictionOverlay', payload: 'player-1' });

    // Second eviction for a different player in the same session
    store.dispatch({ type: 'game/setEvictionOverlay', payload: 'player-2' });
    expect(playMock).toHaveBeenCalledWith('player:evicted');
  });

  it('Battle Back return: setEvictionOverlay does NOT play player:evicted', () => {
    const store = makeTestStore();
    // Simulate the state after completeBattleBack: battleBack.used=true, winnerId=id
    store.dispatch({
      type: '__SET_BATTLE_BACK__',
      payload: { used: true, winnerId: 'player-bb' },
    });
    vi.clearAllMocks();
    playMock = vi.spyOn(SoundManager, 'play').mockResolvedValue(undefined);

    // SpotlightEvictionOverlay variant="return" dispatches setEvictionOverlay
    store.dispatch({ type: 'game/setEvictionOverlay', payload: 'player-bb' });
    expect(playMock).not.toHaveBeenCalledWith('player:evicted');
  });

  it('non-Battle-Back eviction: setEvictionOverlay plays player:evicted even when battleBack state exists for a different player', () => {
    const store = makeTestStore();
    // battleBack.winnerId is a different player (not the current evictee)
    store.dispatch({
      type: '__SET_BATTLE_BACK__',
      payload: { used: true, winnerId: 'player-returner' },
    });
    vi.clearAllMocks();
    playMock = vi.spyOn(SoundManager, 'play').mockResolvedValue(undefined);

    // Real eviction of a different player
    store.dispatch({ type: 'game/setEvictionOverlay', payload: 'player-evicted' });
    expect(playMock).toHaveBeenCalledWith('player:evicted');
  });
});

describe('soundMiddleware — finale winner reveal', () => {
  it('startWinnerCinematic plays tv:winner_reveal', () => {
    const store = makeTestStore();
    store.dispatch({
      type: 'game/startWinnerCinematic',
      payload: { winnerId: 'winner', seed: 42, publicFavoriteEnabled: false },
    });
    expect(playMock).toHaveBeenCalledWith('tv:winner_reveal');
  });

  it('finale/finalizeFinale does not play tv:winner_reveal directly', () => {
    const store = makeTestStore();
    store.dispatch({ type: 'finale/finalizeFinale', payload: { seed: 42 } });
    expect(playMock).not.toHaveBeenCalledWith('tv:winner_reveal');
  });
});

