/**
 * Tests for soundMiddleware phase-driven audio policy.
 *
 * Covers:
 *  1. game/advance dispatches — phase → SoundManager.play/playMusic/stopMusic
 *  2. game/setPhase / game/forcePhase dispatch — same policy applied
 *  3. Social-music override guard — playMusic/stopMusic not called while
 *     _socialMusicActive is true
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { configureStore } from '@reduxjs/toolkit';
import { soundMiddleware } from '../../../src/store/soundMiddleware';
import { SoundManager } from '../../../src/services/sound/SoundManager';

// ── helpers ───────────────────────────────────────────────────────────────────

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
  const gameReducer = (
    state: { phase: string } = { phase: initialPhase },
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
let playMusicMock: ReturnType<typeof vi.spyOn>;
let stopMusicMock: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  playMock = vi.spyOn(SoundManager, 'play').mockResolvedValue(undefined);
  playMusicMock = vi.spyOn(SoundManager, 'playMusic').mockResolvedValue(undefined);
  stopMusicMock = vi.spyOn(SoundManager, 'stopMusic').mockImplementation(() => {});
  // Reset the module-level _socialMusicActive flag by dispatching a full
  // open+close cycle. Mock currentMusicKey so the close handler doesn't try
  // to restore a non-existent track.
  vi.spyOn(SoundManager, 'currentMusicKey', 'get').mockReturnValue('music:social_module');
  const s = makeTestStore();
  s.dispatch({ type: 'social/openSocialPanel' });
  s.dispatch({ type: 'social/closeSocialPanel' });
  // Clear call history accumulated during the reset so tests start clean.
  vi.clearAllMocks();
  // Re-establish the spies (clearAllMocks removes mock implementations).
  playMock = vi.spyOn(SoundManager, 'play').mockResolvedValue(undefined);
  playMusicMock = vi.spyOn(SoundManager, 'playMusic').mockResolvedValue(undefined);
  stopMusicMock = vi.spyOn(SoundManager, 'stopMusic').mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ── 1. game/advance phase→audio policy ───────────────────────────────────────

describe('soundMiddleware — game/advance phase music policy', () => {
  it('hoh_comp: starts music:hoh_comp_general and plays minigame:start', () => {
    const store = makeTestStore();
    advanceTo(store, 'hoh_comp');
    expect(playMusicMock).toHaveBeenCalledWith('music:hoh_comp_general');
    expect(playMock).toHaveBeenCalledWith('minigame:start');
  });

  it('hoh_results: starts music:hoh_comp_general and plays tv:event stinger', () => {
    const store = makeTestStore();
    advanceTo(store, 'hoh_results');
    expect(playMusicMock).toHaveBeenCalledWith('music:hoh_comp_general');
    expect(playMock).toHaveBeenCalledWith('tv:event');
  });

  it('pov_comp: starts music:hoh_comp_general and plays minigame:start', () => {
    const store = makeTestStore();
    advanceTo(store, 'pov_comp');
    expect(playMusicMock).toHaveBeenCalledWith('music:hoh_comp_general');
    expect(playMock).toHaveBeenCalledWith('minigame:start');
  });

  it('pov_results: starts music:hoh_comp_general and plays tv:event stinger', () => {
    const store = makeTestStore();
    advanceTo(store, 'pov_results');
    expect(playMusicMock).toHaveBeenCalledWith('music:hoh_comp_general');
    expect(playMock).toHaveBeenCalledWith('tv:event');
  });

  it('nominations: starts music:nominations_main', () => {
    const store = makeTestStore();
    advanceTo(store, 'nominations');
    expect(playMusicMock).toHaveBeenCalledWith('music:nominations_main');
    expect(playMock).not.toHaveBeenCalledWith('tv:event');
  });

  it('nomination_results: starts music:nominations_main', () => {
    const store = makeTestStore();
    advanceTo(store, 'nomination_results');
    expect(playMusicMock).toHaveBeenCalledWith('music:nominations_main');
  });

  it('pov_ceremony: plays tv:veto_ceremony stinger + starts music:veto_phase', () => {
    const store = makeTestStore();
    advanceTo(store, 'pov_ceremony');
    expect(playMock).toHaveBeenCalledWith('tv:veto_ceremony');
    expect(playMusicMock).toHaveBeenCalledWith('music:veto_phase');
  });

  it('pov_ceremony_results: continues music:veto_phase WITHOUT replaying stinger', () => {
    const store = makeTestStore();
    advanceTo(store, 'pov_ceremony_results');
    // Stinger must NOT replay on results — it already fired on pov_ceremony
    expect(playMock).not.toHaveBeenCalledWith('tv:veto_ceremony');
    // Veto loop must still be started (in case of direct jump to results)
    expect(playMusicMock).toHaveBeenCalledWith('music:veto_phase');
  });

  it('live_vote: plays tv:voting_eviction stinger (no music change)', () => {
    const store = makeTestStore();
    advanceTo(store, 'live_vote');
    expect(playMock).toHaveBeenCalledWith('tv:voting_eviction');
    expect(playMusicMock).not.toHaveBeenCalled();
    expect(stopMusicMock).not.toHaveBeenCalled();
  });

  it('eviction_results: does NOT play player:evicted (deferred to cinematic overlay)', () => {
    const store = makeTestStore();
    advanceTo(store, 'eviction_results');
    expect(playMock).not.toHaveBeenCalledWith('player:evicted');
    expect(playMusicMock).not.toHaveBeenCalled();
  });

  it('final4_eviction: does NOT play player:evicted (deferred to cinematic overlay)', () => {
    const store = makeTestStore();
    advanceTo(store, 'final4_eviction');
    expect(playMock).not.toHaveBeenCalledWith('player:evicted');
  });

  it('week_start: stops music (clean slate)', () => {
    const store = makeTestStore();
    advanceTo(store, 'week_start');
    expect(stopMusicMock).toHaveBeenCalled();
    expect(playMusicMock).not.toHaveBeenCalled();
  });

  it('week_end: stops music (clean slate)', () => {
    const store = makeTestStore();
    advanceTo(store, 'week_end');
    expect(stopMusicMock).toHaveBeenCalled();
    expect(playMusicMock).not.toHaveBeenCalled();
  });

  it('social_1 / social_2: no music or SFX triggered', () => {
    const store = makeTestStore();
    advanceTo(store, 'social_1');
    expect(playMock).not.toHaveBeenCalled();
    expect(playMusicMock).not.toHaveBeenCalled();
    expect(stopMusicMock).not.toHaveBeenCalled();

    vi.clearAllMocks();
    advanceTo(store, 'social_2');
    expect(playMock).not.toHaveBeenCalled();
    expect(playMusicMock).not.toHaveBeenCalled();
    expect(stopMusicMock).not.toHaveBeenCalled();
  });
});

// ── 2. game/setPhase and game/forcePhase apply the same policy ────────────────

describe('soundMiddleware — game/setPhase / game/forcePhase', () => {
  it('setPhase("hoh_comp") starts music:hoh_comp_general', () => {
    const store = makeTestStore();
    setPhase(store, 'hoh_comp');
    expect(playMusicMock).toHaveBeenCalledWith('music:hoh_comp_general');
  });

  it('setPhase("nominations") starts music:nominations_main', () => {
    const store = makeTestStore();
    setPhase(store, 'nominations');
    expect(playMusicMock).toHaveBeenCalledWith('music:nominations_main');
  });

  it('setPhase("eviction_results") does NOT play player:evicted (deferred to cinematic overlay)', () => {
    const store = makeTestStore();
    setPhase(store, 'eviction_results');
    expect(playMock).not.toHaveBeenCalledWith('player:evicted');
  });

  it('forcePhase("pov_ceremony") plays veto_ceremony stinger + music:veto_phase', () => {
    const store = makeTestStore();
    forcePhase(store, 'pov_ceremony');
    expect(playMock).toHaveBeenCalledWith('tv:veto_ceremony');
    expect(playMusicMock).toHaveBeenCalledWith('music:veto_phase');
  });

  it('forcePhase("week_end") stops music', () => {
    const store = makeTestStore();
    forcePhase(store, 'week_end');
    expect(stopMusicMock).toHaveBeenCalled();
  });
});

// ── 3. Social override guard ──────────────────────────────────────────────────

describe('soundMiddleware — social music override guard', () => {
  it('phase transition does NOT start phase music while social panel is open', () => {
    const store = makeTestStore();
    // Open social panel — activates _socialMusicActive
    store.dispatch({ type: 'social/openSocialPanel' });
    vi.clearAllMocks();

    // Phase advances while panel is open — music:hoh_comp_general must NOT start
    advanceTo(store, 'hoh_comp');
    expect(playMusicMock).not.toHaveBeenCalled();
  });

  it('phase transition does NOT start nominations music while social inbox is open', () => {
    const store = makeTestStore();
    store.dispatch({ type: 'social/openIncomingInbox' });
    vi.clearAllMocks();

    advanceTo(store, 'nominations');
    expect(playMusicMock).not.toHaveBeenCalled();
  });

  it('phase stingers still play while social is active (only music is guarded)', () => {
    const store = makeTestStore();
    store.dispatch({ type: 'social/openSocialPanel' });
    vi.clearAllMocks();

    advanceTo(store, 'pov_ceremony');
    // Stinger should still fire
    expect(playMock).toHaveBeenCalledWith('tv:veto_ceremony');
    // But music should NOT start
    expect(playMusicMock).not.toHaveBeenCalled();
  });

  it('week_end does NOT call stopMusic while social is active', () => {
    const store = makeTestStore();
    store.dispatch({ type: 'social/openSocialPanel' });
    vi.clearAllMocks();

    advanceTo(store, 'week_end');
    expect(stopMusicMock).not.toHaveBeenCalled();
  });

  it('phase music resumes after social panel closes', () => {
    const store = makeTestStore();
    store.dispatch({ type: 'social/openSocialPanel' });
    vi.clearAllMocks();
    // Re-establish spies after clearAllMocks
    playMusicMock = vi.spyOn(SoundManager, 'playMusic').mockResolvedValue(undefined);
    stopMusicMock = vi.spyOn(SoundManager, 'stopMusic').mockImplementation(() => {});

    // Close panel: mock currentMusicKey so the handler recognises social music
    // is playing and calls stopMusic() before restoring the prior track.
    vi.spyOn(SoundManager, 'currentMusicKey', 'get').mockReturnValue('music:social_module');
    store.dispatch({ type: 'social/closeSocialPanel' });
    vi.clearAllMocks();
    // Re-establish spies for the assertion
    playMusicMock = vi.spyOn(SoundManager, 'playMusic').mockResolvedValue(undefined);

    // Now phase advance should be allowed to start music
    advanceTo(store, 'hoh_comp');
    expect(playMusicMock).toHaveBeenCalledWith('music:hoh_comp_general');
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
    expect(playMusicMock).not.toHaveBeenCalled();
    expect(stopMusicMock).not.toHaveBeenCalled();
  });
});
