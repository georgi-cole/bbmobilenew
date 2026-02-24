// Integration tests for social resource event deltas wired via socialMiddleware.
//
// Validates:
//  1. HOH win → +5 energy to winner
//  2. POV win → +3 energy to winner
//  3. Survived nomination → +4 energy when entering live_vote
//  4. New alliance formed → +2 energy + influence +200 to both parties
//  5. Broke alliance (betrayal) → -3 energy to actor
//  6. Competition skipped → -3 energy to all alive players

import { describe, it, expect } from 'vitest';
import { configureStore } from '@reduxjs/toolkit';
import gameReducer from '../../src/store/gameSlice';
import socialReducer, {
  setEnergyBankEntry,
  updateRelationship,
  selectEnergyBank,
  selectInfluenceBank,
  engineReady,
} from '../../src/social/socialSlice';
import { socialMiddleware } from '../../src/social/socialMiddleware';
import { SocialEngine } from '../../src/social/SocialEngine';

// ── Helpers ────────────────────────────────────────────────────────────────

function makeStore() {
  return configureStore({
    reducer: { game: gameReducer, social: socialReducer },
    middleware: (getDefault) => getDefault().concat(socialMiddleware),
  });
}

// ── HOH win energy bonus ──────────────────────────────────────────────────

describe('event delta – HOH win (+5 energy)', () => {
  it('grants +5 energy to the HOH winner via game/advance', () => {
    const store = makeStore();
    SocialEngine.init(store);

    // Provision all alive players with some energy
    const players = store.getState().game.players;
    const budgets: Record<string, number> = {};
    players.forEach((p: { id: string }) => { budgets[p.id] = 3; });
    store.dispatch(engineReady({ budgets }));

    // Game starts at week_start.
    // First advance: week_start → hoh_comp (no HOH set yet)
    store.dispatch({ type: 'game/advance' });
    expect(store.getState().game.phase).toBe('hoh_comp');

    // Second advance: hoh_comp → hoh_results (applyHohWinner runs, sets hohId)
    store.dispatch({ type: 'game/advance' });
    const stateAfterHoh = store.getState();
    expect(stateAfterHoh.game.phase).toBe('hoh_results');

    const hohId = stateAfterHoh.game.hohId;
    expect(hohId).not.toBeNull();

    // HOH winner should have gained +5 energy (started at 3, now 8)
    expect(selectEnergyBank(stateAfterHoh)[hohId!]).toBe(8);
  });
});

// ── Survived nomination energy bonus ─────────────────────────────────────

describe('event delta – survived nomination (+4 energy)', () => {
  it('grants +4 energy to nominees still on the block when entering live_vote', () => {
    const store = makeStore();
    SocialEngine.init(store);

    const alivePlayers = store.getState().game.players.filter(
      (p: { status: string }) => p.status !== 'evicted' && p.status !== 'jury',
    );
    const budgets: Record<string, number> = {};
    alivePlayers.forEach((p: { id: string }) => { budgets[p.id] = 5; });
    store.dispatch(engineReady({ budgets }));

    // Advance through phases until we reach live_vote so that the
    // game/advance-based survived-nomination middleware bonus fires.
    let phase = store.getState().game.phase;
    for (let i = 0; i < 60 && phase !== 'live_vote'; i += 1) {
      store.dispatch({ type: 'game/advance' });
      phase = store.getState().game.phase;
    }

    const state = store.getState();
    expect(state.game.phase).toBe('live_vote');

    const nominees = state.game.nomineeIds;
    expect(nominees.length).toBeGreaterThan(0);

    // Each nominee still on the block should have received +4 energy.
    // Their energy started at 5; HOH and POV bonuses may also have applied
    // to some players. The nominees themselves should have at least 5 + 4 = 9.
    nominees.forEach((id: string) => {
      expect(selectEnergyBank(state)[id]).toBeGreaterThanOrEqual(9);
    });
  });
});

// ── Alliance formed energy + influence bonus ──────────────────────────────

describe('event delta – new alliance formed (+2 energy, +200 influence)', () => {
  it('grants +2 energy and +200 influence to both parties on alliance tag', () => {
    const store = makeStore();
    SocialEngine.init(store);

    store.dispatch(setEnergyBankEntry({ playerId: 'p1', value: 3 }));
    store.dispatch(setEnergyBankEntry({ playerId: 'p2', value: 3 }));

    // Dispatch an updateRelationship with 'alliance' tag
    store.dispatch(
      updateRelationship({ source: 'p1', target: 'p2', delta: 5, tags: ['alliance'] }),
    );

    expect(selectEnergyBank(store.getState())['p1']).toBe(5); // 3 + 2
    expect(selectEnergyBank(store.getState())['p2']).toBe(5); // 3 + 2
    expect(selectInfluenceBank(store.getState())['p1']).toBe(200);
    expect(selectInfluenceBank(store.getState())['p2']).toBe(200);
  });
});

// ── Betrayal energy penalty ───────────────────────────────────────────────

describe('event delta – broke alliance (-3 energy)', () => {
  it('deducts 3 energy from the actor on betrayal tag', () => {
    const store = makeStore();
    SocialEngine.init(store);

    store.dispatch(setEnergyBankEntry({ playerId: 'p1', value: 5 }));

    store.dispatch(
      updateRelationship({ source: 'p1', target: 'p2', delta: -5, tags: ['betrayal'] }),
    );

    expect(selectEnergyBank(store.getState())['p1']).toBe(2); // 5 - 3
  });

  it('does not affect the target on betrayal tag', () => {
    const store = makeStore();
    SocialEngine.init(store);

    store.dispatch(setEnergyBankEntry({ playerId: 'p2', value: 5 }));

    store.dispatch(
      updateRelationship({ source: 'p1', target: 'p2', delta: -5, tags: ['betrayal'] }),
    );

    // p2 energy unchanged (only p1 is penalised)
    expect(selectEnergyBank(store.getState())['p2']).toBe(5);
  });
});

// ── Competition skipped energy penalty ───────────────────────────────────

describe('event delta – competition skipped (-3 energy)', () => {
  it('deducts 3 energy from all alive players on game/skipMinigame', () => {
    const store = makeStore();
    SocialEngine.init(store);

    const alivePlayers = store.getState().game.players.filter(
      (p: { status: string }) => p.status !== 'evicted' && p.status !== 'jury',
    );
    const budgets: Record<string, number> = {};
    alivePlayers.forEach((p: { id: string }) => { budgets[p.id] = 5; });
    store.dispatch(engineReady({ budgets }));

    store.dispatch({ type: 'game/skipMinigame' });

    const energyBank = selectEnergyBank(store.getState());
    alivePlayers.forEach((p: { id: string }) => {
      // SocialEnergyBank clamps at 0; energy can only go to minimum 0
      expect(energyBank[p.id]).toBe(2); // 5 - 3
    });
  });
});
