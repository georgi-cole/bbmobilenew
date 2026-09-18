import { describe, expect, it } from 'vitest';
import { mulberry32 } from '../../../src/store/rng';
import {
  VAULT_VERDICT_AMOUNTS,
  VAULT_VERDICT_ROUND_SCHEDULE,
  acceptInsuranceDeal,
  assertBroadcastPrivacy,
  buildBatteryLowVoteEffects,
  buildRawResults,
  calculateEyeBankOffer,
  calculateRemainingValues,
  choosePersonalVault,
  counterBankOffer,
  createInitialContestant,
  createVaultPods,
  getAvailableWallVaults,
  getEarnedBatteryLowVoteEffect,
  getHighestRemainingValue,
  getRevealCommentary,
  getRevealEffectProfile,
  getSpecialRevealLabel,
  getVaultsLeftThisRound,
  maybeCreateOffer,
  maybeCreateRareBankDeal,
  openWallVault,
  rankVaultContestants,
  resolveVaultParticipants,
  riskVault,
  signVerdict,
  simulateAiContestant,
  swapReserveBattery,
} from '../../../src/components/VaultVerdict/vaultVerdictLogic';
import type { ResolvedVaultParticipant, VaultContestantState } from '../../../src/components/VaultVerdict/vaultVerdictLogic';

const BATTERY_VALUES = [
  0, 1, 4.04, 6.66, 13, 13.37, 21, 24, 37, 42, 50, 55, 60, 66, 69, 75, 80, 88, 91, 95, 99, 100,
];

const participants: ResolvedVaultParticipant[] = [
  { id: 'human', name: 'You', isHuman: true, precomputedScore: 90 },
  { id: 'ai-1', name: 'Kian', isHuman: false, precomputedScore: 80 },
  { id: 'ai-2', name: 'Mira', isHuman: false, precomputedScore: 70 },
  { id: 'ai-3', name: 'Jules', isHuman: false, precomputedScore: 60 },
  { id: 'ai-4', name: 'Nina', isHuman: false, precomputedScore: 50 },
];

function makeHuman(seed = 1234) {
  return createInitialContestant(participants[0]!, 0, seed);
}

function playToOffer(contestant: VaultContestantState, round: number, seed = 100) {
  let state = contestant.personalVaultId ? contestant : choosePersonalVault(contestant, contestant.vaults[0]!.vaultId);
  let openedAt = 1000;
  while (state.currentRound <= round && state.currentOffer == null) {
    const left = getVaultsLeftThisRound(state);
    for (let index = 0; index < left; index += 1) {
      const battery = getAvailableWallVaults(state)[0]!;
      state = openWallVault(state, battery.vaultId, openedAt);
      openedAt += 1000;
    }
    state = maybeCreateOffer(state, mulberry32(seed + round));
  }
  return state;
}

describe('Battery Low logic', () => {
  it('initializes 24 batteries: 22 percentage cells plus two standalone special cells', () => {
    const batteries = createVaultPods(42);
    const standard = batteries.filter((battery) => !battery.specialEffect);
    const specials = batteries.filter((battery) => battery.specialEffect);

    expect(batteries).toHaveLength(24);
    expect([...standard.map((battery) => battery.amount)].sort((a, b) => a - b)).toEqual(
      BATTERY_VALUES,
    );
    expect([...VAULT_VERDICT_AMOUNTS]).toEqual(BATTERY_VALUES);
    expect(specials).toHaveLength(2);
    expect(specials.map((battery) => battery.specialEffect).sort()).toEqual([
      'doubleVote',
      'skipVote',
    ]);
    expect(specials.every((battery) => battery.amount === 50)).toBe(true);
    expect(batteries.every((battery) => battery.vaultId.startsWith('battery-'))).toBe(true);
  });

  it('keeps the 24-cell board when vote effects are disabled', () => {
    const enabled = createVaultPods(42);
    const disabled = createVaultPods(42, false);

    expect(disabled).toHaveLength(24);
    expect(disabled.every((battery) => !battery.specialEffect)).toBe(true);
    expect(disabled.map((battery) => battery.amount)).toEqual(
      enabled.map((battery) => battery.amount),
    );
  });

  it('only awards a vote modifier when its battery is the final opened Reserve', () => {
    const base = makeHuman(774);
    const powerCell = base.vaults.find((battery) => battery.specialEffect === 'doubleVote')!;
    const chosen = choosePersonalVault(base, powerCell.vaultId);

    expect(getEarnedBatteryLowVoteEffect({ ...chosen, outcomeType: 'signedVerdict' })).toBeNull();

    const finished = {
      ...chosen,
      outcomeType: 'openedVault' as const,
      finalAmount: chosen.personalVaultAmount,
    };
    expect(getEarnedBatteryLowVoteEffect(finished)).toBe('doubleVote');
    expect(buildBatteryLowVoteEffects([finished])).toEqual({ human: 'doubleVote' });
  });

  it('chooses a Reserve Battery and removes it from the normal opening pool', () => {
    const chosen = choosePersonalVault(makeHuman(), 'battery-3');
    expect(chosen.personalVaultId).toBe('battery-3');
    expect(chosen.vaults.find((battery) => battery.vaultId === 'battery-3')?.status).toBe('personal');
    expect(getAvailableWallVaults(chosen).some((battery) => battery.vaultId === 'battery-3')).toBe(false);
  });

  it('uses the required round schedule and creates offers after each round', () => {
    expect(VAULT_VERDICT_ROUND_SCHEDULE).toEqual([5, 4, 4, 3, 3, 2, 1]);
    let state = choosePersonalVault(makeHuman(), 'battery-1');
    for (const expectedOpenings of VAULT_VERDICT_ROUND_SCHEDULE) {
      expect(getVaultsLeftThisRound(state)).toBe(expectedOpenings);
      for (let index = 0; index < expectedOpenings; index += 1) {
        state = openWallVault(state, getAvailableWallVaults(state)[0]!.vaultId, 1000 + index);
      }
      state = maybeCreateOffer(state, mulberry32(99 + state.currentRound));
      expect(state.currentOffer).not.toBeNull();
      state = riskVault(state, 2000);
      if (state.finalAmount != null) break;
    }
  });

  it('calculates offers from unrevealed values including the Reserve Battery', () => {
    let state = choosePersonalVault(makeHuman(), 'battery-1');
    state = openWallVault(state, getAvailableWallVaults(state)[0]!.vaultId, 1000);
    const remaining = calculateRemainingValues(state);
    const highestRemaining = Math.max(...remaining);
    expect(remaining).toContain(state.personalVaultAmount);
    const offer = calculateEyeBankOffer({
      remainingValues: remaining,
      offerNumber: 1,
      bankMood: 'calculated',
      rng: mulberry32(7),
    });
    expect(offer.remainingValues).toEqual(remaining);
    expect(offer.offer).toBeGreaterThanOrEqual(0);
    expect(offer.offer).toBeLessThanOrEqual(highestRemaining);
  });

  it('maps every numeric battery and both special cells to a show effect', () => {
    const profiles = VAULT_VERDICT_AMOUNTS.map((amount) => getRevealEffectProfile(amount));
    expect(profiles).toHaveLength(VAULT_VERDICT_AMOUNTS.length);
    expect(profiles.every((profile) => profile.key && profile.title && profile.strapline)).toBe(true);

    expect(getRevealEffectProfile(0).key).toBe('powerdown');
    expect(getRevealEffectProfile(4.04).key).toBe('signal-lost');
    expect(getRevealEffectProfile(6.66).key).toBe('inferno');
    expect(getRevealEffectProfile(13).key).toBe('unlucky');
    expect(getRevealEffectProfile(13.37).key).toBe('elite-code');
    expect(getRevealEffectProfile(42).key).toBe('answer-signal');
    expect(getRevealEffectProfile(69).key).toBe('blush');
    expect(getRevealEffectProfile(99).key).toBe('near-perfect');
    expect(getRevealEffectProfile(100).key).toBe('overcharge');
    expect(getRevealEffectProfile(50, 'doubleVote').key).toBe('power-cell');
    expect(getRevealEffectProfile(50, 'skipVote').key).toBe('blackout-cell');

    const heroValues = VAULT_VERDICT_AMOUNTS.filter(
      (amount) => getRevealEffectProfile(amount).hero,
    );
    expect(heroValues).toEqual([0, 6.66, 13, 42, 69, 100]);
    expect(getRevealEffectProfile(50, 'doubleVote').hero).toBe(true);
    expect(getRevealEffectProfile(50, 'skipVote').hero).toBe(true);
    expect(getRevealEffectProfile(1).hero).toBe(false);
    expect(getRevealEffectProfile(4.04).hero).toBe(false);
    expect(getRevealEffectProfile(13.37).hero).toBe(false);
    expect(getRevealEffectProfile(99).hero).toBe(false);
  });

  it('tracks the center battery max charge after reveals', () => {
    let state = choosePersonalVault(makeHuman(), 'battery-1');
    expect(getHighestRemainingValue(state)).toBe(100);
    const maxBattery = getAvailableWallVaults(state).find((battery) => battery.amount === 100);
    if (maxBattery) {
      state = openWallVault(state, maxBattery.vaultId, 1000);
      expect(getHighestRemainingValue(state)).toBe(99);
    } else {
      expect(state.personalVaultAmount).toBe(100);
    }
    expect(getSpecialRevealLabel(4.04)).toBe('BATTERY NOT FOUND');
    expect(getSpecialRevealLabel(100)).toBe('FULL POWER');
  });

  it('lets a generous Bank raise a counteroffer and a stingy Bank cut one', () => {
    const base = playToOffer(makeHuman(124), 1);
    const generous = {
      ...base,
      bankMood: 'generous' as const,
      currentOffer: 40,
      offerHistory: [
        {
          round: 1,
          offer: 40,
          expectedValue: 50,
          remainingValues: calculateRemainingValues(base),
        },
      ],
    };
    const raiseRolls = [0, 0];
    const raised = counterBankOffer(generous, () => raiseRolls.shift() ?? 0);
    expect(raised.counterofferUsed).toBe(true);
    expect(raised.counterofferResult?.outcome).toBe('raised');
    expect(raised.currentOffer).toBeGreaterThan(40);

    const cutRolls = [0.99, 0];
    const cut = counterBankOffer(
      { ...generous, bankMood: 'stingy', counterofferUsed: false, counterofferResult: null },
      () => cutRolls.shift() ?? 0,
    );
    expect(cut.counterofferResult?.outcome).toBe('cut');
    expect(cut.currentOffer).toBeLessThan(40);
  });

  it('keeps pressure offers non-negotiable', () => {
    const base = playToOffer(makeHuman(224), 1);
    const pressure = {
      ...base,
      currentDeal: { type: 'pressure' as const, resolved: false, premiumPct: 15 },
    };
    expect(counterBankOffer(pressure, () => 0)).toBe(pressure);
  });

  it('creates at most one rare Bank condition and lets mood influence the type', () => {
    const contestant = {
      ...makeHuman(330),
      currentRound: 2,
      rareDealOffered: false,
      bankMood: 'generous' as const,
    };
    const rolls = [0, 0];
    const deal = maybeCreateRareBankDeal(contestant, () => rolls.shift() ?? 0);
    expect(deal).toEqual({ type: 'insurance', resolved: false, floor: 25 });
    expect(
      maybeCreateRareBankDeal({ ...contestant, rareDealOffered: true }, () => 0),
    ).toBeNull();
  });

  it('insurance protects a 25% final floor and reduces future offer strength', () => {
    const base = makeHuman(441);
    const zero = base.vaults.find((battery) => battery.amount === 0 && !battery.specialEffect)!;
    const chosen = choosePersonalVault(base, zero.vaultId);
    const insured = acceptInsuranceDeal({
      ...chosen,
      currentRound: 7,
      currentOffer: 18,
      currentDeal: { type: 'insurance', resolved: false, floor: 25 },
    });
    expect(insured.insuranceFloor).toBe(25);
    expect(insured.futureOfferMultiplier).toBe(0.9);

    const finished = riskVault(insured, 12000);
    expect(finished.finalAmount).toBe(25);
    expect(finished.personalVaultAmount).toBe(0);
  });

  it('blind swap exchanges the sealed Reserve without changing the Bank offer', () => {
    const base = makeHuman(551);
    const chosen = choosePersonalVault(base, base.vaults[0]!.vaultId);
    const oldReserveId = chosen.personalVaultId;
    const offer = 43;
    const swapped = swapReserveBattery(
      {
        ...chosen,
        currentOffer: offer,
        currentDeal: { type: 'swap', resolved: false },
      },
      () => 0,
    );
    expect(swapped.personalVaultId).not.toBe(oldReserveId);
    expect(swapped.vaults.find((battery) => battery.vaultId === oldReserveId)?.status).toBe(
      'available',
    );
    expect(
      swapped.vaults.find((battery) => battery.vaultId === swapped.personalVaultId)?.status,
    ).toBe('personal');
    expect(swapped.currentOffer).toBe(offer);
    expect(swapped.currentDeal?.resolved).toBe(true);
  });

  it('reacts differently to strong losses, good burns, and special-cell reveals', () => {
    const base = makeHuman(661);
    const top = base.vaults.find((battery) => battery.amount === 100)!;
    const low = base.vaults.find((battery) => battery.amount === 0 && !battery.specialEffect)!;
    const power = base.vaults.find((battery) => battery.specialEffect === 'doubleVote')!;
    expect(getRevealCommentary(base, top)).toMatch(/Bank|leverage/i);
    expect(getRevealCommentary(base, low)).toMatch(/burn|low/i);
    expect(getRevealCommentary(base, power)).toMatch(/double vote/i);
  });

  it('accepting an offer sets the final charge and prevents further opening', () => {
    const state = playToOffer(makeHuman(), 1);
    const signed = signVerdict(state, 12345);
    expect(signed.finalAmount).toBe(state.currentOffer);
    expect(signed.acceptedOfferAmount).toBe(state.currentOffer);
    expect(signed.outcomeType).toBe('signedVerdict');
    expect(openWallVault(signed, getAvailableWallVaults(signed)[0]!.vaultId, 13000)).toBe(signed);
  });

  it('rejecting the final offer opens the Reserve Battery and leaves the final board reveal out of scoring', () => {
    let state = choosePersonalVault(makeHuman(), 'battery-1');
    while (state.finalAmount == null) {
      for (let left = getVaultsLeftThisRound(state); left > 0; left -= 1) {
        state = openWallVault(state, getAvailableWallVaults(state)[0]!.vaultId, 1000);
      }
      state = maybeCreateOffer(state, mulberry32(11 + state.currentRound));
      state = riskVault(state, 44000);
    }
    expect(state.finalAmount).toBe(state.personalVaultAmount);
    expect(state.outcomeType).toBe('openedVault');
    expect(state.vaults.find((battery) => battery.status === 'remainingFinalWallVault')).toBeDefined();
    expect(buildRawResults([state])[state.contestantId]).toBe(state.personalVaultAmount);
  });

  it('simulates independent AI private games with finish times and legal final charges', () => {
    const ai = createInitialContestant(participants[1]!, 1, 500);
    const result = simulateAiContestant(ai, 500, participants.length);
    expect(result.personalVaultId).toBeTruthy();
    expect(result.finalAmount).toBeGreaterThanOrEqual(0);
    expect(result.finalAmount).toBeLessThanOrEqual(100);
    expect(result.finishTimeMs).toBeGreaterThan(0);
    expect(result.acceptedOfferAmount === result.finalAmount || result.personalVaultAmount === result.finalAmount).toBe(true);
    expect(result.vaults.map((battery) => battery.amount)).not.toEqual(makeHuman(500).vaults.map((battery) => battery.amount));
  });

  it('keeps broadcast messages privacy-safe and vague for small player counts', () => {
    const ai = simulateAiContestant(createInitialContestant(participants[1]!, 1, 600), 600, 2);
    expect(assertBroadcastPrivacy(ai.broadcastEvents)).toBe(true);
    expect(ai.broadcastEvents.some((event) => event.contestantName === 'Kian')).toBe(false);
    expect(ai.broadcastEvents.every((event) => !/\bwinning|losing|leader\b/i.test(event.message))).toBe(true);
  });

  it('ranks by final charge descending, finish time ascending, then original order', () => {
    const base = participants.slice(0, 3).map((participant, index) => createInitialContestant(participant, index, 22));
    const contestants = [
      { ...base[0]!, finalAmount: 69, finishTimeMs: 3000 },
      { ...base[1]!, finalAmount: 88, finishTimeMs: 9000 },
      { ...base[2]!, finalAmount: 69, finishTimeMs: 1000 },
    ];
    expect(rankVaultContestants(contestants).map((contestant) => contestant.contestantId)).toEqual(['ai-1', 'ai-2', 'human']);
    const exactTie = contestants.map((contestant) => ({ ...contestant, finalAmount: 50, finishTimeMs: 1000 }));
    expect(rankVaultContestants(exactTie).map((contestant) => contestant.contestantId)).toEqual(['human', 'ai-1', 'ai-2']);
  });

  it('resolves fallback participants and never leaves the user without a valid action', () => {
    const resolved = resolveVaultParticipants({});
    expect(resolved.length).toBeGreaterThan(1);
    let state = choosePersonalVault(makeHuman(), 'battery-2');
    expect(getVaultsLeftThisRound(state) > 0 || state.currentOffer != null || state.finalAmount != null).toBe(true);
    state = playToOffer(state, 1);
    expect(state.currentOffer).not.toBeNull();
  });
});
