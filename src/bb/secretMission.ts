/**
 * secretMission.ts — Centralized secret mission framework (PR 1 + PR 2).
 *
 * Responsibilities:
 *  - Types for secret mission state & mission templates
 *  - Default trigger-chance table (Day 5–12)
 *  - getSecretMissionTriggerChance() — pure lookup, easy to test
 *  - checkSecretMissionTrigger()    — pure roll, easy to test
 *  - MISSION_TEMPLATES              — pool of templates for the season
 *  - Reward types, pool, and helpers (PR 2)
 *
 * What is NOT here:
 *  - Redux reducers (gameSlice.ts)
 *  - UI rendering (DiaryRoom.tsx)
 *  - Vote / ceremony activation logic (PR 3)
 *
 * Keep this file free of side effects so it can be unit-tested in isolation.
 */

// ── Status lifecycle ──────────────────────────────────────────────────────────

/**
 * Lifecycle states for a single secret mission.
 *
 *  available    → mission has triggered; Big Eye hasn't offered it yet
 *  offered      → Big Eye offered it in the Confessional; awaiting player response
 *  accepted      → player accepted; checklist is active
 *  declined      → player declined; one re-offer may still be pending
 *  rewardPending → checklist completed; reward awaiting claim
 *  expired      → time window closed without completion
 */
export type SecretMissionStatus =
  | 'available'
  | 'offered'
  | 'accepted'
  | 'declined'
  | 'rewardPending'
  | 'rewardClaimed'
  | 'expired';

// ── Task types ─────────────────────────────────────────────────────────────

/** Discriminated union of task categories for extensibility. */
export type MissionTaskType =
  | 'confessional_visits'
  | 'conversation_turns'
  | 'survive_days';

export interface MissionTask {
  /** Unique within a mission instance. */
  id: string;
  type: MissionTaskType;
  description: string;
  current: number;
  target: number;
  completed: boolean;
}

// ── Mission state (stored in GameState.secretMission) ────────────────────────

// ── Reward types (PR 2) ──────────────────────────────────────────────────────

/**
 * The four possible mystery box outcomes.
 *  - plus1000Influence : immediately add 1 000 influence to the player's bank
 *  - doubleVote        : stored power — cast two votes in a future live vote (PR 3)
 *  - voteDeduction     : stored power — deduct one vote cast against player (PR 3)
 *  - emptyBox          : dud; no power granted
 */
export type MissionRewardType =
  | 'plus1000Influence'
  | 'doubleVote'
  | 'voteDeduction'
  | 'emptyBox';

/**
 * Ordered pool: exactly one of each outcome.
 * The UI shuffles a copy of this array at render time so each reveal is
 * unpredictable, but the reducer only ever records the chosen type.
 */
export const MYSTERY_BOX_POOL: readonly MissionRewardType[] = [
  'plus1000Influence',
  'doubleVote',
  'voteDeduction',
  'emptyBox',
] as const;

/**
 * Centralized storage for a claimed mystery-box reward.
 *
 * Design notes for PR 3:
 *  - `consumed` is flipped to true when the power is activated in live gameplay.
 *  - `expired`  is flipped to true when Final 4 is reached before use.
 *  - `eligible` is a derived convenience flag (not consumed AND not expired AND type ≠ emptyBox).
 *    It is recomputed whenever consumed/expired change so PR 3 can read it cheaply.
 */
export interface SecretMissionReward {
  type: MissionRewardType;
  /** True once the power has been activated / used in live gameplay. */
  consumed: boolean;
  /** True once the Final 4 week is reached and the reward can no longer be used. */
  expired: boolean;
  /**
   * True when the reward is available for future use.
   * Equivalent to: !consumed && !expired && type !== 'emptyBox'.
   */
  eligible: boolean;
}

/**
 * Create a fresh SecretMissionReward for the given type.
 * The empty box is never eligible (it is a harmless dud).
 */
export function createMissionReward(type: MissionRewardType): SecretMissionReward {
  return {
    type,
    consumed: false,
    expired: false,
    eligible: type !== 'emptyBox',
  };
}

export interface SecretMissionState {
  /** Which game week (= day) the mission triggered. */
  triggeredDay: number;
  /** Current lifecycle status. */
  status: SecretMissionStatus;
  /** Which day the Confessional offer was first shown; null until offered. */
  offeredDay: number | null;
  /** How many times the mission has been offered (capped at 2 for re-offer). */
  offerCount: number;
  /** Which day the player declined the mission; null until declined. */
  declinedDay: number | null;
  /** Active checklist tasks. Populated when status moves to 'accepted'. */
  tasks: MissionTask[];
  /** Template identifier used to generate this mission instance. */
  templateId: string;
  /**
   * The mystery-box reward claimed after mission completion.
   * Populated when status transitions to 'rewardClaimed'.
   * Undefined until the player opens the Confessional and selects a box.
   */
  reward?: SecretMissionReward;
}

// ── Mission templates ────────────────────────────────────────────────────────

export interface MissionTemplate {
  id: string;
  /** Short human-readable mission title. */
  title: string;
  /** Flavour description shown when the player accepts. */
  description: string;
  /**
   * Factory that produces the task list for this template.
   * @param triggeredDay  The game week on which the mission triggered, used to
   *                      compute day-relative targets (e.g. "survive until Day X").
   */
  buildTasks: (triggeredDay: number) => Omit<MissionTask, 'completed' | 'current'>[];
}

/**
 * PR 1 template pool — one simple mission that only uses already-tracked actions.
 *
 * Expand this pool in later PRs without touching trigger or lifecycle logic.
 */
export const MISSION_TEMPLATES: MissionTemplate[] = [
  {
    id: 'silent_witness',
    title: 'The Silent Witness',
    description:
      'The Big Eye has been watching. Complete the private checklist and a reward awaits.',
    buildTasks: (triggeredDay) => [
      {
        id: 'confessional_visits',
        type: 'confessional_visits' as const,
        description: 'Visit the Confessional 3 times',
        target: 3,
      },
      {
        id: 'conversation_turns',
        type: 'conversation_turns' as const,
        description: 'Complete 6 exchanges with the Big Eye',
        target: 6,
      },
      {
        id: 'survive_days',
        type: 'survive_days' as const,
        description: `Survive until Day ${triggeredDay + 3}`,
        target: triggeredDay + 3,
      },
    ],
  },
];

/**
 * Build the initial task list for a given template, with current=0 and completed=false.
 */
export function buildMissionTasks(template: MissionTemplate, triggeredDay: number): MissionTask[] {
  return template.buildTasks(triggeredDay).map((t) => ({
    ...t,
    current: 0,
    completed: false,
  }));
}

// ── Default trigger chances ──────────────────────────────────────────────────

/**
 * Default daily trigger probabilities (0–1) for the secret mission window.
 * Only days 5–12 are eligible; earlier and later days always return 0.
 */
export const DEFAULT_TRIGGER_CHANCES: Readonly<Record<number, number>> = {
  5:  0.10,
  6:  0.15,
  7:  0.20,
  8:  0.25,
  9:  0.30,
  10: 0.40,
  11: 0.50,
  12: 0.75,
} as const;

/**
 * Return the trigger probability for a given day.
 *
 * @param day             Current game week / day number (1-based).
 * @param overridePercent DEBUG-ONLY: when provided (0–100), this percentage is
 *                        used instead of the default table.  Pass null/undefined
 *                        to use default behaviour.  See Settings → Twists.
 * @returns               Probability in [0, 1].
 */
export function getSecretMissionTriggerChance(
  day: number,
  overridePercent?: number | null,
): number {
  if (day < 5 || day > 12) return 0;
  if (overridePercent !== null && overridePercent !== undefined) {
    return Math.max(0, Math.min(100, overridePercent)) / 100;
  }
  return DEFAULT_TRIGGER_CHANCES[day] ?? 0;
}

/**
 * Roll to determine whether the secret mission triggers on a given day.
 *
 * Rules:
 *  - Only fires on days 5–12.
 *  - At most one trigger per season (callers must check `secretMission == null`).
 *  - The override at 100 guarantees a trigger on Day 5+; at 0 it never triggers.
 *
 * @param day             Current game week / day.
 * @param rng             A [0,1) pseudo-random number generator.
 * @param overridePercent DEBUG-ONLY override (see getSecretMissionTriggerChance).
 */
export function checkSecretMissionTrigger(
  day: number,
  rng: () => number,
  overridePercent?: number | null,
): boolean {
  const chance = getSecretMissionTriggerChance(day, overridePercent);
  if (chance <= 0) return false;
  if (chance >= 1) return true;
  return rng() < chance;
}

/**
 * Pick a mission template by cycling through the template pool with the
 * current day as the seed index.  Keeps template selection deterministic.
 */
export function pickMissionTemplate(day: number): MissionTemplate {
  return MISSION_TEMPLATES[day % MISSION_TEMPLATES.length];
}

/**
 * Build a new SecretMissionState for the given day.
 * The returned object has status 'available' and no tasks yet (tasks are added
 * when the player accepts).
 */
export function createSecretMissionState(day: number): SecretMissionState {
  const template = pickMissionTemplate(day);
  return {
    triggeredDay: day,
    status: 'available',
    offeredDay: null,
    offerCount: 0,
    declinedDay: null,
    tasks: [],
    templateId: template.id,
  };
}
