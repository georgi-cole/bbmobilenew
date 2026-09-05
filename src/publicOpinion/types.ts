export type DirectionStatus = 'active' | 'completed' | 'failed' | 'expired'
export type DirectionType =
  | 'get_closer'
  | 'target_player'
  | 'protect_player'
  | 'win_competition'
  | 'make_bold_move'
  | 'apologize'
  | 'expose_player'
  | 'align_with'
  | 'confront_player'
  | 'show_loyalty'
  | 'start_drama'
  | 'win_veto'
  | 'flip_vote'
  | 'influence_hoh'
  | 'break_alliance'
  | 'reinforce_alliance'
  | 'repair_relationship'
  | 'create_chaos'

export interface PublicDirection {
  id: string
  type: DirectionType
  playerId: string
  relatedPlayerId?: string
  /** Explicit subject of a target-based public request. Optional for old saves. */
  targetPlayerId?: string
  description: string
  status: DirectionStatus
  createdWeek: number
  expiresAtWeek: number
  completedWeek?: number
  approvalDelta: number
  /** 0–100 cumulative progress toward completion (100 = complete). */
  progressPercent?: number
  /** Concrete Social/Game route that can satisfy this request. */
  actionHint?: string
  /** The current game fact that made this request eligible. */
  rationale?: string
  /** Short, player-facing completion criterion. */
  completionLabel?: string
  /** Set when the world changes and an active request can no longer be completed. */
  invalidatedReason?: string
}

export interface PlayerPublicProfile {
  playerId: string
  approval: number
  previousApproval: number
  seasonApprovals: number[]
  completedDirectionCount: number
  cumulativePositiveDelta: number
  /** The three live ingredients of the audience's overall approval score. */
  audienceBreakdown?: AudienceBreakdown
}

export type AudienceMetric = 'charisma' | 'gameplay' | 'integrity'

export interface AudienceMetricChange {
  id: string
  metric: AudienceMetric
  /** The resulting change to the overall approval average. */
  delta: number
  reason: string
  week: number
  timestamp: number
}

export interface AudienceBreakdown {
  charisma: number
  gameplay: number
  integrity: number
  /** Short, newest-first audit trail used by the audience dossier. */
  recentChanges: AudienceMetricChange[]
}

export interface PublicFeedEntry {
  id: string
  playerId: string
  text: string
  delta: number
  week: number
  timestamp: number
  /** Machine-readable source used to render a richer audience moment in the UI. */
  reason?: string
  /** True when this entry was generated as a dramatic headline event. */
  isHeadline?: boolean
  /**
   * The game event type that triggered this feed entry (e.g. 'nomination',
   * 'eviction', 'hoh_win', 'pov_save', 'public_save').
   * Used for attribution and deterministic tie-breaking.
   */
  eventType?: string
  /**
   * ID of the player who caused this approval change (e.g. the LOH who
   * nominated the subject, or the POS holder who saved someone).
   * Undefined when the change is not attributable to a specific actor.
   */
  attributedToId?: string
}

export interface PublicOpinionState {
  profiles: Record<string, PlayerPublicProfile>
  directions: PublicDirection[]
  feed: PublicFeedEntry[]
  lastUpdatedWeek: number
  /**
   * Number of visible feed posts added in the current in-game day.
   * Resets each time the game enters `week_start`.
   * When this reaches `publicOpinionConfig.feedBudgetPerDay`, further
   * event-driven feed cards are suppressed (approval deltas still apply).
   */
  feedPostsThisDay: number
  /** The in-game week (day) for which the current `feedPostsThisDay` budget applies. */
  currentFeedDay: number
}
