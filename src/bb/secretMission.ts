/**
 * secretMission.ts — centralized secret mission framework.
 *
 * This module intentionally stays side-effect free so reducers, middleware,
 * and tests can share the same rules.
 */

// ── Status lifecycle ──────────────────────────────────────────────────────────

export type SecretMissionStatus =
  | 'available'
  | 'offered'
  | 'accepted'
  | 'declined'
  | 'rewardPending'
  | 'rewardClaimed'
  | 'expired';

// ── Task / requirement types ─────────────────────────────────────────────────

export type LegacyMissionTaskType =
  | 'confessional_visits'
  | 'conversation_turns';

export type SecretMissionRequirementType =
  | 'survive_days'
  | 'competition_placement'
  | 'avoid_last_place'
  | 'public_approval_gain'
  | 'social_energy_empty_streak'
  | 'social_action_count'
  | 'easter_egg_discovery'
  | 'incoming_response_streak'
  | 'target_nominated';

export type MissionTaskType = LegacyMissionTaskType | SecretMissionRequirementType;

export interface MissionTask {
  /** Unique within a mission instance. */
  id: string;
  type: MissionTaskType;
  description: string;
  current: number;
  target: number;
  completed: boolean;
  /** Inclusive mission window start / end day. */
  startDay?: number;
  endDay?: number;
  /** Inclusive deadline day for target-style requirements. */
  targetDay?: number;
  /** Distinct-day gating for legacy and streak requirements. */
  uniqueDays?: string[];
  /** Manual social actions that count for this task. */
  requiredActionIds?: string[];
  /** Target player for nomination requirements. */
  targetPlayerId?: string;
  /** Max placement that counts as success (1 = win, 2 = top 2, etc.). */
  placementThreshold?: number;
  /** Starting approval captured when the mission is accepted. */
  baselineApproval?: number;
  /** Minimum approval increase needed relative to baseline. */
  requiredDelta?: number;
  /** Easter eggs discovered so far for this requirement. */
  discoveredEggIds?: string[];
  /** Current / best consecutive streak counts. */
  currentStreak?: number;
  maxStreak?: number;
  /** Human-readable audit breadcrumbs. */
  auditLog?: string[];
  firstSatisfiedDay?: number;
  lastProgressDay?: number;
}

// ── Reward types ──────────────────────────────────────────────────────────────

export type LegacyMissionRewardType =
  | 'plus1000Influence'
  | 'doubleVote'
  | 'voteDeduction'
  | 'emptyBox';

export type MissionRewardType = LegacyMissionRewardType | 'immunity';
export type MissionRewardDuration = 1 | 2 | 3;

export const MYSTERY_BOX_POOL: readonly LegacyMissionRewardType[] = [
  'plus1000Influence',
  'doubleVote',
  'voteDeduction',
  'emptyBox',
] as const;

export interface SecretMissionReward {
  type: MissionRewardType;
  consumed: boolean;
  expired: boolean;
  eligible: boolean;
  /** Immunity-only fields. */
  durationDays?: MissionRewardDuration;
  claimDay?: number;
  activeUntilDay?: number;
  usedDay?: number | null;
}

export function createMissionReward(type: LegacyMissionRewardType): SecretMissionReward {
  return {
    type,
    consumed: false,
    expired: false,
    eligible: type !== 'emptyBox',
  };
}

export function createImmunityReward(
  durationDays: MissionRewardDuration,
  claimDay: number,
): SecretMissionReward {
  return {
    type: 'immunity',
    consumed: false,
    expired: false,
    eligible: true,
    durationDays,
    claimDay,
    activeUntilDay: claimDay + durationDays - 1,
    usedDay: null,
  };
}

// ── Mission state ─────────────────────────────────────────────────────────────

export interface SecretMissionState {
  triggeredDay: number;
  startDay: number;
  endDay: number;
  survivalWindowEndDay: number;
  targetDeadlineDay: number;
  status: SecretMissionStatus;
  offeredDay: number | null;
  offerCount: number;
  declinedDay: number | null;
  tasks: MissionTask[];
  templateId: string;
  reward?: SecretMissionReward;
  discoveredEasterEggIds?: string[];
}

// ── Mission templates ────────────────────────────────────────────────────────

type WeightedRequirementType = Exclude<
  SecretMissionRequirementType,
  'survive_days'
>;

export interface MissionBuildContext {
  triggeredDay: number;
  templateId: string;
  targetCandidateIds?: string[];
}

export interface MissionTemplate {
  id: string;
  title: string;
  description: string;
  daySpan: number;
  requirementWeights: Record<WeightedRequirementType, number>;
  buildTasks: (context: MissionBuildContext) => Omit<MissionTask, 'completed' | 'current'>[];
}

const EXTRA_REQUIREMENT_TYPES: WeightedRequirementType[] = [
  'competition_placement',
  'avoid_last_place',
  'public_approval_gain',
  'social_energy_empty_streak',
  'social_action_count',
  'easter_egg_discovery',
  'incoming_response_streak',
  'target_nominated',
];

function hashString(value: string): number {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function createSeededRng(seed: number): () => number {
  let state = (seed >>> 0) || 1;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

function weightedPickDistinct(
  weights: Record<WeightedRequirementType, number>,
  count: number,
  rng: () => number,
): WeightedRequirementType[] {
  const selected: WeightedRequirementType[] = [];
  const remaining = [...EXTRA_REQUIREMENT_TYPES];

  while (selected.length < count && remaining.length > 0) {
    const total = remaining.reduce((sum, key) => sum + Math.max(0, weights[key] ?? 0), 0);
    if (total <= 0) {
      selected.push(remaining.shift()!);
      continue;
    }
    let roll = rng() * total;
    let picked: WeightedRequirementType | null = null;
    for (const key of remaining) {
      roll -= Math.max(0, weights[key] ?? 0);
      if (roll <= 0) {
        picked = key;
        break;
      }
    }
    const chosen = picked ?? remaining[remaining.length - 1];
    selected.push(chosen);
    remaining.splice(remaining.indexOf(chosen), 1);
  }

  return selected;
}

function pickTargetCandidate(
  context: MissionBuildContext,
  rng: () => number,
): string {
  const candidates = context.targetCandidateIds?.length
    ? context.targetCandidateIds
    : ['target-a', 'target-b', 'target-c'];
  return candidates[Math.floor(rng() * candidates.length)] ?? candidates[0];
}

function buildRequirementTask(
  type: SecretMissionRequirementType,
  context: MissionBuildContext,
  endDay: number,
  rng: () => number,
): Omit<MissionTask, 'completed' | 'current'> {
  const startDay = context.triggeredDay;
  switch (type) {
    case 'survive_days':
      return {
        id: `survive_days_${context.templateId}`,
        type,
        description: `Survive until Day ${endDay}`,
        target: endDay,
        startDay,
        endDay,
        targetDay: endDay,
      };
    case 'competition_placement': {
      const placementThreshold = rng() < 0.5 ? 2 : 3;
      return {
        id: `competition_placement_${context.templateId}`,
        type,
        description: `Finish in the top ${placementThreshold} of a competition before Day ${endDay}`,
        target: 1,
        startDay,
        endDay,
        targetDay: endDay,
        placementThreshold,
      };
    }
    case 'avoid_last_place':
      return {
        id: `avoid_last_place_${context.templateId}`,
        type,
        description: `Avoid last place in 2 competitions before Day ${endDay}`,
        target: 2,
        startDay,
        endDay,
        targetDay: endDay,
      };
    case 'public_approval_gain': {
      const requiredDelta = rng() < 0.5 ? 5 : 7;
      return {
        id: `public_approval_gain_${context.templateId}`,
        type,
        description: `Improve your public rating by ${requiredDelta} points before Day ${endDay}`,
        target: requiredDelta,
        startDay,
        endDay,
        targetDay: endDay,
        requiredDelta,
      };
    }
    case 'social_energy_empty_streak': {
      const streak = rng() < 0.5 ? 2 : 3;
      return {
        id: `social_energy_empty_streak_${context.templateId}`,
        type,
        description: `Spend all your social energy for ${streak} consecutive days`,
        target: streak,
        startDay,
        endDay,
        targetDay: endDay,
        currentStreak: 0,
        maxStreak: 0,
        uniqueDays: [],
      };
    }
    case 'social_action_count': {
      const actionSets = [
        ['compliment', 'whisper', 'group_chat'],
        ['proposeAlliance', 'compliment', 'whisper'],
        ['rumor', 'whisper', 'proposeAlliance'],
      ] as const;
      const selectedSet = actionSets[Math.floor(rng() * actionSets.length)] ?? actionSets[0];
      return {
        id: `social_action_count_${context.templateId}`,
        type,
        description: `Complete 3 social interactions (${selectedSet.join(', ')}) before Day ${endDay}`,
        target: 3,
        startDay,
        endDay,
        targetDay: endDay,
        requiredActionIds: [...selectedSet],
      };
    }
    case 'easter_egg_discovery':
      return {
        id: `easter_egg_discovery_${context.templateId}`,
        type,
        description: 'Discover a hidden Big Eye easter egg',
        target: 1,
        startDay,
        endDay,
        targetDay: endDay,
        discoveredEggIds: [],
      };
    case 'incoming_response_streak': {
      const streak = rng() < 0.5 ? 2 : 3;
      return {
        id: `incoming_response_streak_${context.templateId}`,
        type,
        description: `Respond to every incoming social request for ${streak} consecutive days`,
        target: streak,
        startDay,
        endDay,
        targetDay: endDay,
        currentStreak: 0,
        maxStreak: 0,
        uniqueDays: [],
      };
    }
    case 'target_nominated': {
      const targetPlayerId = pickTargetCandidate(context, rng);
      return {
        id: `target_nominated_${context.templateId}`,
        type,
        description: `Get your marked target nominated before Day ${endDay}`,
        target: 1,
        startDay,
        endDay,
        targetDay: endDay,
        targetPlayerId,
      };
    }
    default:
      return {
        id: `survive_days_${context.templateId}`,
        type: 'survive_days',
        description: `Survive until Day ${endDay}`,
        target: endDay,
        startDay,
        endDay,
        targetDay: endDay,
      };
  }
}

function buildWeightedTaskStack(
  context: MissionBuildContext,
  daySpan: number,
  weights: Record<WeightedRequirementType, number>,
): Omit<MissionTask, 'completed' | 'current'>[] {
  const endDay = context.triggeredDay + daySpan;
  const rng = createSeededRng(hashString(`${context.templateId}:${context.triggeredDay}:${endDay}`));
  const chosenTypes = weightedPickDistinct(weights, 4, rng);
  return [
    buildRequirementTask('survive_days', context, endDay, rng),
    ...chosenTypes.map((type) => buildRequirementTask(type, context, endDay, rng)),
  ];
}

export const MISSION_TEMPLATES: MissionTemplate[] = [
  {
    id: 'silent_witness',
    title: 'The Silent Witness',
    description: 'A balanced stack that rewards survival, public poise, and careful information work.',
    daySpan: 3,
    requirementWeights: {
      competition_placement: 3,
      avoid_last_place: 2,
      public_approval_gain: 4,
      social_energy_empty_streak: 2,
      social_action_count: 4,
      easter_egg_discovery: 2,
      incoming_response_streak: 3,
      target_nominated: 3,
    },
    buildTasks: (context) => buildWeightedTaskStack(context, 3, {
      competition_placement: 3,
      avoid_last_place: 2,
      public_approval_gain: 4,
      social_energy_empty_streak: 2,
      social_action_count: 4,
      easter_egg_discovery: 2,
      incoming_response_streak: 3,
      target_nominated: 3,
    }),
  },
  {
    id: 'public_operator',
    title: 'The Public Operator',
    description: 'Viewers, social pressure, and timing all matter in this stack.',
    daySpan: 4,
    requirementWeights: {
      competition_placement: 2,
      avoid_last_place: 1,
      public_approval_gain: 5,
      social_energy_empty_streak: 2,
      social_action_count: 4,
      easter_egg_discovery: 1,
      incoming_response_streak: 4,
      target_nominated: 3,
    },
    buildTasks: (context) => buildWeightedTaskStack(context, 4, {
      competition_placement: 2,
      avoid_last_place: 1,
      public_approval_gain: 5,
      social_energy_empty_streak: 2,
      social_action_count: 4,
      easter_egg_discovery: 1,
      incoming_response_streak: 4,
      target_nominated: 3,
    }),
  },
  {
    id: 'pressure_cooker',
    title: 'The Pressure Cooker',
    description: 'A tempo-heavy stack built around competition composure and streak maintenance.',
    daySpan: 3,
    requirementWeights: {
      competition_placement: 4,
      avoid_last_place: 4,
      public_approval_gain: 2,
      social_energy_empty_streak: 4,
      social_action_count: 2,
      easter_egg_discovery: 1,
      incoming_response_streak: 2,
      target_nominated: 2,
    },
    buildTasks: (context) => buildWeightedTaskStack(context, 3, {
      competition_placement: 4,
      avoid_last_place: 4,
      public_approval_gain: 2,
      social_energy_empty_streak: 4,
      social_action_count: 2,
      easter_egg_discovery: 1,
      incoming_response_streak: 2,
      target_nominated: 2,
    }),
  },
  {
    id: 'social_engine',
    title: 'The Social Engine',
    description: 'Built for social maneuvering, inbox discipline, and alliance pressure.',
    daySpan: 4,
    requirementWeights: {
      competition_placement: 1,
      avoid_last_place: 2,
      public_approval_gain: 3,
      social_energy_empty_streak: 3,
      social_action_count: 5,
      easter_egg_discovery: 2,
      incoming_response_streak: 5,
      target_nominated: 3,
    },
    buildTasks: (context) => buildWeightedTaskStack(context, 4, {
      competition_placement: 1,
      avoid_last_place: 2,
      public_approval_gain: 3,
      social_energy_empty_streak: 3,
      social_action_count: 5,
      easter_egg_discovery: 2,
      incoming_response_streak: 5,
      target_nominated: 3,
    }),
  },
  {
    id: 'big_eye_gambit',
    title: 'The Big Eye Gambit',
    description: 'A volatile stack mixing hidden Big Eye discoveries with strategic nomination timing.',
    daySpan: 3,
    requirementWeights: {
      competition_placement: 2,
      avoid_last_place: 2,
      public_approval_gain: 3,
      social_energy_empty_streak: 2,
      social_action_count: 3,
      easter_egg_discovery: 5,
      incoming_response_streak: 2,
      target_nominated: 4,
    },
    buildTasks: (context) => buildWeightedTaskStack(context, 3, {
      competition_placement: 2,
      avoid_last_place: 2,
      public_approval_gain: 3,
      social_energy_empty_streak: 2,
      social_action_count: 3,
      easter_egg_discovery: 5,
      incoming_response_streak: 2,
      target_nominated: 4,
    }),
  },
];

export function buildMissionTasks(
  template: MissionTemplate,
  triggeredDay: number,
  options?: Omit<MissionBuildContext, 'triggeredDay' | 'templateId'>,
): MissionTask[] {
  return template.buildTasks({
    triggeredDay,
    templateId: template.id,
    targetCandidateIds: options?.targetCandidateIds,
  }).map((task) => ({
    ...task,
    current: 0,
    completed: false,
  }));
}

// ── Trigger odds ──────────────────────────────────────────────────────────────

export const DEFAULT_TRIGGER_CHANCES: Readonly<Record<number, number>> = {
  3: 0.18,
  4: 0.22,
  5: 0.26,
  6: 0.30,
  7: 0.34,
  8: 0.38,
  9: 0.42,
  10: 0.46,
  11: 0.50,
  12: 0.54,
} as const;

function resolveAliveCountAndOverride(
  aliveCountOrOverride?: number | null,
  overrideMaybe?: number | null,
): { aliveCount: number | null; override: number | null | undefined } {
  if (overrideMaybe === undefined) {
    return {
      aliveCount: null,
      override: aliveCountOrOverride,
    };
  }
  return {
    aliveCount: aliveCountOrOverride ?? null,
    override: overrideMaybe,
  };
}

export function getSecretMissionTriggerChance(
  day: number,
  aliveCountOrOverride?: number | null,
  overrideMaybe?: number | null,
): number {
  const { aliveCount, override } = resolveAliveCountAndOverride(aliveCountOrOverride, overrideMaybe);
  if (day < 3) return 0;
  if (aliveCount !== null && aliveCount <= 5) return 0;
  if (override !== null && override !== undefined) {
    return Math.max(0, Math.min(100, override)) / 100;
  }
  if (day in DEFAULT_TRIGGER_CHANCES) return DEFAULT_TRIGGER_CHANCES[day] ?? 0;
  return 0.54;
}

export function checkSecretMissionTrigger(
  day: number,
  rng: () => number,
  aliveCountOrOverride?: number | null,
  overrideMaybe?: number | null,
): boolean {
  const chance = getSecretMissionTriggerChance(day, aliveCountOrOverride, overrideMaybe);
  if (chance <= 0) return false;
  if (chance >= 1) return true;
  return rng() < chance;
}

export function pickMissionTemplate(day: number): MissionTemplate {
  const idx = (day * 3) % MISSION_TEMPLATES.length;
  return MISSION_TEMPLATES[idx];
}

export function createSecretMissionState(day: number): SecretMissionState {
  const template = pickMissionTemplate(day);
  const endDay = day + template.daySpan;
  return {
    triggeredDay: day,
    startDay: day,
    endDay,
    survivalWindowEndDay: endDay,
    targetDeadlineDay: endDay,
    status: 'available',
    offeredDay: null,
    offerCount: 0,
    declinedDay: null,
    tasks: [],
    templateId: template.id,
    discoveredEasterEggIds: [],
  };
}

export function pickMissionImmunityDuration(
  triggeredDay: number,
  templateId: string,
): MissionRewardDuration {
  const duration = (hashString(`${templateId}:${triggeredDay}:reward`) % 3) + 1;
  return duration as MissionRewardDuration;
}

export function doubleVoteTimingMessage(currentPhase: string): string {
  if (currentPhase === 'live_vote') {
    return (
      'Your Double Vote is active right now — return to the game immediately ' +
      'to use it before the vote closes. ⏳🗳️🗳️'
    );
  }
  return (
    'This power cannot interrupt a vote already in motion. ' +
    'Your Double Vote will be offered automatically at the next live elimination — ' +
    'the moment the house is asked to cast their votes. ' +
    'Stay in the game and it will activate itself at exactly the right time. 🗳️🗳️'
  );
}

// ── Activation guards ─────────────────────────────────────────────────────────

export interface ActivationCheckState {
  phase: string;
  week?: number;
  secretMission?: SecretMissionState;
  nomineeIds: readonly string[];
  lohId?: string | null;
  posWinnerId?: string | null;
  players: ReadonlyArray<{ id: string; isUser?: boolean; status: string }>;
  doubleEviction?: { weekActive?: boolean } | null;
  voteResults?: Record<string, number> | null;
  awaitingTieBreak?: boolean;
}

const FINAL4_OR_LATER_PHASES = new Set([
  'final4_eviction',
  'final3',
  'final3_comp1',
  'final3_comp1_minigame',
  'final3_comp2',
  'final3_comp2_minigame',
  'final3_comp3',
  'final3_comp3_minigame',
  'final3_decision',
  'jury_announcement',
  'jury_cinematic',
  'jury',
]);

export function isFinal4OrLater(phase: string): boolean {
  return FINAL4_OR_LATER_PHASES.has(phase);
}

export function hasDoubleVoteConflict(state: ActivationCheckState): boolean {
  return state.doubleEviction?.weekActive === true;
}

export function hasVoteDeductionConflict(state: ActivationCheckState): boolean {
  return state.doubleEviction?.weekActive === true || state.awaitingTieBreak === true;
}

export function canUseDoubleVote(state: ActivationCheckState): boolean {
  const reward = state.secretMission?.reward;
  if (!reward || reward.type !== 'doubleVote' || !reward.eligible) return false;
  if (state.phase !== 'live_vote') return false;
  if (isFinal4OrLater(state.phase)) return false;
  if (hasDoubleVoteConflict(state)) return false;

  const humanPlayer = state.players.find((player) => player.isUser);
  if (!humanPlayer || humanPlayer.status === 'evicted' || humanPlayer.status === 'jury') return false;
  if (humanPlayer.id === state.lohId) return false;
  if (state.nomineeIds.includes(humanPlayer.id)) return false;
  return true;
}

export function canUseVoteDeduction(state: ActivationCheckState): boolean {
  const reward = state.secretMission?.reward;
  if (!reward || reward.type !== 'voteDeduction' || !reward.eligible) return false;
  if (state.phase !== 'eviction_results') return false;
  if (isFinal4OrLater(state.phase)) return false;
  if (hasVoteDeductionConflict(state)) return false;
  if (!state.voteResults) return false;

  const humanPlayer = state.players.find((player) => player.isUser);
  if (!humanPlayer) return false;
  if (!state.nomineeIds.includes(humanPlayer.id)) return false;

  const humanVoteCount = state.voteResults[humanPlayer.id] ?? 0;
  if (humanVoteCount <= 0) return false;

  const afterDeduction = humanVoteCount - 1;
  const otherCounts = state.nomineeIds
    .filter((id) => id !== humanPlayer.id)
    .map((id) => state.voteResults?.[id] ?? 0);
  if (otherCounts.some((count) => count === afterDeduction)) return false;

  return true;
}

export function canOfferMissionImmunity(state: ActivationCheckState): boolean {
  const reward = state.secretMission?.reward;
  if (!reward || reward.type !== 'immunity' || !reward.eligible) return false;
  if (state.phase !== 'pos_ceremony_results') return false;
  if (isFinal4OrLater(state.phase)) return false;
  if (typeof state.week === 'number' && reward.activeUntilDay !== undefined && state.week > reward.activeUntilDay) {
    return false;
  }

  const humanPlayer = state.players.find((player) => player.isUser);
  if (!humanPlayer || humanPlayer.status === 'evicted' || humanPlayer.status === 'jury') return false;
  if (state.posWinnerId && humanPlayer.id === state.posWinnerId) return false;
  return state.nomineeIds.includes(humanPlayer.id);
}
