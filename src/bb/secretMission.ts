/**
 * secretMission.ts — Centralized secret mission framework (PR 1 + PR 2 + PR 3).
 *
 * Responsibilities:
 *  - Types for secret mission state & mission templates
 *  - Default trigger-chance table (Day 5–12)
 *  - getSecretMissionTriggerChance() — pure lookup, easy to test
 *  - checkSecretMissionTrigger()    — pure roll, easy to test
 *  - MISSION_TEMPLATES              — pool of templates for the season
 *  - Reward types, pool, and helpers (PR 2)
 *  - Activation guard helpers: canUseDoubleVote / canUseVoteDeduction (PR 3)
 *
 * What is NOT here:
 *  - Redux reducers (gameSlice.ts)
 *  - UI rendering (DiaryRoom.tsx)
 *
 * Keep this file free of side effects so it can be unit-tested in isolation.
 */

// ── Status lifecycle ──────────────────────────────────────────────────────────

/**
 * Lifecycle states for a single secret mission.
 *
 *  available     → mission has triggered; Big Eye hasn't offered it yet
 *  offered       → Big Eye offered it in the Confessional; awaiting player response
 *  accepted      → player accepted; checklist is active
 *  declined      → player declined; one re-offer may still be pending
 *  rewardPending → checklist completed; reward selection (mystery boxes) awaiting
 *  rewardClaimed → player selected a box; reward stored in `reward` field
 *  expired       → time window closed without completion
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
  /**
   * Anti-cheese tracking for tasks that must span distinct calendar days.
   * Only populated for task types that use unique-day gating
   * (currently `confessional_visits`).  The values are stringified week
   * numbers (e.g. `"7"`) that have already been credited.
   */
  uniqueDays?: string[];
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
 * Mission template pool — five distinct missions that draw on different task
 * combinations so runs feel varied.  Tasks within each mission are designed
 * with anti-cheese rules in mind:
 *   - `confessional_visits` counts UNIQUE DAYS (not raw opens) to prevent
 *     rapid-enter/exit exploitation.
 *   - `survive_days` is always relative to the triggered day.
 *   - `conversation_turns` target is set to a manageable number per visit.
 *
 * `pickMissionTemplate()` cycles through the pool deterministically so the
 * player sees a different layout each trigger day.
 */
export const MISSION_TEMPLATES: MissionTemplate[] = [
  {
    id: 'silent_witness',
    title: 'The Silent Witness',
    description:
      'The Big Eye has been watching. Return to the Confessional on different days ' +
      'and keep the conversation going.',
    buildTasks: (triggeredDay) => [
      {
        id: 'confessional_visits',
        type: 'confessional_visits' as const,
        description: 'Visit the Confessional on 3 different days',
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
  {
    id: 'long_game',
    title: 'The Long Game',
    description:
      'Patience is a weapon. Endure, observe, and keep the Big Eye company.',
    buildTasks: (triggeredDay) => [
      {
        id: 'survive_days',
        type: 'survive_days' as const,
        description: `Survive until Day ${triggeredDay + 4}`,
        target: triggeredDay + 4,
      },
      {
        id: 'conversation_turns',
        type: 'conversation_turns' as const,
        description: 'Complete 8 exchanges with the Big Eye',
        target: 8,
      },
    ],
  },
  {
    id: 'social_butterfly',
    title: 'The Social Butterfly',
    description:
      'Charm the Big Eye with words. Visit on separate days and keep talking.',
    buildTasks: (triggeredDay) => [
      {
        id: 'confessional_visits',
        type: 'confessional_visits' as const,
        description: 'Visit the Confessional on 2 different days',
        target: 2,
      },
      {
        id: 'conversation_turns',
        type: 'conversation_turns' as const,
        description: 'Complete 10 exchanges with the Big Eye',
        target: 10,
      },
      {
        id: 'survive_days',
        type: 'survive_days' as const,
        description: `Survive until Day ${triggeredDay + 2}`,
        target: triggeredDay + 2,
      },
    ],
  },
  {
    id: 'the_strategist',
    title: 'The Strategist',
    description:
      'Strategy takes time. Return across multiple days and weather the storm.',
    buildTasks: (triggeredDay) => [
      {
        id: 'confessional_visits',
        type: 'confessional_visits' as const,
        description: 'Visit the Confessional on 4 different days',
        target: 4,
      },
      {
        id: 'survive_days',
        type: 'survive_days' as const,
        description: `Survive until Day ${triggeredDay + 5}`,
        target: triggeredDay + 5,
      },
    ],
  },
  {
    id: 'the_confessor',
    title: 'The Confessor',
    description:
      'Bare your soul to the Big Eye. Words and days are your currency.',
    buildTasks: (triggeredDay) => [
      {
        id: 'conversation_turns',
        type: 'conversation_turns' as const,
        description: 'Complete 12 exchanges with the Big Eye',
        target: 12,
      },
      {
        id: 'confessional_visits',
        type: 'confessional_visits' as const,
        description: 'Visit the Confessional on 3 different days',
        target: 3,
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
 * Pick a mission template for the given trigger day.
 *
 * The pool has five templates.  We map the trigger day to an index via a small
 * prime-modulo scheme so the sequence of templates across consecutive trigger
 * days cycles through all five without repeating until the pool is exhausted.
 * Using a prime (3) that is co-prime with the pool size (5) guarantees the
 * full pool is visited before any template repeats.
 *
 *   day % 5          → 0 1 2 3 4 0 1 2 3 4 …  (simple cycle)
 *   (day * 3) % 5    → 0 3 1 4 2 0 3 1 4 2 …  (spread cycle — used here)
 */
export function pickMissionTemplate(day: number): MissionTemplate {
  const idx = (day * 3) % MISSION_TEMPLATES.length;
  return MISSION_TEMPLATES[idx];
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

/**
 * Return a Big Eye message explaining when the `doubleVote` power will be
 * available, based on the current game phase.
 *
 * - During `live_vote`: the power is active right now and the player should
 *   return to the game immediately.
 * - Any other phase: the power will activate automatically at the next live
 *   elimination; this message clears up the "won but not yet usable" confusion.
 *
 * @param currentPhase  The current game phase string (from GameState.phase).
 * @returns             A flavour-text string for Big Eye to deliver.
 */
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

// ── PR 3: Activation guard helpers ──────────────────────────────────────────

/**
 * Minimal game-state shape needed by the activation guard functions.
 * Keeps this file free of circular imports from types/index.ts.
 */
export interface ActivationCheckState {
  phase: string;
  secretMission?: SecretMissionState;
  /** IDs of players currently nominated (on the block). */
  nomineeIds: readonly string[];
  /** ID of the current HOH. */
  hohId?: string | null;
  /** Full player list (only id, isUser, and status are inspected). */
  players: ReadonlyArray<{ id: string; isUser?: boolean; status: string }>;
  /** Double-eviction twist state — weekActive means double eviction is running. */
  doubleEviction?: { weekActive?: boolean } | null;
  /**
   * Vote results tally (nomineeId → vote count).
   * Set by advance() during eviction_results; null/undefined before that.
   */
  voteResults?: Record<string, number> | null;
  /** True when a tie-break decision is pending (used as a conflict guard). */
  awaitingTieBreak?: boolean;
}

/**
 * Game phases at or beyond the Final 4 cutoff.
 * Secret powers may NOT be used once any of these phases is reached.
 */
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

/**
 * True when the current game phase is Final 4 or beyond.
 * Powers must expire before this point.
 */
export function isFinal4OrLater(phase: string): boolean {
  return FINAL4_OR_LATER_PHASES.has(phase);
}

/**
 * True when a twist that conflicts with the doubleVote power is currently active.
 *
 * Conflicts:
 *  - Double Eviction week: the vote tally is modified to evict 2 players at once;
 *    stacking a personal double-vote on top would create ambiguous ballot semantics.
 */
export function hasDoubleVoteConflict(state: ActivationCheckState): boolean {
  return state.doubleEviction?.weekActive === true;
}

/**
 * True when a twist that conflicts with the voteDeduction power is currently active.
 *
 * Conflicts:
 *  - Double Eviction week: special tally logic; deduction would be applied to
 *    an already-modified result set.
 *  - Tie-break pending: the vote count is already tied; subtracting a vote
 *    from one nominee would create ambiguous or game-breaking state transitions.
 */
export function hasVoteDeductionConflict(state: ActivationCheckState): boolean {
  return state.doubleEviction?.weekActive === true || state.awaitingTieBreak === true;
}

/**
 * Returns true when the stored `doubleVote` reward can be offered for activation
 * in the current game context.
 *
 * All of the following must be true:
 *  1. A secret-mission reward of type `doubleVote` exists and is eligible
 *     (not consumed, not expired).
 *  2. The current phase is `live_vote` — the only moment when a vote can be cast.
 *  3. The human player is an eligible voter (alive, not HOH, not nominated).
 *  4. No conflicting twist is active (e.g. Double Eviction).
 *  5. The game is not at or beyond Final 4.
 */
export function canUseDoubleVote(state: ActivationCheckState): boolean {
  const reward = state.secretMission?.reward;
  if (!reward || reward.type !== 'doubleVote' || !reward.eligible) return false;
  if (state.phase !== 'live_vote') return false;
  if (isFinal4OrLater(state.phase)) return false;
  if (hasDoubleVoteConflict(state)) return false;

  const humanPlayer = state.players.find((p) => p.isUser);
  if (!humanPlayer || humanPlayer.status === 'evicted' || humanPlayer.status === 'jury') return false;

  // Human must be an eligible voter: not the HOH and not currently nominated.
  if (humanPlayer.id === state.hohId) return false;
  if (state.nomineeIds.includes(humanPlayer.id)) return false;

  return true;
}

/**
 * Returns true when the stored `voteDeduction` reward can be offered for
 * activation in the current game context.
 *
 * All of the following must be true:
 *  1. A secret-mission reward of type `voteDeduction` exists and is eligible.
 *  2. The current phase is `eviction_results` — the vote tally is now visible.
 *  3. The human player is one of the nominees (on the block).
 *  4. The human player has at least 1 vote against them in `voteResults`.
 *  5. Applying the deduction would NOT create a vote tie (tie-break ambiguity).
 *  6. No conflicting twist is active.
 *  7. The game is not at or beyond Final 4.
 */
export function canUseVoteDeduction(state: ActivationCheckState): boolean {
  const reward = state.secretMission?.reward;
  if (!reward || reward.type !== 'voteDeduction' || !reward.eligible) return false;
  if (state.phase !== 'eviction_results') return false;
  if (isFinal4OrLater(state.phase)) return false;
  if (hasVoteDeductionConflict(state)) return false;
  if (!state.voteResults) return false;

  const humanPlayer = state.players.find((p) => p.isUser);
  if (!humanPlayer) return false;

  // Human must be on the block for this eviction
  if (!state.nomineeIds.includes(humanPlayer.id)) return false;

  const humanVoteCount = state.voteResults[humanPlayer.id] ?? 0;
  if (humanVoteCount <= 0) return false; // nothing to deduct

  // Guard: ensure the deduction doesn't create a tie with another nominee.
  // If afterDeduction ties with any other nominee's count, the outcome becomes
  // ambiguous (tie-break handling would need to re-run). Skip the offer instead.
  const afterDeduction = humanVoteCount - 1;
  const otherNomineeCounts = state.nomineeIds
    .filter((id) => id !== humanPlayer.id)
    .map((id) => state.voteResults![id] ?? 0);

  if (otherNomineeCounts.some((c) => c === afterDeduction)) return false;

  return true;
}
