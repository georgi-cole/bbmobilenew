import { describe, expect, it } from 'vitest';
import { mulberry32 } from '../../../src/store/rng';
import {
  VAULT_VERDICT_AMOUNTS,
  VAULT_VERDICT_ROUND_SCHEDULE,
  assertBroadcastPrivacy,
  buildRawResults,
  calculateEyeBankOffer,
  calculateRemainingValues,
  choosePersonalVault,
  createInitialContestant,
  createVaultPods,
  getAvailableWallVaults,
  getVaultsLeftThisRound,
  maybeCreateOffer,
  openWallVault,
  rankVaultContestants,
  resolveVaultParticipants,
  riskVault,
  signVerdict,
  simulateAiContestant,
} from '../../../src/components/VaultVerdict/vaultVerdictLogic';
import type { ResolvedVaultParticipant, VaultContestantState } from '../../../src/components/VaultVerdict/vaultVerdictLogic';

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
      const vault = getAvailableWallVaults(state)[0]!;
      state = openWallVault(state, vault.vaultId, openedAt);
      openedAt += 1000;
    }
    state = maybeCreateOffer(state, mulberry32(seed + round));
  }
  return state;
}

describe('Vault Verdict logic', () => {
  it('initializes 22 vault pods with the exact amount table', () => {
    const pods = createVaultPods(42);
    expect(pods).toHaveLength(22);
    expect([...pods.map((pod) => pod.amount)].sort((a, b) => a - b)).toEqual([...VAULT_VERDICT_AMOUNTS].sort((a, b) => a - b));
  });

  it('chooses My Vault and removes it from the normal opening pool', () => {
    const chosen = choosePersonalVault(makeHuman(), 'vault-3');
    expect(chosen.personalVaultId).toBe('vault-3');
    expect(chosen.vaults.find((vault) => vault.vaultId === 'vault-3')?.status).toBe('personal');
    expect(getAvailableWallVaults(chosen).some((vault) => vault.vaultId === 'vault-3')).toBe(false);
  });

  it('uses the required round schedule and creates offers after each round', () => {
    expect(VAULT_VERDICT_ROUND_SCHEDULE).toEqual([5, 4, 4, 3, 2, 1, 1]);
    let state = choosePersonalVault(makeHuman(), 'vault-1');
    for (const expectedOpenings of VAULT_VERDICT_ROUND_SCHEDULE) {
      expect(getVaultsLeftThisRound(state)).toBe(expectedOpenings);
      for (let index = 0; index < expectedOpenings; index += 1) {
        state = openWallVault(state, getAvailableWallVaults(state)[0]!.vaultId, 1000 + index);
      }
      state = maybeCreateOffer(state, mulberry32(99 + state.currentRound));
      expect(state.currentOffer).toBeGreaterThan(0);
      state = riskVault(state, 2000);
      if (state.finalAmount != null) break;
    }
  });

  it('calculates offers from unrevealed values including My Vault', () => {
    let state = choosePersonalVault(makeHuman(), 'vault-1');
    state = openWallVault(state, getAvailableWallVaults(state)[0]!.vaultId, 1000);
    const remaining = calculateRemainingValues(state);
    expect(remaining).toContain(state.personalVaultAmount);
    const offer = calculateEyeBankOffer({
      remainingValues: remaining,
      offerNumber: 1,
      bankMood: 'calculated',
      rng: mulberry32(7),
    });
    expect(offer.remainingValues).toEqual(remaining);
    expect(offer.offer).toBeGreaterThanOrEqual(1);
  });

  it('accepting an offer sets finalAmount and prevents further opening', () => {
    const state = playToOffer(makeHuman(), 1);
    const signed = signVerdict(state, 12345);
    expect(signed.finalAmount).toBe(state.currentOffer);
    expect(signed.acceptedOfferAmount).toBe(state.currentOffer);
    expect(signed.outcomeType).toBe('signedVerdict');
    expect(openWallVault(signed, getAvailableWallVaults(signed)[0]!.vaultId, 13000)).toBe(signed);
  });

  it('rejecting the final offer opens My Vault and leaves wall reveal out of scoring', () => {
    let state = choosePersonalVault(makeHuman(), 'vault-1');
    while (state.finalAmount == null) {
      for (let left = getVaultsLeftThisRound(state); left > 0; left -= 1) {
        state = openWallVault(state, getAvailableWallVaults(state)[0]!.vaultId, 1000);
      }
      state = maybeCreateOffer(state, mulberry32(11 + state.currentRound));
      state = riskVault(state, 44000);
    }
    expect(state.finalAmount).toBe(state.personalVaultAmount);
    expect(state.outcomeType).toBe('openedVault');
    expect(state.vaults.find((vault) => vault.status === 'remainingFinalWallVault')).toBeDefined();
    expect(buildRawResults([state])[state.contestantId]).toBe(state.personalVaultAmount);
  });

  it('simulates independent AI private games with finish times and legal final amounts', () => {
    const ai = createInitialContestant(participants[1]!, 1, 500);
    const result = simulateAiContestant(ai, 500, participants.length);
    expect(result.personalVaultId).toBeTruthy();
    expect(result.finalAmount).toBeGreaterThan(0);
    expect(result.finishTimeMs).toBeGreaterThan(0);
    expect(result.acceptedOfferAmount === result.finalAmount || result.personalVaultAmount === result.finalAmount).toBe(true);
    expect(result.vaults.map((vault) => vault.amount)).not.toEqual(makeHuman(500).vaults.map((vault) => vault.amount));
  });

  it('keeps broadcast messages privacy-safe and vague for small player counts', () => {
    const ai = simulateAiContestant(createInitialContestant(participants[1]!, 1, 600), 600, 2);
    expect(assertBroadcastPrivacy(ai.broadcastEvents)).toBe(true);
    expect(ai.broadcastEvents.some((event) => event.contestantName === 'Kian')).toBe(false);
    expect(ai.broadcastEvents.every((event) => !/\bwinning|losing|leader\b/i.test(event.message))).toBe(true);
  });

  it('ranks by amount descending, finish time ascending, then original order', () => {
    const base = participants.slice(0, 3).map((participant, index) => createInitialContestant(participant, index, 22));
    const contestants = [
      { ...base[0]!, finalAmount: 100, finishTimeMs: 3000 },
      { ...base[1]!, finalAmount: 200, finishTimeMs: 9000 },
      { ...base[2]!, finalAmount: 100, finishTimeMs: 1000 },
    ];
    expect(rankVaultContestants(contestants).map((contestant) => contestant.contestantId)).toEqual(['ai-1', 'ai-2', 'human']);
    const exactTie = contestants.map((contestant) => ({ ...contestant, finalAmount: 50, finishTimeMs: 1000 }));
    expect(rankVaultContestants(exactTie).map((contestant) => contestant.contestantId)).toEqual(['human', 'ai-1', 'ai-2']);
  });

  it('resolves fallback participants and never leaves the user without a valid action', () => {
    const resolved = resolveVaultParticipants({});
    expect(resolved.length).toBeGreaterThan(1);
    let state = choosePersonalVault(makeHuman(), 'vault-2');
    expect(getVaultsLeftThisRound(state) > 0 || state.currentOffer != null || state.finalAmount != null).toBe(true);
    state = playToOffer(state, 1);
    expect(state.currentOffer).toBeGreaterThan(0);
  });
});
