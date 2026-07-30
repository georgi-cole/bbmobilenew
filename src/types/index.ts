// ─────────────────────────────────────────────────────────────────────────────
// Core domain types for bbmobilenew
// Add new fields here; consumers only break if they depend on removed fields.
// ─────────────────────────────────────────────────────────────────────────────

import type { CompetitionSeasonState, CompetitionSkillProfile } from '../ai/competition/types'
import type { SocialState } from '../social/types'
import type { ActivityChannel, ActivitySource } from '../services/activityService'
import type { SeasonArchive } from '../store/seasonArchive'

export type PlayerStatus =
  | 'active'
  | 'nominated'
  | 'loh'
  | 'pos'
  | 'loh+pos'
  | 'nominated+pos'
  | 'evicted'
  | 'jury'

export interface Player {
  id: string
  name: string
  /** Emoji or URL used as avatar face */
  avatar: string
  /** Optional cast metadata used by twists that prefer mixed-gender pairings. */
  sex?: string
  status: PlayerStatus
  /** False when the player left outside a standard eviction and cannot join the Tribunal. */
  tribunalEligible?: boolean
  isUser?: boolean
  /** Optional competition skill profile for AI simulations. */
  competitionProfile?: CompetitionSkillProfile
  stats?: {
    lohWins: number
    posWins: number
    timesNominated: number
    /** Number of times this player won a Battle Back competition and returned to the house. */
    battleBackWins?: number
    /** True when this player won the Final LOH (Part 3 of the Final 3 competition). */
    wonFinalHoh?: boolean
    /** True when this player survived at least one double-eviction week. */
    survivedDoubleEviction?: boolean
    /** Personal-record tap count for TapRace competitions. */
    tapRacePR?: number
    /** Per-game personal-record scores keyed by game key (raw rounded score reported by the game). */
    gamePRs?: Record<string, number>
  }
  /**
   * The game week number when this player was evicted (set by assignSeasonPlacementOnExit).
   * Undefined for players who were never evicted (winner, runner-up who reaches finale).
   * Cleared by completeBattleBack so returning players receive a fresh week stamp on
   * their second eviction.
   */
  evictedAtWeek?: number
  /**
   * Explicit placement captured at elimination time.
   * Uses Big Brother style numbering where 1 = winner, 2 = runner-up,
   * 3 = third place, etc.
   */
  seasonPlacement?: number
  /** Set to 1 for the winner, 2 for runner-up after finale. */
  finalRank?: number
  /** True once the player is confirmed season winner. */
  isWinner?: boolean
  /** Twin Shock: Lia keeps her id but plays as the combined Lia & Ali contestant. */
  twinMode?: 'combined'
  /** True for housemates inserted after the starting roster. */
  lateEntrant?: boolean
}

// ─── Minigame types ───────────────────────────────────────────────────────────

/** Authoritative result of a completed minigame. Scores are raw minigame values. */
export interface MinigameResult {
  seedUsed: number
  /** Raw scores keyed by player ID. Higher = better for TapRace. */
  scores: Record<string, number>
  winnerId: string
  /** Players whose score beat their previous personal record this run. */
  personalRecords?: Record<string, number>
  /**
   * Canonical last-place finisher derived from the authoritative outcome.
   * When set, this takes priority over score-based derivation in the store.
   */
  lastPlaceId?: string
  /**
   * Full placement order (best → worst) derived from the authoritative outcome.
   * Empty or absent = not yet determined (falls back to score-based ranking).
   */
  placements?: string[]
}

/**
 * Payload for the `completeMinigame` action.
 * Replaces the legacy single-number payload to enable canonical outcome data.
 */
export interface CompleteMinigamePayload {
  /** The human player's final effective score (after any multipliers). */
  humanScore: number
  /**
   * Canonical winner ID derived by the game component itself.
   * When provided this is preferred over the store's score-based derivation
   * so the results UI and final applied winner always stay aligned.
   */
  winnerId?: string
  /**
   * Canonical last-place player ID derived by the game component itself.
   * When provided this is preferred over the store's score-based derivation
   * so the results UI and nomination logic share the same authoritative source.
   */
  lastPlaceId?: string
}

/** Active minigame session stored in game state while waiting for player input. */
export interface MinigameSession {
  key: string
  participants: string[]
  seed: number
  options: { timeLimit: number }
  /**
   * Pre-simulated deterministic scores for every non-human participant.
   * Empty (`{}`) for sessions created by the hybrid resolver path
   * (`hybridResolveOnComplete: true`).
   */
  aiScores: Record<string, number>
  /**
   * When true, AI scores are NOT precomputed. Instead, `completeMinigame`
   * calls the central hybrid score resolver after the human score is known.
   * Set by `startMinigame` for all score-based (non-endurance) games with a
   * human participant. Legacy sessions and test fixtures that pre-supply
   * `aiScores` via `launchMinigame` leave this false/undefined.
   */
  hybridResolveOnComplete?: boolean
}

/**
 * Context stored in game state while a Final 3 part minigame is running.
 * Set when a human participant is detected in a Final 3 competition phase.
 */
export interface MinigameContext {
  /** Which Final 3 part this minigame belongs to. */
  phaseKey: 'final3_comp1' | 'final3_comp2' | 'final3_comp3'
  /** Player IDs competing in this part. */
  participants: string[]
  /** Seed at the time the minigame was launched (for the challenge system). */
  seed: number
}

// Canonical weekly-game phase list (in execution order)
export type Phase =
  | 'week_start'
  /** Pre-competition TV announcement before the LOH competition begins. */
  | 'loh_comp_announcement'
  | 'loh_comp'
  | 'loh_results'
  /**
   * Democracia twist: active houseguests vote to elect the LOH.
   * Entered instead of loh_comp when Democracia is active for this day.
   * Loops back to itself during ballotage rounds.
   */
  | 'democracia_vote'
  /**
   * Democracia twist: vote results resolved; transitions to social_1.
   * Entered after a winner (single or co-LOH) is determined.
   */
  | 'democracia_results'
  | 'social_1'
  | 'nominations'
  | 'nomination_results'
  /**
   * Pre-veto public save phase (normal weeks only).
   * The nominee with the highest public approval is automatically saved,
   * reducing the block from 3 back down to 2 before the veto competition.
   * Skipped transparently during Double Eviction weeks.
   */
  | 'pre_veto_public_save'
  /** Pre-competition TV announcement before the POS competition begins. */
  | 'pos_comp_announcement'
  | 'pos_comp'
  | 'pos_results'
  | 'pos_ceremony'
  | 'pos_ceremony_results'
  | 'social_2'
  | 'live_vote'
  | 'eviction_results'
  | 'week_end'
  /** Special: entered from pos_results when aliveCount === 4 (skips ceremony). */
  | 'final4_eviction'
  /** Special: entered after Final 4 eviction; announces the Final 3. */
  | 'final3'
  /** Final 3 Part 1: all 3 houseguests compete; winner advances to Part 3. */
  | 'final3_comp1'
  /** Minigame sub-phase: human is competing in Final 3 Part 1. */
  | 'final3_comp1_minigame'
  /** Final 3 Part 2: the 2 Part-1 losers compete; winner advances to Part 3. */
  | 'final3_comp2'
  /** Minigame sub-phase: human is competing in Final 3 Part 2. */
  | 'final3_comp2_minigame'
  /** Final 3 Part 3: Part-1 winner vs Part-2 winner → Final LOH crowned. */
  | 'final3_comp3'
  /** Minigame sub-phase: human is competing in Final 3 Part 3. */
  | 'final3_comp3_minigame'
  /** Final LOH evicts one of the 2 remaining houseguests directly (no vote). */
  | 'final3_decision'
  /** Intermediate: announcement modal shown before the jury cinematic intro. */
  | 'jury_announcement'
  /** Intermediate: cinematic juror intro sequence before jury voting begins. */
  | 'jury_cinematic'
  /** Jury phase: the Final 2 faces the jury for votes; finale overlay active. */
  | 'jury'

export interface TvEvent {
  id: string
  text: string
  type: 'game' | 'social' | 'vote' | 'twist' | 'diary'
  timestamp: number
  /** Optional metadata for announcement classification. */
  meta?: { major?: string; week?: number; [key: string]: unknown }
  /** Shorthand major key (alternative to meta.major). */
  major?: string
  /**
   * Destination channels for this event (activity routing).
   * When absent the event is treated as a legacy event visible everywhere.
   * Use activityService predicates (isVisibleInMainLog, isVisibleInDr, etc.)
   * to check visibility rather than inspecting this field directly.
   */
  channels?: ActivityChannel[]
  /**
   * Origin of the event: 'manual' for user-initiated actions, 'system' for
   * background / AI-driven events. Required when channels includes 'dr'.
   */
  source?: ActivitySource
}

// ─── Spectator overlay ────────────────────────────────────────────────────────

/**
 * Metadata stored in GameState while the SpectatorView overlay is active.
 * Set by openSpectator; cleared by closeSpectator. While truthy, advance()
 * returns early so the overlay drives phase progression.
 */
export interface SpectatorActiveState {
  /** Optional minigame identifier for debugging / analytics. */
  minigameId?: string
  /** Player IDs visible in the overlay. */
  competitorIds: string[]
  /** Visual variant rendered by SpectatorView. */
  variant?: 'holdwall' | 'trivia' | 'maze'
  /**
   * Pre-computed authoritative winner ID — must be resolved before opening the
   * spectator so the reveal always matches the announced winner.
   */
  expectedWinnerId?: string
  /**
   * Render placement: 'fullscreen' uses a portal to document.body; 'embed'
   * renders the spectator inline within the current DOM node (minigame panel).
   * Default: 'fullscreen'.
   */
  placement?: 'fullscreen' | 'embed'
  /** Unix timestamp (ms) recorded when the overlay was opened. */
  startedAt: number
}

// ─── Battle Back / Jury Return twist ─────────────────────────────────────────

/**
 * State for the one-time-per-season "Jury Return / Battle Back" twist.
 * Stored in GameState.battleBack; undefined when the twist has never been
 * attempted (first-time lazy initialisation).
 */
export interface BattleBackState {
  /** True once the twist has fired (or been decided) this season — prevents repeats. */
  used: boolean
  /**
   * True while the twist is active (blocks advance()).
   * Set to true when the twist triggers; cleared by completeBattleBack/dismissBattleBack.
   */
  active: boolean
  /**
   * True once the competition overlay should be shown.
   * The twist first shows an announcement on the TV filler; only when this is
   * true is the full-screen competition overlay rendered.
   */
  competitionActive: boolean
  /** Week number when the twist was decided (week the eviction happened). Null before decided. */
  weekDecided: number | null
  /** IDs of jurors eligible to compete in the Battle Back. */
  candidates: string[]
  /** ID of the winning juror who returns to the house; null before the competition resolves. */
  winnerId: string | null
}

// ─── Double Eviction twist ────────────────────────────────────────────────────

/**
 * Season-level state for the Double Eviction twist.
 * Stored in GameState.doubleEviction; undefined when the game state was created
 * before this feature was added (backwards-compatible).
 */
export interface DoubleEvictionState {
  /**
   * How many times Double Eviction has fired this season.
   * Used to enforce per-band caps (max 2 in the 13-16 band, max 2 in the 10-12 band).
   */
  usedCount: number
  /**
   * True while the current week is a Double Eviction week.
   * Set by `activateDoubleEviction`; cleared after both evictions resolve.
   */
  weekActive: boolean
  /**
   * When `weekActive` is true and the first eviction has been queued, this holds
   * the second eviction payload. After `finalizePendingEviction` handles the first
   * evictee, this is promoted to `pendingEviction`. Null when not applicable.
   */
  pendingSecondEviction: { evicteeId: string; evictionMessage: string } | null
}

export type SpecialVetoType = 'vip' | 'diamond' | 'coup' | 'spotlight'

// ─── Democracia twist ─────────────────────────────────────────────────────────

/**
 * State for the Democracia twist — a seasonal event where active houseguests
 * vote to elect the Leader of the House instead of a competition.
 *
 * Replaces the LOH competition on eligible days (5, 7, or 9, odd alive count,
 * hard cutoff day 10).  Supports single-winner, ballotage, and co-LOH outcomes.
 */
export interface DemocraciaState {
  /** True once Democracia has been activated/used this season. */
  usedThisSeason: boolean
  /** True while the Democracia vote flow is active for the current day. */
  active: boolean
  /** The day (week) Democracia was activated, or null before activation. */
  activatedDay: number | null
  /** Current voting round (1 = initial vote, 2+ = ballotage). */
  round: number
  /** IDs of players eligible to become LOH this round. */
  candidateIds: string[]
  /** IDs of players who may vote this round. */
  eligibleVoterIds: string[]
  /** Maps voter player ID → chosen candidate ID for the current round. */
  votesByVoterId: Record<string, string>
  /** True when the human player must cast a Democracia vote before advance() continues. */
  awaitingHumanVote: boolean
  /** True after a ballotage final tie when public-mode is ON and the UI must pick by approval. */
  awaitingPublicBreaker: boolean
  /** Transient TV payload used to reveal Democracia vote outcomes before play continues. */
  resultDisplay: DemocraciaResultDisplay | null
}

export interface DemocraciaResultDisplay {
  mode: 'winner' | 'tie' | 'message'
  participantIds: string[]
  voteCountsByCandidateId: Record<string, number>
  title: string
  subtitle: string
}

export interface CupidArrowPair {
  id: string
  memberIds: [string, string]
  /** Stable visual token shared by both partner tiles. */
  color: string
}

/**
 * Season-level state for Cupid's Arrow. Pairs remain recorded after the spell
 * breaks so social history and season presentation can still reference them.
 */
export interface CupidArrowState {
  scheduledSeason: number | null
  status: 'inactive' | 'scheduled' | 'active' | 'broken'
  activatedSeason: number | null
  activatedWeek: number | null
  pairs: CupidArrowPair[]
  eliminatedPairCount: number
  /** Second half of a pair waiting for the shared elimination cinematic. */
  pendingPartnerEvictionId: string | null
}

export interface SpecialVetoState {
  /** Whether any special veto has been used this season (once true, no more can activate). */
  seasonUsed: boolean
  /** Active veto type for the current week, or null if none. */
  activeType: SpecialVetoType | null
  /** The week the special veto was activated, or null. */
  activatedWeek: number | null

  /**
   * VIP veto use stage:
   *  0  = ceremony not started
   *  1  = first use in progress (save done, awaiting first replacement)
   *  2  = first replacement done, awaiting second-use decision
   *  3  = second use decided yes, awaiting second replacement
   * -1  = ceremony complete (no second use taken or all done)
   */
  vipUseStage: number

  /** Diamond: human POS holder picks their own replacement. */
  awaitingHolderReplacement: boolean
  /** Coup: human POS holder picks first replacement. */
  awaitingCoupReplacement1: boolean
  /** Coup: human POS holder picks second replacement. */
  awaitingCoupReplacement2: boolean
  /** Coup: stores the first replacement ID between the two picks. */
  coupReplacement1Id: string | null
  /** VIP: human POS holder decides whether to use the veto a second time. */
  awaitingVipSecondUseDecision: boolean
  /** VIP: human POS holder picks which nominee to save on second use. */
  awaitingVipSecondSaveTarget: boolean
}

export type ForcedShockType =
  | 'doubleEviction'
  | 'battleBack'
  | SpecialVetoType
  | 'democracia'
  | 'dayStartShock'
  | 'twinShock'

export interface ForcedShockState {
  /** Shock that should be triggered from the debug menu at the next safe chance. */
  type: ForcedShockType
  /** Week when the debug force request was queued. */
  requestedWeek: number
  /** Earliest week when the shock is allowed to begin. */
  earliestWeek: number
}

/**
 * State for the day-start elimination shock popup.
 * When set, the game is waiting for the user to confirm the eviction before
 * the standard eviction animation can take over.
 */
export interface DayStartShockState {
  /** ID of the active housemate who will be eliminated. */
  targetId: string
  /** Dramatic broadcast-style reason shown in the popup. */
  reason: string
  /** Template identifier used to generate the reason. */
  templateId: string
  /** Week when the shock was activated. */
  triggeredWeek: number
  /** Whether the shock was triggered by the random roll or the debug queue. */
  source: 'random' | 'debug'
}

export type TwinShockStatus =
  | 'inactive'
  | 'day4_pending'
  | 'day4_asked_no_correct_guess'
  | 'resolved_discovered'
  | 'resolved_mission_success'
  | 'resolved_secret_lost'
  | 'cancelled_pre_day4_eviction'

export type TwinShockPromptStage =
  | 'day4_initial'
  | 'day4_detail'
  | 'day5_final'
  | 'day5_give_up'
  | 'secret_lost'

export type TwinShockResolution = 'discovered' | 'mission_success' | 'secret_lost'

export type TwinShockRevealAnimation =
  | {
      type: 'combined'
      playerId: string
      fromName: string
      fromAvatar: string
      toName: string
      toAvatar: string
    }
  | {
      type: 'ali_enters'
      replacedPlayerId: string
      replacedPlayerName: string
      replacedPlayerAvatar: string
      incomingPlayerId: string
      incomingName: string
      incomingAvatar: string
    }

export interface TwinShockState {
  status: TwinShockStatus
  promptStage: TwinShockPromptStage | null
  queuedDay: number | null
  retryCount: number
  cluesShownDays: number[]
  pendingRevealAnimation?: TwinShockRevealAnimation | null
}

// ─── Public's Favorite voting twist ──────────────────────────────────────────

/**
 * State for the optional "Public's Favorite Player" vote shown after the
 * finale winner announcement. Feature-gated via settings.sim.enableFavoritePlayer.
 */
export interface FavoritePlayerState {
  /** True while the twist is active (blocks navigation to game-over). */
  active: boolean
  /**
   * True once the full-screen voting overlay should be shown.
   * When `active && !votingStarted`, the TV filler shows the announcement.
   * When `votingStarted = true`, GameScreen renders the voting overlay.
   */
  votingStarted: boolean
  /** IDs of all candidates eligible for the vote (all season players by default). */
  candidates: string[]
  /** IDs eliminated from voting so far, in elimination order. */
  eliminated: string[]
  /** Simulated public vote percentages keyed by candidate ID (integers, sum ≈ 100). */
  votes: Record<string, number>
  /** ID of the winner once voting completes; null while in progress. */
  winnerId: string | null
  /** Cash award amount for the winner (dollars). */
  awardAmount: number
}

export type FinalePhase =
  | 'winnerCinematic'
  | 'winnerInterview'
  | 'publicFavoriteSetup'
  | 'publicFavoriteFlow'
  | 'goodbyeSequence'
  | 'lightsOffTransition'
  | 'seasonComplete'

export interface SeasonFinaleState {
  phase: FinalePhase
  winnerId: string
  publicFavoriteWinnerId?: string
  interviewIndex: number
  goodbyeIndex: number
  isChatOpen: boolean
  isLightsOffAnimating: boolean
  publicFavoriteEnabled: boolean
}

// ─── Game history (immutable event log) ──────────────────────────────────────

/**
 * A single entry in the game-level history log.
 * Twist decisions and major events are appended here for persistence and
 * post-season display.
 */
export interface GameHistoryEvent {
  /** Discriminant type for easy filtering. */
  type: 'battleBack' | 'favoritePlayer' | string
  /** Week number when this event occurred. */
  week: number
  /** Arbitrary per-type payload. */
  data: Record<string, unknown>
  /** Unix timestamp (ms) when the event was recorded. */
  timestamp: number
}

export interface GameState {
  /** Stable unique identifier for this game instance. */
  gameId: string
  season: number
  week: number
  phase: Phase
  players: Player[]
  /**
   * Temporary per-season competition modifiers keyed by player ID.
   * Uses neutral defaults when missing to keep simulations safe.
   */
  competitionSeasonStateByPlayerId?: Record<string, CompetitionSeasonState>
  tvFeed: TvEvent[]
  isLive: boolean
  /** One-time per-season tutorial flag for the confessional FAB spotlight. */
  hasSeenConfessionalSpotlight?: boolean
  /** Mulberry32 seed – advances on each outcome computation for reproducibility. */
  seed: number
  /** Player ID of the current Leader of the House, or null between weeks. */
  lohId: string | null
  /**
   * A disclosed LOH plan is persisted so conversation intel and the eventual
   * ceremony cannot contradict one another. Cleared at the next week start.
   */
  lohSocialPlan?: {
    week: number
    lohId: string
    currentTargetId: string | null
    backupTargetId: string | null
    askCountsByPlayerId: Record<string, number>
    /** Last target name actually disclosed to each asker this week. */
    disclosedTargetByPlayerId?: Record<string, string>
  } | null
  /**
   * The original nomination ceremony is remembered separately from the live
   * block so Safety changes do not erase who initially put whom in danger.
   */
  currentWeekNominationRecord?: {
    week: number
    lohId: string
    nomineeIds: string[]
  } | null
  /** Previous week's original nominations, used as one moderate strategic memory. */
  lastWeekNominationRecord?: {
    week: number
    lohId: string
    nomineeIds: string[]
  } | null
  /** Advice a human LOH gave the current AI Safety holder before the ceremony. */
  lohSafetyAdvice?: {
    week: number
    lohId: string
    holderId: string
    advice: 'use' | 'hold' | 'free'
  } | null
  /**
   * Player ID of the outgoing (previous week's) Leader of the House.
   * Set at the start of each new week so the outgoing LOH can be excluded
   * from the LOH competition. Null in Week 1 and during the Final 3.
   */
  prevHohId: string | null
  /** Player IDs currently nominated for eviction. */
  nomineeIds: string[]
  /**
   * Feature flag snapshot for the current season. When true, normal weeks use
   * the public-influence ruleset (3 nominees pre-veto + public save). This is
   * read from settings at season creation/reset time.
   */
  publicModeEnabled?: boolean
  /** Player ID of the current Power of Safety holder, or null. */
  posWinnerId: string | null
  /**
   * When true, the human LOH must pick a replacement nominee (after a POS auto-save).
   * The Continue button is hidden and a replacement picker is shown instead.
   */
  replacementNeeded?: boolean
  /**
   * The ID of the player who was saved by the Power of Safety this week.
   * Excluded from the replacement nominee pool so the saved player cannot be
   * immediately re-nominated as the replacement.
   * Cleared after the replacement nominee is confirmed.
   */
  povSavedId?: string | null
  /**
   * All players protected by a veto/safety effect for the current cycle.
   * Used to keep previously saved nominees ineligible for re-nomination later
   * in the same ceremony (for example Double Trouble second-use flows).
   * Cleared on the next week reset / phase reset.
   */
  povProtectedIds?: string[]
  /**
   * Player ID of the houseguest who finished last in the LOH competition.
   * Used by the third-nominee rule: in normal weeks, this player is automatically
   * added as the third nominee after the LOH selects two.
   * Cleared at the start of each new week.
   */
  lastHohCompFinisherId?: string | null
  /**
   * Competition type for the LOH comp that produced lastHohCompFinisherId.
   * 'scored'   → ranked/scored game (label: "Lowest Score")
   * 'survival' → last-player-standing game (label: "First out")
   * null       → unknown / not set (UI falls back to "Lowest Score")
   * Cleared at the start of each new week alongside lastHohCompFinisherId.
   */
  lastHohCompFinisherType?: 'scored' | 'survival' | null
  /**
   * Player ID of the nominee saved by the public during the pre-veto public
   * save phase (normal weeks only). Null until the phase resolves; cleared on
   * week reset.
   */
  publicSavedNomineeId?: string | null
  /**
   * Metadata distinguishing LOH-selected nominees from the auto-added third
   * nominee. Used by the nomination reveal UI and nomination context.
   * Null when not applicable (double eviction weeks or before nominations).
   */
  nominationContext?: {
    /** IDs selected directly by the LOH. */
    hohNomineeIds: string[]
    /** ID of the player auto-added as 3rd nominee (last LOH comp finisher). */
    autoNomineeId: string | null
    /** True once the pre-veto public save has resolved for this week. */
    publicSaveApplied: boolean
  } | null
  /**
   * When true, the pre-veto public save phase is waiting for the UI to
   * resolve which nominee to save. advance() is blocked until
   * commitPublicSave() clears this flag.
   */
  awaitingPublicSave?: boolean
  /**
   * When true, the human LOH must pick two nominees in the `nomination_results` phase.
   * The Continue button is hidden and a two-step nominee picker is shown instead.
   */
  awaitingNominations?: boolean
  /**
   * The first nominee chosen by the human LOH during the two-step nomination flow.
   * Set by `selectNominee1`; cleared after `finalizeNominations`.
   */
  pendingNominee1Id?: string | null
  /**
   * When true, the human POS holder must decide whether to use the veto
   * in the `pos_ceremony_results` phase (not applicable when they are a nominee,
   * since nominees always self-save).
   * The Continue button is hidden and a Yes/No binary modal is shown.
   */
  awaitingPovDecision?: boolean
  /**
   * When true, the human POS holder chose to use the veto and must now pick
   * which nominee to save. The Continue button is hidden and a player picker
   * showing current nominees is rendered.
   */
  awaitingPovSaveTarget?: boolean
  /**
   * Vote accumulator for the live eviction vote.
   * Maps voter player ID → nominee player ID.
   * Populated during `live_vote` transition (AI votes) and by `submitHumanVote`.
   */
  votes?: Record<string, string>
  /**
   * When true, the human player is an eligible voter during `live_vote` and must
   * cast their eviction vote via a blocking modal before `advance()` continues.
   */
  awaitingHumanVote?: boolean
  /**
   * When true, the live vote ended in a tie and the human LOH must break it.
   * The Continue button is hidden and a tie-break modal is shown.
   */
  awaitingTieBreak?: boolean
  /**
   * The subset of nominees that are tied in the live eviction vote.
   * Populated when `awaitingTieBreak` is set; shown in the tie-break modal.
   */
  tiedNomineeIds?: string[] | null
  /**
   * When true, the human Final LOH must directly evict one of the 2 remaining
   * houseguests in the `final3_decision` phase.
   * The Continue button is hidden and a TvDecisionModal is shown instead.
   */
  awaitingFinal3Eviction?: boolean
  /**
   * When true, the Final 3 ceremony is in progress (coronation animation, plea
   * overlay, LOH decision, and eviction animation). Set after Part 3 spectator
   * completes. Blocks advance() until finalizeFinal3Decision clears it.
   */
  awaitingFinal3Plea?: boolean
  /**
   * Tracks intermediate AI replacement steps after a veto is used on a nominated player.
   * 0 (or undefined) = not in progress.
   * 1 = waiting to show "LOH must name a replacement nominee" message.
   * 2 = waiting for AI LOH to pick the replacement.
   * The phase stays at `pos_ceremony_results` until this reaches 0.
   */
  aiReplacementStep?: number
  /**
   * When true, the UI has not yet acknowledged the step-1 "LOH must name a
   * replacement nominee" announcement. advance() will not process step 2
   * until the UI dispatches `aiReplacementRendered` to clear this flag.
   */
  aiReplacementWaiting?: boolean
  /**
   * Active minigame session. Set when the human player needs to play a
   * minigame (e.g. TapRace for LOH/POS). The Continue button is hidden and
   * the TapRace overlay is shown instead. Null when no minigame is active.
   */
  pendingMinigame?: MinigameSession | null
  /**
   * Result of the most-recently completed minigame. Used by `advance()` to
   * determine the LOH/POS winner instead of a random pick. Cleared after use.
   */
  minigameResult?: MinigameResult | null
  /**
   * Winner of Final 3 Part 1 — advances directly to Part 3 (skips Part 2).
   * Set during `final3_comp1` advance.
   */
  f3Part1WinnerId?: string | null
  /**
   * Winner of Final 3 Part 2 — advances to Part 3 to face the Part 1 winner.
   * Set during `final3_comp2` advance.
   */
  f3Part2WinnerId?: string | null
  /**
   * Active Final 3 competition minigame context.
   * Set when the human player is competing in a Final 3 part (final3_comp*_minigame phases).
   * Cleared by `applyF3MinigameWinner` after the minigame completes.
   */
  minigameContext?: MinigameContext | null
  /**
   * When truthy, a TWIST is active and the TWIST pill will be shown in the TvZone header.
   * Set this field in game logic when a twist is introduced.
   */
  twistActive?: boolean
  /**
   * Tracks whether a twist (Double Eviction or Special Veto) has already activated
   * during the current week. Reset to false at week_start so no two twists can
   * fire in the same week regardless of phase order.
   */
  twistActivatedThisWeek?: boolean
  /**
   * Battle Back / Jury Return twist state.
   * Undefined until the twist is first attempted.
   */
  battleBack?: BattleBackState
  /**
   * Double Eviction twist state.
   * Undefined on legacy saved games created before this feature was added.
   */
  doubleEviction?: DoubleEvictionState
  /**
   * Special Veto twist state.
   * Undefined on legacy saved games created before this feature was added.
   */
  specialVeto?: SpecialVetoState
  /** Debug-only queued shock that should fire at the next safe activation window. */
  pendingForcedShock?: ForcedShockState | null
  /**
   * Democracia twist state.
   * Undefined on legacy saved games created before this feature was added.
   */
  democracia?: DemocraciaState
  /** Full-season Cupid's Arrow pairing shock. */
  cupidArrow?: CupidArrowState
  /**
   * When Democracia resolves to a tie with public mode OFF, both tied players
   * become co-LOHs.  This array holds their IDs; null on normal days.
   * On co-LOH days, lohId is set to coLohIds[0] for compatibility but
   * coLohIds is the authoritative source for the dual-leadership state.
   */
  coLohIds?: string[] | null
  /**
   * When true, a human co-LOH must pick their nomination nominee via a modal.
   * Blocks advance() until the human submits via submitCoLohNomination.
   */
  awaitingCoLohNomination?: boolean
  /**
   * Maps co-LOH player ID → their chosen nominee ID.
   * Populated during co-LOH nomination; cleared on week reset.
   */
  coLohNomineeByCoLohId?: Record<string, string> | null
  /**
   * On co-LOH Democracia days, if the eviction vote ties, the POS holder breaks
   * the tie instead of the LOH.  When true and the POS holder is human, a
   * dedicated tie-break modal is shown.
   * Cleared by submitPosTieBreak or deterministic AI resolution.
   */
  awaitingPosTieBreak?: boolean
  /**
   * Public's Favorite Player voting state.
   * Undefined until `startFavoritePlayerPhase` is dispatched.
   * Feature-gated via settings.sim.enableFavoritePlayer.
   */
  favoritePlayer?: FavoritePlayerState
  /** One-time hidden identity twist centered on Lia and Ali. */
  twinShock?: TwinShockState
  /** Global per-save flag: once activated, Twin Shock never repeats. */
  twinShockConsumed?: boolean
  twinShockActivatedSeason?: number | null
  twinShockResolution?: TwinShockResolution | null
  twinShockResolvedDay?: number | null
  twinShockDiscoveredByUser?: boolean
  liaForcedUntilTwinShockResolved?: boolean
  /** Explicit post-jury finale state machine controlling the end-of-season flow. */
  seasonFinale?: SeasonFinaleState | null
  /**
   * Immutable history log of major game events (twists, special votes, etc.).
   * Append-only; used for post-season display and debugging.
   */
  history?: GameHistoryEvent[]
  /**
   * Durable snapshot of the current elimination round. Kept after transient
   * vote UI state is dismissed so the finalized exit can be archived accurately.
   */
  pendingExitContext?: {
    week: number
    leaderIds: string[]
    nomineeIds: string[]
    votesByVoterId: Record<string, string>
    voteCounts: Record<string, number>
  } | null
  /**
   * Day-start elimination shock state.
   * When set, the popup is visible and advance() is blocked until the player
   * confirms the eviction.
   */
  dayStartShock?: DayStartShockState | null
  /** True after Morning Shock activates, preventing another activation this season. */
  dayStartShockUsedThisSeason?: boolean
  /** True after the one-time Tribunal phase announcement has played. */
  tribunalPhaseAnnounced?: boolean
  /**
   * When set, the VoteResultsPopup is shown with the vote tally before
   * advancing. Maps nominee ID → number of votes received.
   * Cleared by `dismissVoteResults`.
   */
  voteResults?: Record<string, number> | null
  /**
   * When set, the EvictionSplash animation is shown for this player ID
   * before the game advances. Cleared by `dismissEvictionSplash`.
   * @deprecated Use `pendingEviction` for new eviction paths.
   */
  evictionSplashId?: string | null
  /**
   * When set, an eviction is pending cinematic reveal.  The evictee's status
   * has NOT yet been mutated; `finalizePendingEviction` must be dispatched
   * (by the overlay's `onDone` callback) to commit the eviction.
   * Cleared by `finalizePendingEviction`.
   */
  pendingEviction?: { evicteeId: string; evictionMessage: string } | null
  /**
   * ID of the player currently shown in a fullscreen eviction overlay
   * (SpotlightEvictionOverlay).  Set when any eviction overlay mounts and
   * cleared (`null`) when it completes.  Allows AvatarTile to hide itself
   * (`isEvicting`) during both the pendingEviction path and local overlay-
   * driven paths (e.g. Final3Ceremony), preventing a duplicated match-cut.
   * Cleared by `setEvictionOverlay(null)`.
   */
  evictionOverlayPlayerId?: string | null
  /**
   * Social module state subtree. Managed by the social module; optional so
   * that tests and legacy code that don't set it up continue to work.
   */
  social?: SocialState
  /** Optional weekly config overrides. */
  cfg?: {
    /**
     * Future feature flag for multi-eviction weeks.
     * When true, special POS twists may be suspended.
     * NOTE: Final 4 special handling (POS holder sole vote) is always enforced
     * regardless of this flag. There is currently no automatic logic to set
     * this flag; it is a placeholder for future multi-eviction week support.
     */
    multiEviction?: boolean
    /**
     * Number of jury members (default 7).
     * Formula: nonJuryEvictions = totalPlayers - 2 - jurySize;
     * players evicted at index < nonJuryEvictions go home (status 'evicted'),
     * the rest become jurors (status 'jury').
     */
    jurySize?: number
    /**
     * When true, one pre-jury evictee may return to the jury house via
     * jury-return scoring before voting begins.
     */
    enableJuryReturn?: boolean
    /**
     * Total pacing budget (ms) for the full jury-reveal sequence.
     * Default: 42 000 (42 s).  Tests should use a much shorter value.
     */
    tJuryFinale?: number
    /**
     * Per-vote reveal delay (ms).
     * Default: derived from tJuryFinale / jurySize.
     */
    tVoteReveal?: number
    /**
     * When true, a tied vote is broken by "America's Vote" (random pick).
     * Default false – ties are broken deterministically via seeded RNG.
     */
    americasVoteEnabled?: boolean
    /**
     * Runtime feature flag for the React SpectatorView overlay.
     * When false, the SpectatorView is not rendered even if FEATURE_SPECTATOR_REACT
     * compile-time flag is true.  Defaults to true (enabled) when omitted.
     * Set to false to disable spectator mode for a specific season or week
     * without redeploying.
     */
    enableSpectatorReact?: boolean
  }
  /**
   * Archived season records. Each completed season is inserted at the front
   * of this array (newest-first). Capped at 50 entries. Persisted to
   * localStorage by default via archivePersistence.
   */
  seasonArchives?: SeasonArchive[]
  /**
   * Set while the SpectatorView overlay is mounted and playing.
   * advance() returns early while this is truthy, preventing any phase
   * transition from racing past the overlay. Cleared by closeSpectator.
   */
  spectatorActive?: SpectatorActiveState | null
  /**
   * Active secret mission for this season.
   * Represents the currently active / most recent secret mission for this season.
   * Managed by secretMission reducers in gameSlice.
   */
  secretMission?: import('../bb/secretMission').SecretMissionState
  /** Number of secret missions started this season (capped at 2). */
  secretMissionCount?: number
  /** Task-set signatures already generated this season; prevents repeat checklists. */
  secretMissionTaskSetHistory?: string[]
  /** Latest social graph snapshot used by synchronous POS and eviction AI decisions. */
  strategicRelationships?: import('../social/types').RelationshipsMap
  /** Tracks whether the optional second-mission 50% roll has already been resolved. */
  /** Runtime bridge used to keep premium social strategy out of Normal Mode. */
  dramaSocialMode?: boolean
  secretMissionSecondChanceResolved?: boolean
  /**
   * PR 3 — doubleVote activation: set by advance() when the human player
   * enters live_vote with an eligible doubleVote reward and no conflicting
   * twist. A Big Eye offer modal is shown; the player can accept or decline.
   * Cleared by activateDoubleVoteReward or declineDoubleVoteReward.
   */
  awaitingDoubleVoteOffer?: boolean
  /**
   * PR 3 — doubleVote in progress: set when the player accepts the Big Eye
   * doubleVote offer. The live-vote UI shows two nominee selectors instead of
   * one. Cleared (reward consumed) by submitHumanDoubleVote.
   */
  humanDoubleVoteActive?: boolean
  /**
   * PR 3 — voteDeduction activation: set by advance() during eviction_results
   * when the human player is a nominee with votes against them, has an eligible
   * voteDeduction reward, and no conflicting twist is active.
   * Cleared by activateVoteDeductionReward or declineVoteDeduction.
   */
  awaitingVoteDeductionPrompt?: boolean
  /**
   * Secret mission immunity activation prompt.
   * Set during `pos_ceremony_results` when the player is nominated and has an
   * eligible stored immunity reward within its activation window.
   */
  awaitingMissionImmunityOffer?: boolean
}

// ─── Status pill ─────────────────────────────────────────────────────────────
/** Visual variants available for <StatusPill> */
export type StatusPillVariant =
  | 'phase'
  | 'week'
  | 'players'
  | 'dr'
  | 'twist'
  | 'success'
  | 'danger'
  | 'warning'
  | 'info'
  | 'neutral'
  | 'ghost'
