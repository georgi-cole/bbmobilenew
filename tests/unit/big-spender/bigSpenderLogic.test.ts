import { describe, expect, it } from 'vitest';
import { mulberry32 } from '../../../src/store/rng';
import {
  BIG_SPENDER_CONFIG,
  BIG_SPENDER_NEGATIVE_WALLETS,
  BIG_SPENDER_POSITIVE_WALLETS,
  canOfferAdRescue,
  createInitialBigSpenderState,
  decideAiShouldOpen,
  finishBigSpenderTurn,
  getAiActionDelayMs,
  getBigSpenderBoardForPlayer,
  lockBigSpenderPlayer,
  openBigSpenderWallet,
  pickWalletOutcome,
  rankBigSpenderPlayers,
  resolveBigSpenderAdRescue,
  resolveBigSpenderBonusOffer,
  sumWeights,
  type BigSpenderParticipant,
  type BigSpenderState,
} from '../../../src/components/BigSpender/bigSpenderLogic';

const participants: BigSpenderParticipant[] = [
  { id: 'human', name: 'You', isHuman: true, precomputedScore: 90 },
  { id: 'ai-1', name: 'Ava', isHuman: false, precomputedScore: 80 },
  { id: 'ai-2', name: 'Bo', isHuman: false, precomputedScore: 70 },
  { id: 'ai-3', name: 'Cy', isHuman: false, precomputedScore: 60 },
];

function makeState(seed = 1234) {
  return createInitialBigSpenderState(participants, seed, 0);
}

function setCurrent(state: BigSpenderState, playerId: string) {
  const index = state.turnOrder.indexOf(playerId);
  state.currentTurnIndex = index >= 0 ? index : 0;
  state.currentTurnPlayerId = playerId;
  state.players = state.players.map((player) => ({ ...player, currentTurn: player.playerId === playerId }));
  return state;
}

function firstWallet(state: BigSpenderState, playerId = 'human') {
  const wallet = getBigSpenderBoardForPlayer(state, playerId)[0];
  if (!wallet) throw new Error('missing wallet');
  return wallet;
}

function player(state: BigSpenderState, playerId: string) {
  const found = state.players.find((entry) => entry.playerId === playerId);
  if (!found) throw new Error(`missing player ${playerId}`);
  return found;
}

describe('Big Spender: Broke or Boom logic', () => {
  it('initializes all players at 1,000 Eyeoleans with private 30-wallet boards', () => {
    const state = makeState();

    expect(state.players).toHaveLength(participants.length);
    expect(state.players.every((entry) => entry.balance === BIG_SPENDER_CONFIG.startingBalance)).toBe(true);
    expect(state.board).toHaveLength(30);
    expect(state.players.every((entry) => getBigSpenderBoardForPlayer(state, entry.playerId).length === 30)).toBe(true);
    expect(firstWallet(state, 'human').walletId).not.toBe(firstWallet(state, 'ai-1').walletId);
    expect(state.currentTurnPlayerId).toBeTruthy();
  });

  it('declares wallet outcome weights as 81/15/4', () => {
    expect(BIG_SPENDER_CONFIG.outcomeWeights).toEqual({ negative: 81, positive: 15, bomb: 4 });
  });

  it('keeps positive and negative amount tables normalized to 100', () => {
    expect(sumWeights(BIG_SPENDER_NEGATIVE_WALLETS)).toBe(100);
    expect(sumWeights(BIG_SPENDER_POSITIVE_WALLETS)).toBe(100);
  });

  it('picks second-chance-compatible primary wallet outcomes', () => {
    const outcomes = Array.from({ length: 100 }, (_, index) => pickWalletOutcome(mulberry32(index + 99)).type);

    expect(new Set(outcomes)).toEqual(new Set(['negative', 'positive', 'bomb']));
  });

  it('subtracts negative wallets and clamps at zero', () => {
    const state = setCurrent(makeState(), 'human');
    const opened = openBigSpenderWallet(state, 'human', firstWallet(state).walletId, 'normal', {
      forcedOutcome: { type: 'negative', amount: -1200 },
      suppressBonus: true,
    });

    expect(player(opened, 'human').balance).toBe(0);
    expect(player(opened, 'human').status).toBe('zeroFinished');
    expect(player(opened, 'human').negativeWalletsOpened).toBe(1);
  });

  it('adds positive wallet amounts above the starting balance', () => {
    const state = setCurrent(makeState(), 'human');
    const opened = openBigSpenderWallet(state, 'human', firstWallet(state).walletId, 'normal', {
      forcedOutcome: { type: 'positive', amount: 666 },
      suppressBonus: true,
    });

    expect(player(opened, 'human').balance).toBe(1666);
    expect(player(opened, 'human').positiveWalletsOpened).toBe(1);
  });

  it('marks an AI bombed without using the human board', () => {
    const state = setCurrent(makeState(), 'ai-1');
    const humanWalletId = firstWallet(state, 'human').walletId;
    const opened = openBigSpenderWallet(state, 'ai-1', firstWallet(state, 'ai-1').walletId, 'normal', {
      forcedOutcome: { type: 'bomb', amount: null },
    });

    expect(player(opened, 'ai-1').status).toBe('bombed');
    expect(getBigSpenderBoardForPlayer(opened, 'human')[0]?.walletId).toBe(humanWalletId);
    expect(getBigSpenderBoardForPlayer(opened, 'human')[0]?.state).toBe('hidden');
  });

  it('offers ad rescue to an eligible human bomb opening', () => {
    const state = setCurrent(makeState(), 'human');
    const opened = openBigSpenderWallet(state, 'human', firstWallet(state).walletId, 'normal', {
      forcedOutcome: { type: 'bomb', amount: null },
    });

    expect(opened.pendingAdRescue?.playerId).toBe('human');
    expect(canOfferAdRescue(opened, player(opened, 'human'))).toBe(true);
  });

  it('declining or failing ad rescue marks the user as bombed', () => {
    const state = setCurrent(makeState(), 'human');
    const opened = openBigSpenderWallet(state, 'human', firstWallet(state).walletId, 'normal', {
      forcedOutcome: { type: 'bomb', amount: null },
    });
    const declined = resolveBigSpenderAdRescue(opened, 'declined');

    expect(declined.pendingAdRescue).toBeNull();
    expect(player(declined, 'human').status).toBe('bombed');
  });

  it('completed ad rescue cancels the original bomb and opens a mandatory Second Chance Wallet', () => {
    const state = setCurrent(makeState(), 'human');
    const opened = openBigSpenderWallet(state, 'human', firstWallet(state).walletId, 'normal', {
      forcedOutcome: { type: 'bomb', amount: null },
    });
    const rescued = resolveBigSpenderAdRescue(opened, 'completed', { type: 'negative', amount: -200 });

    expect(player(rescued, 'human').status).toBe('active');
    expect(player(rescued, 'human').balance).toBe(800);
    expect(player(rescued, 'human').adBombRescuesUsed).toBe(1);
    expect(player(rescued, 'human').walletsOpened).toBe(2);
  });

  it('does not allow Second Chance Wallets to trigger extra wallets', () => {
    const state = setCurrent(makeState(), 'human');
    const opened = openBigSpenderWallet(state, 'human', firstWallet(state).walletId, 'normal', {
      forcedOutcome: { type: 'bomb', amount: null },
    });
    const rescued = resolveBigSpenderAdRescue(opened, 'completed', { type: 'positive', amount: 100 });

    expect(rescued.pendingBonus).toBeNull();
    expect(player(rescued, 'human').bonusWalletsOpened).toBe(0);
  });

  it('bombing inside a Second Chance Wallet bombs the user without another ad rescue', () => {
    const state = setCurrent(makeState(), 'human');
    const opened = openBigSpenderWallet(state, 'human', firstWallet(state).walletId, 'normal', {
      forcedOutcome: { type: 'bomb', amount: null },
    });
    const rescued = resolveBigSpenderAdRescue(opened, 'completed', { type: 'bomb', amount: null });

    expect(player(rescued, 'human').status).toBe('bombed');
    expect(rescued.pendingAdRescue).toBeNull();
    expect(player(rescued, 'human').adBombRescuesUsed).toBe(1);
  });

  it('limits the human to two ad rescues per game', () => {
    const state = setCurrent(makeState(), 'human');
    state.players = state.players.map((entry) => entry.playerId === 'human' ? { ...entry, adBombRescuesUsed: 2 } : entry);
    const opened = openBigSpenderWallet(state, 'human', firstWallet(state).walletId, 'normal', {
      forcedOutcome: { type: 'bomb', amount: null },
    });

    expect(opened.pendingAdRescue).toBeNull();
    expect(player(opened, 'human').status).toBe('bombed');
  });

  it('locks a player and prevents future turns for that player', () => {
    const state = setCurrent(makeState(), 'human');
    const locked = lockBigSpenderPlayer(state, 'human');

    expect(player(locked, 'human').status).toBe('locked');
    expect(player(locked, 'human').finalizedAt).not.toBeNull();
    expect(locked.currentTurnPlayerId).not.toBe('human');
  });

  it('keeps opened wallets revealed on that player board', () => {
    const state = setCurrent(makeState(), 'ai-1');
    const wallet = firstWallet(state, 'ai-1');
    const opened = openBigSpenderWallet(state, 'ai-1', wallet.walletId, 'normal', {
      forcedOutcome: { type: 'negative', amount: -25 },
      suppressBonus: true,
    });
    const openedWallet = getBigSpenderBoardForPlayer(opened, 'ai-1').find((entry) => entry.walletId === wallet.walletId);

    expect(getBigSpenderBoardForPlayer(opened, 'ai-1')).toHaveLength(30);
    expect(openedWallet?.state).toBe('revealed');
    expect(openedWallet?.openedByPlayerId).toBe('ai-1');
  });

  it('offers at most one extra wallet per turn and the extra cannot chain another extra', () => {
    const state = setCurrent(makeState(), 'human');
    const opened = openBigSpenderWallet(state, 'human', firstWallet(state).walletId, 'normal', {
      forcedOutcome: { type: 'negative', amount: -25 },
      forceBonusOffer: true,
    });
    const bonusResolved = resolveBigSpenderBonusOffer(opened, true, { type: 'positive', amount: 50 });

    expect(opened.pendingBonus?.playerId).toBe('human');
    expect(player(bonusResolved, 'human').bonusWalletsOpened).toBe(1);
    expect(bonusResolved.pendingBonus).toBeNull();
  });

  it('keeps human turns open until the player acts', () => {
    const state = setCurrent(makeState(), 'human');
    const sameTurn = finishBigSpenderTurn({ ...state, postWalletLockPlayerId: null });

    expect(sameTurn.currentTurnPlayerId).not.toBeNull();
  });

  it('produces randomized AI action delays in the 1-4 second band', () => {
    expect(getAiActionDelayMs(2, () => 0)).toBe(1000);
    expect(getAiActionDelayMs(6, () => 1)).toBe(4000);
    expect(getAiActionDelayMs(7, () => 0)).toBe(1000);
    expect(getAiActionDelayMs(11, () => 1)).toBe(4000);
    expect(getAiActionDelayMs(12, () => 0)).toBe(1000);
    expect(getAiActionDelayMs(16, () => 1)).toBe(4000);
  });

  it('makes AI more likely to open high balances and cautious at low balances', () => {
    expect(decideAiShouldOpen(900, () => 0.89)).toBe(true);
    expect(decideAiShouldOpen(900, () => 0.91)).toBe(false);
    expect(decideAiShouldOpen(120, () => 0.29)).toBe(true);
    expect(decideAiShouldOpen(120, () => 0.31)).toBe(false);
    expect(decideAiShouldOpen(500, () => 0.74)).toBe(true);
    expect(decideAiShouldOpen(500, () => 0.76)).toBe(false);
  });

  it('ends when all players are finalized', () => {
    let state = makeState();
    for (const id of [...state.turnOrder]) {
      state = setCurrent(state, id);
      state = lockBigSpenderPlayer(state, id);
    }

    expect(state.status).toBe('completed');
  });

  it('ranks zero finishers, lowest non-zero scores, and bombed players correctly', () => {
    const state = makeState();
    const ranked = rankBigSpenderPlayers([
      { ...player(state, 'ai-1'), status: 'bombed', bombedAt: 5, finalizedAt: 5, balance: 100 },
      { ...player(state, 'ai-2'), status: 'active', finalizedAt: 4, balance: 40, walletsOpened: 2, negativeWalletsOpened: 2 },
      { ...player(state, 'human'), status: 'zeroFinished', zeroFinishedAt: 2, finalizedAt: 2, balance: 0 },
      { ...player(state, 'ai-3'), status: 'locked', lockedAt: 3, finalizedAt: 3, balance: 50 },
    ]);

    expect(ranked.map((entry) => entry.playerId)).toEqual(['human', 'ai-2', 'ai-3', 'ai-1']);
  });

  it('uses wallets opened, negative wallets, finalization order, and turn order as deterministic tiebreakers', () => {
    const state = makeState();
    const ranked = rankBigSpenderPlayers([
      { ...player(state, 'human'), balance: 100, walletsOpened: 1, negativeWalletsOpened: 1, finalizedAt: 1 },
      { ...player(state, 'ai-1'), balance: 100, walletsOpened: 3, negativeWalletsOpened: 1, finalizedAt: 3 },
      { ...player(state, 'ai-2'), balance: 100, walletsOpened: 3, negativeWalletsOpened: 2, finalizedAt: 4 },
      { ...player(state, 'ai-3'), balance: 100, walletsOpened: 3, negativeWalletsOpened: 2, finalizedAt: 2 },
    ]);

    expect(ranked[0]?.playerId).toBe('ai-3');
    expect(ranked[1]?.playerId).toBe('ai-2');
    expect(ranked[3]?.playerId).toBe('human');
  });

  it('ranks later-bombed players above earlier-bombed players when everyone bombs', () => {
    const state = makeState();
    const ranked = rankBigSpenderPlayers([
      { ...player(state, 'human'), status: 'bombed', bombedAt: 1, finalizedAt: 1 },
      { ...player(state, 'ai-1'), status: 'bombed', bombedAt: 3, finalizedAt: 3 },
      { ...player(state, 'ai-2'), status: 'bombed', bombedAt: 2, finalizedAt: 2 },
    ]);

    expect(ranked.map((entry) => entry.playerId)).toEqual(['ai-1', 'ai-2', 'human']);
  });
});
