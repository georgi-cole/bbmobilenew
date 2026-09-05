import { createSlice, createSelector, type PayloadAction } from '@reduxjs/toolkit';
import { publicOpinionConfig } from './publicOpinionConfig';
import { createPublicNarrative } from './publicNarratives';
import { applyAudienceApprovalDelta, createAudienceBreakdown } from './audienceBreakdown';
import type {
  PublicOpinionState,
  PlayerPublicProfile,
  PublicDirection,
  PublicFeedEntry,
} from './types';

// Minimal type for selectors to avoid circular import with store.ts
type StateWithPublicOpinion = { publicOpinion: PublicOpinionState };


const initialState: PublicOpinionState = {
  profiles: {},
  directions: [],
  feed: [],
  lastUpdatedWeek: 0,
  feedPostsThisDay: 0,
  currentFeedDay: 0,
};

// ── Shared helper (used by both resolveDirection and updateMissionProgress) ───

/**
 * Marks a direction as completed and applies all associated approval rewards
 * (counter increment, success delta, feed entry) to the player's profile.
 * Extracted to avoid duplicating this logic across two reducers.
 */
function applyDirectionCompletionRewards(
  state: PublicOpinionState,
  direction: PublicDirection,
  week: number,
): void {
  direction.status = 'completed';
  direction.completedWeek = week;

  const profile = state.profiles[direction.playerId];
  if (!profile) return;

  profile.completedDirectionCount += 1;
  const delta = publicOpinionConfig.directionRewards.success;
  const applied = applyAudienceApprovalDelta(profile, {
    delta,
    reason: 'direction_completed',
    week,
  });
  profile.previousApproval = profile.approval;
  profile.audienceBreakdown = applied.breakdown;
  profile.approval = applied.approval;
  profile.seasonApprovals.push(applied.approval);
  if (applied.appliedDelta > 0) {
    profile.cumulativePositiveDelta += applied.appliedDelta;
  }
  state.lastUpdatedWeek = week;

  const feedEntry: PublicFeedEntry = {
    id: `${direction.playerId}-${week}-${Date.now()}-dir-completed`,
    playerId: direction.playerId,
    text: createPublicNarrative({
      reason: 'direction_completed',
      playerId: direction.playerId,
      delta,
      week,
    }),
    delta: applied.appliedDelta,
    week,
    timestamp: Date.now(),
    reason: 'direction_completed',
  };
  state.feed.unshift(feedEntry);
  if (state.feed.length > 50) {
    state.feed = state.feed.slice(0, 50);
  }
}

// ─────────────────────────────────────────────────────────────────────────────

const publicOpinionSlice = createSlice({
  name: 'publicOpinion',
  initialState,
  reducers: {
    initializeProfiles(
      state,
      action: PayloadAction<Array<string | { id: string; aiGameIdentity?: { archetype?: string; audienceFocus?: number; competitionDrive?: number } }>>,
    ) {
      for (const entry of action.payload) {
        const playerId = typeof entry === 'string' ? entry : entry.id;
        if (!state.profiles[playerId]) {
          state.profiles[playerId] = {
            playerId,
            approval: publicOpinionConfig.DEFAULT_APPROVAL,
            previousApproval: publicOpinionConfig.DEFAULT_APPROVAL,
            seasonApprovals: [publicOpinionConfig.DEFAULT_APPROVAL],
            completedDirectionCount: 0,
            cumulativePositiveDelta: 0,
            audienceBreakdown: createAudienceBreakdown(
              publicOpinionConfig.DEFAULT_APPROVAL,
              typeof entry === 'string' ? undefined : entry.aiGameIdentity,
            ),
          };
        }
      }
    },

    setProfileApprovals(state, action: PayloadAction<Record<string, number>>) {
      for (const [playerId, rawApproval] of Object.entries(action.payload)) {
        const profile = state.profiles[playerId];
        if (!profile) continue;

        const approval = Math.min(
          publicOpinionConfig.MAX_APPROVAL,
          Math.max(publicOpinionConfig.MIN_APPROVAL, Math.round(rawApproval)),
        );

        const currentBreakdown = profile.audienceBreakdown ?? createAudienceBreakdown(profile.approval);
        const shift = approval - profile.approval;
        profile.audienceBreakdown = {
          charisma: Math.min(100, Math.max(0, currentBreakdown.charisma + shift)),
          gameplay: Math.min(100, Math.max(0, currentBreakdown.gameplay + shift)),
          integrity: Math.min(100, Math.max(0, currentBreakdown.integrity + shift)),
          recentChanges: [],
        };
        profile.previousApproval = approval;
        profile.approval = approval;
        profile.seasonApprovals = [approval];
      }
    },

    updateApproval(
      state,
      action: PayloadAction<{
        playerId: string;
        delta: number;
        reason: string;
        week: number;
        isHeadline?: boolean;
        headlineText?: string;
        /** When false, approval is updated silently without a Public Feed entry. Default: true. */
        addToFeed?: boolean;
        /**
         * The game event type that triggered this update (e.g. 'nomination',
         * 'eviction', 'hoh_win', 'pov_save', 'public_save').
         */
        eventType?: string;
        /**
         * ID of the player responsible for triggering this change
         * (e.g. the LOH who nominated the subject).
         */
        attributedToId?: string;
        /** A small seeded audience-mood adjustment supplied by the middleware. */
        audienceVariance?: number;
      }>,
    ) {
      const {
        playerId,
        delta,
        reason,
        week,
        isHeadline,
        headlineText,
        addToFeed = true,
        eventType,
        attributedToId,
        audienceVariance = 0,
      } = action.payload;
      const profile = state.profiles[playerId];
      if (!profile) return;

      const applied = applyAudienceApprovalDelta(profile, {
        delta: delta + audienceVariance,
        reason,
        week,
        eventType,
      });
      profile.previousApproval = profile.approval;
      profile.audienceBreakdown = applied.breakdown;
      profile.approval = applied.approval;
      profile.seasonApprovals.push(applied.approval);
      if (applied.appliedDelta > 0) {
        profile.cumulativePositiveDelta += applied.appliedDelta;
      }
      state.lastUpdatedWeek = week;

      // Reset daily feed budget when the week (day) has changed.
      if (week !== state.currentFeedDay) {
        state.feedPostsThisDay = 0;
        state.currentFeedDay = week;
      }

      // Enforce the daily feed budget: headline events are always allowed through;
      // regular event-driven posts are gated by feedBudgetPerDay.
      const budgetExceeded =
        !isHeadline && state.feedPostsThisDay >= publicOpinionConfig.feedBudgetPerDay;

      if (addToFeed && !budgetExceeded) {
        const feedEntry: PublicFeedEntry = {
          id: `${playerId}-${week}-${Date.now()}-${state.feed.length}`,
          playerId,
          text: headlineText ?? createPublicNarrative({ reason, playerId, delta: applied.appliedDelta, week }),
          delta: applied.appliedDelta,
          week,
          timestamp: Date.now(),
          reason,
          isHeadline: isHeadline ?? false,
          eventType,
          attributedToId,
        };
        state.feed.unshift(feedEntry);
        if (state.feed.length > 50) {
          state.feed = state.feed.slice(0, 50);
        }
        // Only count non-headline posts toward the daily budget; headline events
        // (generated by PublicHeadlineService at week_start) have their own
        // headlineEventsPerDayMin/Max budget managed by that service.
        if (!isHeadline) {
          state.feedPostsThisDay += 1;
        }
      }
    },

    addDirection(state, action: PayloadAction<PublicDirection>) {
      state.directions.push(action.payload);
    },

    resolveDirection(
      state,
      action: PayloadAction<{
        directionId: string;
        status: 'completed' | 'failed' | 'expired';
        week: number;
      }>,
    ) {
      const { directionId, status, week } = action.payload;
      const direction = state.directions.find((d) => d.id === directionId);
      if (!direction) return;

      if (status === 'completed') {
        // Guard: already completed (e.g. completed via updateMissionProgress) — no-op.
        if (direction.status === 'completed') return;
        applyDirectionCompletionRewards(state, direction, week);
        return;
      }

      direction.status = status;

      // Apply fail penalty; expired directions carry no penalty.
      if (status === 'failed') {
        const profile = state.profiles[direction.playerId];
        if (profile) {
          const delta = publicOpinionConfig.directionRewards.fail;
          const applied = applyAudienceApprovalDelta(profile, {
            delta,
            reason: 'direction_failed',
            week,
          });
          profile.previousApproval = profile.approval;
          profile.audienceBreakdown = applied.breakdown;
          profile.approval = applied.approval;
          profile.seasonApprovals.push(applied.approval);
          state.lastUpdatedWeek = week;

          const feedEntry: PublicFeedEntry = {
            id: `${direction.playerId}-${week}-${Date.now()}-dir-failed`,
            playerId: direction.playerId,
            text: createPublicNarrative({
              reason: 'direction_failed',
              playerId: direction.playerId,
              delta: applied.appliedDelta,
              week,
            }),
            delta,
            week,
            timestamp: Date.now(),
            reason: 'direction_failed',
          };
          state.feed.unshift(feedEntry);
          if (state.feed.length > 50) {
            state.feed = state.feed.slice(0, 50);
          }
        }
      }
    },

    pruneExpiredDirections(state, action: PayloadAction<{ week: number }>) {
      const { week } = action.payload;
      for (const direction of state.directions) {
        if (direction.status === 'active' && direction.expiresAtWeek <= week) {
          direction.status = 'expired';
        }
      }
    },

    /**
     * Reset the daily feed post counter for a new in-game day.
     * Call at the start of each week (day) to allow a fresh budget of visible
     * event-driven feed cards.
     */
    resetDailyFeedBudget(state, action: PayloadAction<{ week: number }>) {
      state.feedPostsThisDay = 0;
      state.currentFeedDay = action.payload.week;
    },

    /**
     * Update the progress percentage of an active mission direction.
     * If progress reaches the completion threshold, calls the shared
     * `applyDirectionCompletionRewards` helper so completion logic is
     * never duplicated.
     */
    updateMissionProgress(
      state,
      action: PayloadAction<{
        directionId: string;
        progressPercent: number;
        week: number;
      }>,
    ) {
      const { directionId, progressPercent, week } = action.payload;
      const direction = state.directions.find((d) => d.id === directionId);
      if (!direction || direction.status !== 'active') return;

      direction.progressPercent = Math.min(100, Math.max(0, progressPercent));

      if (direction.progressPercent >= publicOpinionConfig.missionCompletionThreshold) {
        applyDirectionCompletionRewards(state, direction, week);
      }
    },

    hydratePublicOpinion(_state, action: PayloadAction<PublicOpinionState>) {
      return action.payload;
    },
  },
  extraReducers: (builder) => {
    builder.addMatcher(
      (action) => action.type === 'game/resetGame',
      () => ({ ...initialState }),
    );
  },
});

export const {
  initializeProfiles,
  setProfileApprovals,
  updateApproval,
  addDirection,
  resolveDirection,
  pruneExpiredDirections,
  resetDailyFeedBudget,
  updateMissionProgress,
  hydratePublicOpinion,
} = publicOpinionSlice.actions;

export default publicOpinionSlice.reducer;

// Selectors
export const selectPublicOpinion = (state: StateWithPublicOpinion): PublicOpinionState =>
  state.publicOpinion;

export const selectPlayerProfile = (
  state: StateWithPublicOpinion,
  playerId: string,
): PlayerPublicProfile | undefined => state.publicOpinion.profiles[playerId];

export const selectRankedProfiles = createSelector(
  (state: StateWithPublicOpinion) => state.publicOpinion.profiles,
  (profiles) =>
    Object.values(profiles).sort((a, b) => b.approval - a.approval),
);

export const selectActiveDirections = (
  state: StateWithPublicOpinion,
  playerId: string,
): PublicDirection[] =>
  state.publicOpinion.directions.filter((d) => d.playerId === playerId && d.status === 'active');

export const selectAllDirections = (state: StateWithPublicOpinion): PublicDirection[] =>
  state.publicOpinion.directions;

export const selectPublicFeed = (state: StateWithPublicOpinion): PublicFeedEntry[] =>
  state.publicOpinion.feed;
