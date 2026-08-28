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
  /** When true, each required action only counts once toward the task. */
  requireDistinctActionIds?: boolean;
  /** Distinct social actions already credited for this task. */
  completedActionIds?: string[];
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
  optional?: boolean;
}

// ── Reward types ──────────────────────────────────────────────────────────────

export type LegacyMissionRewardType =
  | 'plus1000Influence'
  | 'doubleVote'
  | 'voteDeduction'
  | 'emptyBox';

export type MissionRewardType = LegacyMissionRewardType | 'immunity';
export type MissionRewardDuration = 1 | 2 | 3;
export type SecretMissionBoxRewardType = Exclude<MissionRewardType, 'emptyBox'>;

export const MYSTERY_BOX_POOL: readonly LegacyMissionRewardType[] = [
  'plus1000Influence',
  'doubleVote',
  'voteDeduction',
  'emptyBox',
] as const;

export const SECRET_MISSION_BOX_REWARDS: readonly SecretMissionBoxRewardType[] = [
  'plus1000Influence',
  'doubleVote',
  'voteDeduction',
  'immunity',
] as const;

export function getSecretMissionBoxRewards(
  mission: Pick<SecretMissionState, 'triggeredDay' | 'templateId' | 'missionNumber'>,
): SecretMissionBoxRewardType[] {
  const rewards = [...SECRET_MISSION_BOX_REWARDS];
  const rng = createSeededRng(
    hashString(
      `${mission.templateId}:${mission.triggeredDay}:${mission.missionNumber ?? 1}:reward-boxes`,
    ),
  );

  for (let i = rewards.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    [rewards[i], rewards[j]] = [rewards[j], rewards[i]];
  }

  return rewards;
}

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
  missionNumber?: number;
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

export interface MissionCapabilities {
  /** Public Meter objectives require Public Mode to be active for this season. */
  publicModeEnabled: boolean;
}

export interface MissionBuildContext {
  triggeredDay: number;
  templateId: string;
  targetCandidateIds?: string[];
  variant?: number;
}

export interface MissionTemplate {
  id: string;
  title: string;
  description: string;
  daySpan: number;
  requirementWeights: Record<WeightedRequirementType, number>;
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

function getEligibleRequirementTypes(
  capabilities?: MissionCapabilities,
): WeightedRequirementType[] {
  return EXTRA_REQUIREMENT_TYPES.filter((type) => {
    if (type === 'public_approval_gain') {
      return capabilities?.publicModeEnabled !== false;
    }
    return true;
  });
}

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
  eligibleTypes: readonly WeightedRequirementType[] = EXTRA_REQUIREMENT_TYPES,
): WeightedRequirementType[] {
  const selected: WeightedRequirementType[] = [];
  const remaining = [...eligibleTypes];

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

interface SocialActionTaskBlueprint {
  description: (params: { endDay: number; targetLabel?: string }) => string;
  target: number;
  requiredActionIds: string[];
  requireDistinctActionIds?: boolean;
  needsTarget?: boolean;
}

const SOCIAL_ACTION_TASK_BLUEPRINTS: readonly SocialActionTaskBlueprint[] = [
  {
    description: ({ endDay, targetLabel = 'your marked target' }) =>
      `Form an alliance with ${targetLabel} before Day ${endDay}`,
    target: 1,
    requiredActionIds: ['ally', 'proposeAlliance'],
    needsTarget: true,
  },
  {
    description: ({ endDay, targetLabel = 'your marked target' }) =>
      `Start a fight with ${targetLabel} before Day ${endDay}`,
    target: 1,
    requiredActionIds: ['startFight'],
    needsTarget: true,
  },
  {
    description: ({ endDay }) =>
      `Complete this social set before Day ${endDay}: compliment, whisper, and group chat`,
    target: 3,
    requiredActionIds: ['compliment', 'whisper', 'group_chat'],
    requireDistinctActionIds: true,
  },
  {
    description: ({ endDay }) =>
      `Complete this social set before Day ${endDay}: rumor, vote rally, and favour request`,
    target: 3,
    requiredActionIds: ['rumor', 'vote_rally', 'favor_request'],
    requireDistinctActionIds: true,
  },
] as const;

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
        description: `Improve your public rating by ${requiredDelta} percentage points before Day ${endDay}`,
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
      const blueprint = SOCIAL_ACTION_TASK_BLUEPRINTS[Math.floor(rng() * SOCIAL_ACTION_TASK_BLUEPRINTS.length)];
      const targetPlayerId = blueprint.needsTarget ? pickTargetCandidate(context, rng) : undefined;
      return {
        id: `social_action_count_${context.templateId}`,
        type,
        description: blueprint.description({
          endDay,
          targetLabel: targetPlayerId ? 'your marked target' : undefined,
        }),
        target: blueprint.target,
        startDay,
        endDay,
        targetDay: endDay,
        requiredActionIds: [...blueprint.requiredActionIds],
        requireDistinctActionIds: blueprint.requireDistinctActionIds,
        completedActionIds: [],
        targetPlayerId,
      };
    }
    case 'easter_egg_discovery':
      return {
        id: `easter_egg_discovery_${context.templateId}`,
        type,
        description: 'Discover a hidden Big Eye easter egg (optional bonus objective)',
        target: 1,
        startDay,
        endDay,
        targetDay: endDay,
        discoveredEggIds: [],
        optional: true,
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
  capabilities?: MissionCapabilities,
): Omit<MissionTask, 'completed' | 'current'>[] {
  const endDay = context.triggeredDay + daySpan;
  const rng = createSeededRng(
    hashString(`${context.templateId}:${context.triggeredDay}:${endDay}:${context.variant ?? 0}`),
  );
  const eligibleTypes = getEligibleRequirementTypes(capabilities);
  if (eligibleTypes.length < 4) {
    throw new Error(
      `Secret mission requires 4 eligible objectives, but only ${eligibleTypes.length} are available`,
    );
  }
  const chosenTypes = weightedPickDistinct(weights, 4, rng, eligibleTypes);
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
  },
];

export function buildMissionTasks(
  template: MissionTemplate,
  triggeredDay: number,
  options?: {
    targetCandidateIds?: string[];
    missionNumber?: number;
    excludedTaskSetSignatures?: string[];
    capabilities?: MissionCapabilities;
  },
): MissionTask[] {
  const excluded = new Set(options?.excludedTaskSetSignatures ?? []);
  let candidate: MissionTask[] = [];

  for (let attempt = 0; attempt < 32; attempt += 1) {
    const context: MissionBuildContext = {
      triggeredDay,
      templateId: template.id,
      targetCandidateIds: options?.targetCandidateIds,
      variant: (options?.missionNumber ?? 1) * 101 + attempt,
    };
    candidate = buildWeightedTaskStack(
      context,
      template.daySpan,
      template.requirementWeights,
      options?.capabilities,
    ).map((task) => ({ ...task, current: 0, completed: false }));
    if (!excluded.has(getMissionTaskSetSignature(candidate))) return candidate;
  }

  return candidate;
}

export function getMissionTaskSetSignature(tasks: readonly Pick<MissionTask, 'type'>[]): string {
  return tasks.map((task) => task.type).sort().join('|');
}

const ORDINAL_TASK_REFERENCES: Readonly<Record<string, number>> = {
  first: 1,
  second: 2,
  third: 3,
  fourth: 4,
  fifth: 5,
};

export function findSecretMissionTaskReference(
  input: string,
  tasks: readonly MissionTask[],
): { task: MissionTask; taskNumber: number } | null {
  const normalized = input.toLowerCase();
  const numeric = normalized.match(/(?:task|mission|number|#)\s*(\d+)/i)
    ?? normalized.match(/\b(\d+)\b/);
  let taskNumber = numeric ? Number(numeric[1]) : 0;
  if (!taskNumber) {
    const ordinal = Object.entries(ORDINAL_TASK_REFERENCES)
      .find(([word]) => normalized.includes(word));
    taskNumber = ordinal?.[1] ?? 0;
  }
  const task = tasks[taskNumber - 1];
  return task ? { task, taskNumber } : null;
}

export function getSecretMissionTaskHint(task: MissionTask, taskNumber: number): string {
  const prefix = `To complete task ${taskNumber}`;
  switch (task.type) {
    case 'social_energy_empty_streak':
      return `${prefix}, use the Social module until your Social Energy badge (⚡) reaches 0 on each required day. The checklist updates when that day ends.`;
    case 'social_action_count':
      return task.requiredActionIds?.length
        ? `${prefix}, open the Social module and perform each listed interaction once: ${task.requiredActionIds.join(', ')}. Repeating the same listed action does not replace a missing one.`
        : `${prefix}, use the Social module for the requested number of successful interactions before the deadline.`;
    case 'incoming_response_streak':
      return `${prefix}, open Incoming Requests and answer every request on each required day. Ignoring even one request breaks that day's streak.`;
    case 'competition_placement':
      return `${prefix}, finish ${task.placementThreshold === 1 ? 'first' : `in the top ${task.placementThreshold}`} in any competition before the deadline.`;
    case 'avoid_last_place':
      return `${prefix}, complete the required number of competitions without finishing last. Each qualifying competition adds one.`;
    case 'public_approval_gain':
      return `${prefix}, raise your Public Meter approval by ${task.requiredDelta ?? task.target} percentage points above the rating you had when you accepted the mission.`;
    case 'target_nominated':
      return `${prefix}, use social strategy such as Pitch Target or Vote Rally to help put your marked player on the block before the deadline.`;
    case 'easter_egg_discovery':
      return `${prefix}, talk naturally with the Big Eye and explore unusual topics or phrases. Hidden discoveries count automatically when you uncover them.`;
    case 'survive_days':
      return `${prefix}, remain in the house through Day ${task.endDay ?? task.target}. It updates automatically as the game advances.`;
    default:
      return `${prefix}, follow this checklist requirement before its deadline: ${task.description}`;
  }
}

export function isSecretMissionSuccessful(tasks: readonly MissionTask[]): boolean {
  if (tasks.length === 0) return false;
  const incompleteRequiredTasks = tasks.filter((task) => !task.completed && !task.optional);
  if (incompleteRequiredTasks.length === 0) return true;

  const hasCompletedOptionalEasterEggTask = tasks.some(
    (task) => task.type === 'easter_egg_discovery' && task.optional && task.completed,
  );

  return hasCompletedOptionalEasterEggTask && incompleteRequiredTasks.length === 1;
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
export const SECOND_SECRET_MISSION_CHANCE = 0.5;

export interface SecretMissionTriggerContext {
  day: number;
  aliveCount?: number | null;
  override?: number | null;
  seasonMissionCount?: number;
  secondMissionRollResolved?: boolean;
}

export function getSecretMissionTriggerChance({
  day,
  aliveCount = null,
  override,
  seasonMissionCount = 0,
  secondMissionRollResolved = false,
}: SecretMissionTriggerContext): number {
  if (day < 3) return 0;
  if (aliveCount !== null && aliveCount <= 5) return 0;
  if (override !== null && override !== undefined) {
    return Math.max(0, Math.min(100, override)) / 100;
  }
  if (seasonMissionCount === 0) return 1;
  if (seasonMissionCount >= 2 || secondMissionRollResolved) return 0;
  return SECOND_SECRET_MISSION_CHANCE;
}

export function checkSecretMissionTrigger(
  context: SecretMissionTriggerContext,
  rng: () => number,
): boolean {
  const chance = getSecretMissionTriggerChance(context);
  if (chance <= 0) return false;
  if (chance >= 1) return true;
  return rng() < chance;
}

export function pickMissionTemplate(day: number, maxDaySpan?: number): MissionTemplate {
  const eligibleTemplates = typeof maxDaySpan === 'number'
    ? MISSION_TEMPLATES.filter((template) => template.daySpan <= maxDaySpan)
    : MISSION_TEMPLATES;
  if (eligibleTemplates.length === 0) {
    const minRequiredDaySpan = Math.min(...MISSION_TEMPLATES.map((template) => template.daySpan));
    throw new Error(
      `No secret mission template fits within ${maxDaySpan} days (minimum required: ${minRequiredDaySpan})`,
    );
  }
  const pool = eligibleTemplates;
  const idx = (day * 3) % pool.length;
  return pool[idx];
}

export function createSecretMissionState(
  day: number,
  options?: { maxDaySpan?: number; missionNumber?: number },
): SecretMissionState {
  const template = pickMissionTemplate(day, options?.maxDaySpan);
  const endDay = day + template.daySpan;
  return {
    triggeredDay: day,
    missionNumber: options?.missionNumber,
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

function getAlivePlayerCount(players: ActivationCheckState['players']): number {
  return players.filter((player) => player.status !== 'evicted' && player.status !== 'jury').length;
}

export function canUseDoubleVote(state: ActivationCheckState): boolean {
  const reward = state.secretMission?.reward;
  if (!reward || reward.type !== 'doubleVote' || !reward.eligible) return false;
  if (state.phase !== 'live_vote') return false;
  if (isFinal4OrLater(state.phase)) return false;
  if (hasDoubleVoteConflict(state)) return false;
  if (getAlivePlayerCount(state.players) <= 4) return false;

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
  if (getAlivePlayerCount(state.players) <= 4) return false;

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
  if (getAlivePlayerCount(state.players) <= 4) return false;
  if (typeof state.week === 'number' && reward.activeUntilDay !== undefined && state.week > reward.activeUntilDay) {
    return false;
  }

  const humanPlayer = state.players.find((player) => player.isUser);
  if (!humanPlayer || humanPlayer.status === 'evicted' || humanPlayer.status === 'jury') return false;
  if (state.posWinnerId && humanPlayer.id === state.posWinnerId) return false;
  return state.nomineeIds.includes(humanPlayer.id);
}
