import { createSlice, createSelector, type PayloadAction } from '@reduxjs/toolkit';
import { publicOpinionConfig } from './publicOpinionConfig';
import { createPublicNarrative } from './publicNarratives';
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
  profile.previousApproval = profile.approval;
  const newApproval = Math.min(
    publicOpinionConfig.MAX_APPROVAL,
    Math.max(publicOpinionConfig.MIN_APPROVAL, profile.approval + delta),
  );
  profile.approval = newApproval;
  profile.seasonApprovals.push(newApproval);
  if (delta > 0) {
    profile.cumulativePositiveDelta += delta;
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
    delta,
    week,
    timestamp: Date.now(),
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
    initializeProfiles(state, action: PayloadAction<string[]>) {
      for (const playerId of action.payload) {
        if (!state.profiles[playerId]) {
          state.profiles[playerId] = {
            playerId,
            approval: publicOpinionConfig.DEFAULT_APPROVAL,
            previousApproval: publicOpinionConfig.DEFAULT_APPROVAL,
            seasonApprovals: [publicOpinionConfig.DEFAULT_APPROVAL],
            completedDirectionCount: 0,
            cumulativePositiveDelta: 0,
          };
        }
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
      }>,
    ) {
      const { playerId, delta, reason, week, isHeadline, headlineText, addToFeed = true } = action.payload;
      const profile = state.profiles[playerId];
      if (!profile) return;

      profile.previousApproval = profile.approval;
      const newApproval = Math.min(
        publicOpinionConfig.MAX_APPROVAL,
        Math.max(publicOpinionConfig.MIN_APPROVAL, profile.approval + delta),
      );
      profile.approval = newApproval;
      profile.seasonApprovals.push(newApproval);
      if (delta > 0) {
        profile.cumulativePositiveDelta += delta;
      }
      state.lastUpdatedWeek = week;

      if (addToFeed) {
        const feedEntry: PublicFeedEntry = {
          id: `${playerId}-${week}-${Date.now()}-${state.feed.length}`,
          playerId,
          text: headlineText ?? createPublicNarrative({ reason, playerId, delta, week }),
          delta,
          week,
          timestamp: Date.now(),
          isHeadline: isHeadline ?? false,
        };
        state.feed.unshift(feedEntry);
        if (state.feed.length > 50) {
          state.feed = state.feed.slice(0, 50);
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
          profile.previousApproval = profile.approval;
          const newApproval = Math.min(
            publicOpinionConfig.MAX_APPROVAL,
            Math.max(publicOpinionConfig.MIN_APPROVAL, profile.approval + delta),
          );
          profile.approval = newApproval;
          profile.seasonApprovals.push(newApproval);
          state.lastUpdatedWeek = week;

          const feedEntry: PublicFeedEntry = {
            id: `${direction.playerId}-${week}-${Date.now()}-dir-failed`,
            playerId: direction.playerId,
            text: createPublicNarrative({
              reason: 'direction_failed',
              playerId: direction.playerId,
              delta,
              week,
            }),
            delta,
            week,
            timestamp: Date.now(),
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
  updateApproval,
  addDirection,
  resolveDirection,
  pruneExpiredDirections,
  updateMissionProgress,
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
