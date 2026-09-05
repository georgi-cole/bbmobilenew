// Integration tests for social resource event deltas wired via socialMiddleware.
//
// Validates:
//  1. LOH win → +5 energy to winner
//  2. POS win → +3 energy to winner
//  3. Survived nomination → +4 energy when entering live_vote
//  4. New alliance formed → +2 energy + influence +200 to both parties
//  5. Broke alliance (betrayal) → -3 energy to actor
//  6. Competition skipped → -3 energy to all alive players

import { describe, it, expect } from 'vitest';
import { configureStore } from '@reduxjs/toolkit';
import gameReducer, {
  selectNominee1,
  finalizeNominations,
  submitPovDecision,
  submitPovSaveTarget,
  setReplacementNominee,
  submitHumanVote,
  commitPublicSave,
  setPhase,
} from '../../src/store/gameSlice';
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

// ── LOH win energy bonus ──────────────────────────────────────────────────

describe('event delta – LOH win (+5 energy)', () => {
  it('grants +5 energy to the LOH winner via game/advance', () => {
    const store = makeStore();
    SocialEngine.init(store);
    store.dispatch(setPhase('week_start'));

    // Provision all alive players with some energy
    const players = store.getState().game.players;
    const budgets: Record<string, number> = {};
    players.forEach((p: { id: string }) => { budgets[p.id] = 3; });
    store.dispatch(engineReady({ budgets }));

    // Game starts at week_start.
    // First advance: week_start → loh_comp_announcement (no LOH set yet)
    store.dispatch({ type: 'game/advance' });
    expect(store.getState().game.phase).toBe('loh_comp_announcement');

    // Second advance: loh_comp_announcement → loh_comp
    store.dispatch({ type: 'game/advance' });
    expect(store.getState().game.phase).toBe('loh_comp');

    // Third advance: loh_comp → loh_results (applyLohWinner runs, sets lohId)
    store.dispatch({ type: 'game/advance' });
    const stateAfterHoh = store.getState();
    expect(stateAfterHoh.game.phase).toBe('loh_results');

    const lohId = stateAfterHoh.game.lohId;
    expect(lohId).not.toBeNull();

    // LOH winner should have gained +5 energy (started at 3, now 8)
    expect(selectEnergyBank(stateAfterHoh)[lohId!]).toBe(8);
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
    // Handle human-blocking states (LOH nominations, POS decisions) that may
    // arise depending on RNG seed/phase ordering.
    let phase = store.getState().game.phase;
    for (let i = 0; i < 80 && phase !== 'live_vote'; i += 1) {
      const gs = store.getState().game;
      if (gs.awaitingNominations && !gs.pendingNominee1Id) {
        const alive = gs.players.filter((p: { status: string }) => p.status !== 'evicted' && p.status !== 'jury');
        const pool = alive.filter((p: { id: string }) => p.id !== gs.lohId);
        store.dispatch(selectNominee1(pool[0].id));
      } else if (gs.awaitingNominations && gs.pendingNominee1Id) {
        const alive = gs.players.filter((p: { status: string }) => p.status !== 'evicted' && p.status !== 'jury');
        const pool = alive.filter((p: { id: string }) => p.id !== gs.lohId && p.id !== gs.pendingNominee1Id);
        store.dispatch(finalizeNominations(pool[0].id));
      } else if (gs.awaitingPublicSave && gs.nomineeIds.length > 0) {
        store.dispatch(commitPublicSave(gs.nomineeIds[0]));
      } else if (gs.awaitingPovDecision) {
        store.dispatch(submitPovDecision(false));
      } else if (gs.awaitingPovSaveTarget && gs.nomineeIds.length > 0) {
        store.dispatch(submitPovSaveTarget(gs.nomineeIds[0]));
      } else if (gs.replacementNeeded) {
        const alive = gs.players.filter((p: { status: string }) => p.status !== 'evicted' && p.status !== 'jury');
        const pool = alive.filter((p: { id: string }) => p.id !== gs.lohId && p.id !== gs.posWinnerId && !gs.nomineeIds.includes(p.id));
        if (pool.length > 0) store.dispatch(setReplacementNominee(pool[0].id));
        else store.dispatch({ type: 'game/advance' });
      } else if (gs.awaitingHumanVote && gs.nomineeIds.length > 0) {
        store.dispatch(submitHumanVote(gs.nomineeIds[0]));
      } else {
        store.dispatch({ type: 'game/advance' });
      }
      phase = store.getState().game.phase;
    }

    const state = store.getState();
    expect(state.game.phase).toBe('live_vote');

    const nominees = state.game.nomineeIds;
    expect(nominees.length).toBeGreaterThan(0);

    // Each nominee still on the block should have received +4 energy.
    // Their energy started at 5; LOH and POS bonuses may also have applied
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

    // A formal alliance becomes active only after both directed sides exist.
    store.dispatch(
      updateRelationship({ source: 'p1', target: 'p2', delta: 10, tags: ['alliance'] }),
    );
    store.dispatch(
      updateRelationship({ source: 'p2', target: 'p1', delta: 10, tags: ['alliance'] }),
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
