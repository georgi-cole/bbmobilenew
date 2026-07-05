import { mulberry32 } from '../../store/rng';
import type { GenericMinigameProps } from '../../minigames/reactComponents';

export const VAULT_VERDICT_AMOUNTS = [
  0, 1, 4.04, 6.66, 13, 13.37, 21, 24, 37, 42, 50, 55, 60, 66, 69, 75, 80, 88, 91, 95, 99, 100,
] as const;

export const VAULT_VERDICT_ROUND_SCHEDULE = [5, 4, 4, 3, 2, 1, 1] as const;

export type VaultStatus = 'available' | 'personal' | 'opened' | 'remainingFinalWallVault';
export type BankMood = 'stingy' | 'calculated' | 'generous' | 'chaotic';
export type AiPersonality = 'cautious' | 'balanced' | 'greedy' | 'chaotic' | 'show-off' | 'panic';
export type OutcomeType = 'signedVerdict' | 'openedVault';
export type ContestantStatus = 'Charging' | 'Locked' | 'Final Battery' | 'Finished';
export type BroadcastKind = 'decision' | 'amount' | 'round' | 'flavor' | 'final';

export interface VaultPodState {
  vaultId: string;
  displayNumber: number;
  amount: number;
  status: VaultStatus;
  openedAt: number | null;
}

export interface OfferRecord {
  round: number;
  offer: number;
  expectedValue: number;
  remainingValues: number[];
}

export interface BroadcastEvent {
  id: string;
  atMs: number;
  contestantId: string | null;
  contestantName: string | null;
  kind: BroadcastKind;
  message: string;
}

export interface VaultContestantState {
  contestantId: string;
  displayName: string;
  isUserControlled: boolean;
  originalTurnOrderIndex: number;
  vaults: VaultPodState[];
  personalVaultId: string | null;
  personalVaultAmount: number | null;
  openedVaultIds: string[];
  revealedAmounts: number[];
  remainingAmounts: number[];
  currentRound: number;
  currentOffer: number | null;
  offerHistory: OfferRecord[];
  acceptedOfferAmount: number | null;
  finalAmount: number | null;
  outcomeType: OutcomeType | null;
  simulatedStartTime: number;
  simulatedFinishTime: number | null;
  finishTimeMs: number | null;
  aiPersonality: AiPersonality | null;
  bankMood: BankMood;
  broadcastEvents: BroadcastEvent[];
}

export interface RankedVaultResult extends VaultContestantState {
  placement: number;
}

export interface ResolvedVaultParticipant {
  id: string;
  name: string;
  isHuman: boolean;
  precomputedScore: number;
}

const FALLBACK_NAMES = ['You', 'Kian', 'Mira', 'Jules', 'Nina', 'Sasha', 'Eli', 'Rhea'];
const BANK_MOODS: BankMood[] = ['stingy', 'calculated', 'generous', 'chaotic'];
const AI_PERSONALITIES: AiPersonality[] = ['cautious', 'balanced', 'greedy', 'chaotic', 'show-off', 'panic'];
const DRAMATIC_AMOUNTS = new Set([0, 4.04, 6.66, 13.37, 42, 69, 99, 100]);
const TOP_AMOUNTS = new Set([88, 91, 95, 99, 100]);
const OFFER_MULTIPLIERS: Array<[number, number]> = [
  [0.45, 0.65],
  [0.52, 0.73],
  [0.6, 0.84],
  [0.7, 0.95],
  [0.78, 1.05],
  [0.86, 1.15],
  [0.92, 1.25],
];

function randomInt(rng: () => number, min: number, max: number) {
  return Math.floor(rng() * (max - min + 1)) + min;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function pick<T>(rng: () => number, values: readonly T[]): T {
  return values[Math.floor(rng() * values.length)]!;
}

function shuffle<T>(values: readonly T[], rng: () => number): T[] {
  const copy = [...values];
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(rng() * (index + 1));
    [copy[index], copy[swapIndex]] = [copy[swapIndex]!, copy[index]!];
  }
  return copy;
}

function mixSeed(seed: number, label: string) {
  let mixed = seed >>> 0;
  for (let index = 0; index < label.length; index += 1) {
    mixed = Math.imul(mixed ^ label.charCodeAt(index), 16777619) >>> 0;
  }
  return mixed >>> 0;
}

function getMoodModifier(mood: BankMood, rng: () => number) {
  if (mood === 'stingy') return 0.92 + rng() * 0.04;
  if (mood === 'generous') return 1.04 + rng() * 0.06;
  if (mood === 'chaotic') return 0.96 + rng() * 0.1;
  return 0.98 + rng() * 0.04;
}

function getNoise(mood: BankMood, rng: () => number) {
  return mood === 'chaotic' ? 0.84 + rng() * 0.34 : 0.94 + rng() * 0.12;
}

export function formatVaultAmount(value: number) {
  const rounded = Math.round(value * 100) / 100;
  return `${Number.isInteger(rounded) ? rounded.toFixed(0) : rounded.toString()}%`;
}

export function createVaultVerdictRng(seed = 0) {
  const resolvedSeed = seed && seed !== 0 ? seed : Date.now();
  return {
    seed: resolvedSeed,
    rng: mulberry32(resolvedSeed >>> 0),
  };
}

export function createVaultPods(seed: number): VaultPodState[] {
  const rng = mulberry32(seed >>> 0);
  const amounts = shuffle(VAULT_VERDICT_AMOUNTS, rng);
  return amounts.map((amount, index) => ({
    vaultId: `battery-${index + 1}`,
    displayNumber: index + 1,
    amount,
    status: 'available',
    openedAt: null,
  }));
}

export function calculateRemainingValues(contestant: Pick<VaultContestantState, 'vaults'>) {
  return contestant.vaults
    .filter((vault) => vault.status !== 'opened')
    .map((vault) => vault.amount);
}

export function calculateEyeBankOffer(options: {
  remainingValues: number[];
  offerNumber: number;
  bankMood: BankMood;
  rng: () => number;
}): OfferRecord {
  const { remainingValues, offerNumber, bankMood, rng } = options;
  const expectedValue = remainingValues.reduce((total, value) => total + value, 0) / Math.max(1, remainingValues.length);
  const range = OFFER_MULTIPLIERS[clamp(offerNumber - 1, 0, OFFER_MULTIPLIERS.length - 1)]!;
  const multiplier = range[0] + rng() * (range[1] - range[0]);
  const rawOffer = expectedValue * multiplier * getMoodModifier(bankMood, rng) * getNoise(bankMood, rng);
  return {
    round: offerNumber,
    offer: clamp(Math.round(rawOffer), 0, Math.max(0, ...remainingValues)),
    expectedValue,
    remainingValues: [...remainingValues],
  };
}

export function getHighestRemainingValue(contestant: Pick<VaultContestantState, 'vaults'>) {
  return Math.max(0, ...calculateRemainingValues(contestant));
}

export function getSpecialRevealLabel(value: number) {
  const labels = new Map<number, string>([
    [0, 'DEAD CELL'],
    [4.04, 'BATTERY NOT FOUND'],
    [6.66, 'CURSED CELL'],
    [13.37, 'ELITE CHARGE'],
    [42, 'ANSWER CELL'],
    [69, 'NICE'],
    [99, 'ONE PERCENT AWAY'],
    [100, 'FULL POWER'],
  ]);
  return labels.get(value) ?? null;
}

export function resolveVaultParticipants(
  props: Pick<GenericMinigameProps, 'participants' | 'participantIds'>,
): ResolvedVaultParticipant[] {
  if (props.participants && props.participants.length > 0) {
    return props.participants.map((participant) => ({
      id: participant.id,
      name: participant.name,
      isHuman: participant.isHuman,
      precomputedScore: participant.precomputedScore,
    }));
  }

  const ids = props.participantIds && props.participantIds.length > 0
    ? props.participantIds
    : FALLBACK_NAMES.map((_, index) => `battery-player-${index + 1}`);

  return ids.map((id, index) => ({
    id,
    name: FALLBACK_NAMES[index] ?? `Player ${index + 1}`,
    isHuman: index === 0,
    precomputedScore: 50 - index,
  }));
}

export function createInitialContestant(
  participant: ResolvedVaultParticipant,
  originalTurnOrderIndex: number,
  seed: number,
): VaultContestantState {
  const rng = mulberry32(mixSeed(seed, participant.id));
  const bankMood = pick(rng, BANK_MOODS);
  return {
    contestantId: participant.id,
    displayName: participant.name,
    isUserControlled: participant.isHuman,
    originalTurnOrderIndex,
    vaults: createVaultPods(mixSeed(seed + originalTurnOrderIndex * 97, participant.id)),
    personalVaultId: null,
    personalVaultAmount: null,
    openedVaultIds: [],
    revealedAmounts: [],
    remainingAmounts: [...VAULT_VERDICT_AMOUNTS],
    currentRound: 0,
    currentOffer: null,
    offerHistory: [],
    acceptedOfferAmount: null,
    finalAmount: null,
    outcomeType: null,
    simulatedStartTime: 0,
    simulatedFinishTime: null,
    finishTimeMs: null,
    aiPersonality: participant.isHuman ? null : pick(rng, AI_PERSONALITIES),
    bankMood,
    broadcastEvents: [],
  };
}

export function choosePersonalVault(contestant: VaultContestantState, vaultId: string): VaultContestantState {
  if (contestant.personalVaultId || contestant.finalAmount != null) return contestant;
  const vault = contestant.vaults.find((entry) => entry.vaultId === vaultId);
  if (!vault || vault.status !== 'available') return contestant;
  const vaults = contestant.vaults.map((entry) =>
    entry.vaultId === vaultId ? { ...entry, status: 'personal' as const } : entry,
  );
  return {
    ...contestant,
    vaults,
    personalVaultId: vaultId,
    personalVaultAmount: vault.amount,
    currentRound: 1,
    remainingAmounts: calculateRemainingValues({ vaults }),
  };
}

export function getAvailableWallVaults(contestant: VaultContestantState) {
  return contestant.vaults.filter((vault) => vault.status === 'available');
}

export function getVaultsLeftThisRound(contestant: VaultContestantState) {
  if (!contestant.personalVaultId || contestant.currentRound <= 0 || contestant.currentRound > VAULT_VERDICT_ROUND_SCHEDULE.length) return 0;
  const openedBeforeRound = VAULT_VERDICT_ROUND_SCHEDULE
    .slice(0, contestant.currentRound - 1)
    .reduce((total, count) => total + count, 0);
  const openedThisRound = contestant.openedVaultIds.length - openedBeforeRound;
  return Math.max(0, VAULT_VERDICT_ROUND_SCHEDULE[contestant.currentRound - 1]! - openedThisRound);
}

export function openWallVault(
  contestant: VaultContestantState,
  vaultId: string,
  openedAt: number,
): VaultContestantState {
  if (!contestant.personalVaultId || contestant.finalAmount != null || contestant.currentOffer != null) return contestant;
  if (getVaultsLeftThisRound(contestant) <= 0) return contestant;
  const vault = contestant.vaults.find((entry) => entry.vaultId === vaultId);
  if (!vault || vault.status !== 'available') return contestant;
  const vaults = contestant.vaults.map((entry) =>
    entry.vaultId === vaultId ? { ...entry, status: 'opened' as const, openedAt } : entry,
  );
  return {
    ...contestant,
    vaults,
    openedVaultIds: [...contestant.openedVaultIds, vaultId],
    revealedAmounts: [...contestant.revealedAmounts, vault.amount],
    remainingAmounts: calculateRemainingValues({ vaults }),
  };
}

export function maybeCreateOffer(
  contestant: VaultContestantState,
  rng: () => number,
): VaultContestantState {
  if (contestant.currentOffer != null || getVaultsLeftThisRound(contestant) > 0) return contestant;
  const offer = calculateEyeBankOffer({
    remainingValues: calculateRemainingValues(contestant),
    offerNumber: contestant.currentRound,
    bankMood: contestant.bankMood,
    rng,
  });
  return {
    ...contestant,
    currentOffer: offer.offer,
    offerHistory: [...contestant.offerHistory, offer],
  };
}

export function riskVault(contestant: VaultContestantState, finishTimeMs: number): VaultContestantState {
  if (contestant.currentOffer == null || contestant.finalAmount != null) return contestant;
  if (contestant.currentRound >= VAULT_VERDICT_ROUND_SCHEDULE.length) {
    const vaults = contestant.vaults.map((vault) => {
      if (vault.status === 'personal') return { ...vault, status: 'opened' as const, openedAt: finishTimeMs };
      if (vault.status === 'available') return { ...vault, status: 'remainingFinalWallVault' as const };
      return vault;
    });
    return {
      ...contestant,
      vaults,
      currentOffer: null,
      finalAmount: contestant.personalVaultAmount ?? 0,
      outcomeType: 'openedVault',
      simulatedFinishTime: finishTimeMs,
      finishTimeMs,
      remainingAmounts: calculateRemainingValues({ vaults }),
    };
  }
  return {
    ...contestant,
    currentRound: contestant.currentRound + 1,
    currentOffer: null,
  };
}

export function signVerdict(contestant: VaultContestantState, finishTimeMs: number): VaultContestantState {
  if (contestant.currentOffer == null || contestant.finalAmount != null) return contestant;
  return {
    ...contestant,
    acceptedOfferAmount: contestant.currentOffer,
    finalAmount: contestant.currentOffer,
    outcomeType: 'signedVerdict',
    simulatedFinishTime: finishTimeMs,
    finishTimeMs,
  };
}

function shouldAiAcceptOffer(options: {
  contestant: VaultContestantState;
  offer: number;
  expectedValue: number;
  round: number;
  openedThisRound: number[];
  rng: () => number;
}) {
  const { contestant, offer, expectedValue, round, openedThisRound, rng } = options;
  const personality = contestant.aiPersonality ?? 'balanced';
  const offerRatio = offer / Math.max(1, expectedValue);
  const topStillHidden = calculateRemainingValues(contestant).filter((amount) => TOP_AMOUNTS.has(amount)).length;
  const hitTopThisRound = openedThisRound.some((amount) => TOP_AMOUNTS.has(amount));
  const luckyRound = openedThisRound.every((amount) => amount <= 24);
  let threshold = 0.68 + round * 0.055;

  if (personality === 'cautious') threshold -= 0.12;
  if (personality === 'balanced') threshold -= 0.02;
  if (personality === 'greedy') threshold += 0.2;
  if (personality === 'show-off' && luckyRound) threshold += 0.13;
  if (personality === 'panic' && hitTopThisRound) threshold -= 0.18;
  if (personality === 'chaotic') threshold += rng() * 0.38 - 0.18;
  if (topStillHidden >= 3) threshold += 0.07;
  if (round >= 6) threshold -= 0.08;
  return offerRatio >= clamp(threshold, 0.45, 1.26) || (round >= 7 && offerRatio >= 0.94 && rng() < 0.48);
}

function buildBroadcastMessage(options: {
  contestant: VaultContestantState;
  kind: BroadcastKind;
  amount?: number;
  accepted?: boolean;
  smallPlayerCount: boolean;
  rng: () => number;
}) {
  const { contestant, kind, amount, accepted, smallPlayerCount, rng } = options;
  const name = contestant.displayName;
  if (smallPlayerCount) {
    const vague = [
      'The control room just gasped. No further comment.',
      'Someone in another booth made the host blink twice.',
      'The Battery Low ticker briefly lost its composure.',
      'A private booth just hit final battery territory.',
    ];
    return pick(rng, vague);
  }
  if (kind === 'decision') {
    if (accepted) {
      return pick(rng, [
        `${name} locked a safe-looking Bank Offer.`,
        `${name} accepted the charge and stepped away from the rack.`,
        `${name} took the Bank Offer. The booth lights went green.`,
      ]);
    }
    return pick(rng, [
      `${name} just rejected a risky Power Bank offer.`,
      `${name} said no way too confidently.`,
      `${name} ignored an offer that made the control room blink twice.`,
    ]);
  }
  if (kind === 'amount' && amount != null) {
    if (amount === 100) return 'Someone just opened 100% in another booth. The room went silent.';
    if (amount === 4.04) return 'Another booth found 4.04%. Battery not found.';
    if (amount === 0) return 'Someone just opened 0%. Brutal.';
    if (amount === 69) return 'Another booth just opened 69%. The audience reacted exactly how you think.';
    return `A contestant just exposed ${formatVaultAmount(amount)} in another private booth. Painful.`;
  }
  if (kind === 'final') return 'Someone is down to their final reserve battery.';
  return pick(rng, [
    'A booth just kept the 100% alive into the late game.',
    'Someone quietly built a dangerous charge rack.',
    'The Bank sent an offer and got ignored instantly.',
  ]);
}

export function simulateAiContestant(
  contestant: VaultContestantState,
  seed: number,
  totalContestants: number,
): VaultContestantState {
  const rng = mulberry32(mixSeed(seed, `${contestant.contestantId}:ai`));
  let state = choosePersonalVault(contestant, pick(rng, contestant.vaults).vaultId);
  let elapsed = randomInt(rng, 1000, 4000);
  const broadcasts: BroadcastEvent[] = [];

  for (let round = 1; round <= VAULT_VERDICT_ROUND_SCHEDULE.length && state.finalAmount == null; round += 1) {
    const openedThisRound: number[] = [];
    const count = VAULT_VERDICT_ROUND_SCHEDULE[round - 1]!;
    for (let index = 0; index < count; index += 1) {
      const vault = pick(rng, getAvailableWallVaults(state));
      elapsed += randomInt(rng, 1000, 3000);
      state = openWallVault(state, vault.vaultId, elapsed);
      openedThisRound.push(vault.amount);
      if (DRAMATIC_AMOUNTS.has(vault.amount) && broadcasts.length < 8 && rng() < 0.55) {
        broadcasts.push({
          id: `${contestant.contestantId}-amount-${round}-${index}`,
          atMs: elapsed,
          contestantId: null,
          contestantName: null,
          kind: 'amount',
          message: buildBroadcastMessage({
            contestant,
            kind: 'amount',
            amount: vault.amount,
            smallPlayerCount: totalContestants <= 4,
            rng,
          }),
        });
      }
    }
    state = maybeCreateOffer(state, rng);
    elapsed += randomInt(rng, 2000, 8000);
    const latestOffer = state.offerHistory[state.offerHistory.length - 1]!;
    const accepted = shouldAiAcceptOffer({
      contestant: state,
      offer: latestOffer.offer,
      expectedValue: latestOffer.expectedValue,
      round,
      openedThisRound,
      rng,
    });
    if (round >= 7) {
      broadcasts.push({
        id: `${contestant.contestantId}-final-${round}`,
        atMs: Math.max(0, elapsed - 1200),
        contestantId: null,
        contestantName: null,
        kind: 'final',
        message: buildBroadcastMessage({ contestant, kind: 'final', smallPlayerCount: totalContestants <= 4, rng }),
      });
    }
    broadcasts.push({
      id: `${contestant.contestantId}-decision-${round}`,
      atMs: elapsed,
      contestantId: totalContestants <= 4 ? null : contestant.contestantId,
      contestantName: totalContestants <= 4 ? null : contestant.displayName,
      kind: 'decision',
      message: buildBroadcastMessage({
        contestant,
        kind: 'decision',
        accepted,
        smallPlayerCount: totalContestants <= 4,
        rng,
      }),
    });
    state = accepted ? signVerdict(state, elapsed) : riskVault(state, elapsed);
    if (!accepted) {
      elapsed += rng() < 0.25 ? randomInt(rng, 1000, 3000) : 0;
    }
  }

  return {
    ...state,
    broadcastEvents: broadcasts
      .sort((left, right) => left.atMs - right.atMs)
      .slice(0, 18),
  };
}

export function getContestantBroadcastStatus(contestant: VaultContestantState, elapsedMs: number): ContestantStatus {
  if (contestant.finalAmount != null && (contestant.finishTimeMs ?? 0) <= elapsedMs) {
    return contestant.outcomeType === 'signedVerdict' ? 'Locked' : 'Finished';
  }
  const finalEventAt = contestant.offerHistory.length >= 7 ? contestant.offerHistory[6]?.round : null;
  if (finalEventAt != null && elapsedMs >= Math.max(0, (contestant.finishTimeMs ?? 0) - 12000)) return 'Final Battery';
  return 'Charging';
}

export function rankVaultContestants(contestants: VaultContestantState[]): RankedVaultResult[] {
  return [...contestants]
    .sort((left, right) => {
      const amountDelta = (right.finalAmount ?? -1) - (left.finalAmount ?? -1);
      if (amountDelta !== 0) return amountDelta;
      const timeDelta = (left.finishTimeMs ?? Number.MAX_SAFE_INTEGER) - (right.finishTimeMs ?? Number.MAX_SAFE_INTEGER);
      if (timeDelta !== 0) return timeDelta;
      return left.originalTurnOrderIndex - right.originalTurnOrderIndex;
    })
    .map((contestant, index) => ({ ...contestant, placement: index + 1 }));
}

export function buildRawResults(contestants: VaultContestantState[]) {
  return Object.fromEntries(contestants.map((contestant) => [contestant.contestantId, contestant.finalAmount ?? 0]));
}

export function assertBroadcastPrivacy(events: BroadcastEvent[]) {
  const forbidden = /\b(winning|losing|winner|loser|final result|final amount|current leader)\b/i;
  return events.every((event) => !forbidden.test(event.message));
}
