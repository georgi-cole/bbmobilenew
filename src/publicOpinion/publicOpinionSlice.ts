import { createSlice, type PayloadAction } from '@reduxjs/toolkit';
import { publicOpinionConfig } from './publicOpinionConfig';
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
      action: PayloadAction<{ playerId: string; delta: number; reason: string; week: number }>,
    ) {
      const { playerId, delta, reason, week } = action.payload;
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

      const feedEntry: PublicFeedEntry = {
        id: `${playerId}-${week}-${Date.now()}-${Math.random()}`,
        playerId,
        text: reason,
        delta,
        week,
        timestamp: Date.now(),
      };
      state.feed.unshift(feedEntry);
      if (state.feed.length > 50) {
        state.feed = state.feed.slice(0, 50);
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
      direction.status = status;
      if (status === 'completed') {
        direction.completedWeek = week;
        const profile = state.profiles[direction.playerId];
        if (profile) {
          profile.completedDirectionCount += 1;
        }
      }
    },

    pruneExpiredDirections(state, action: PayloadAction<{ week: number }>) {
      const { week } = action.payload;
      for (const direction of state.directions) {
        if (direction.status === 'active' && direction.expiresAtWeek < week) {
          direction.status = 'expired';
        }
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
} = publicOpinionSlice.actions;

export default publicOpinionSlice.reducer;

// Selectors
export const selectPublicOpinion = (state: StateWithPublicOpinion): PublicOpinionState =>
  state.publicOpinion;

export const selectPlayerProfile = (
  state: StateWithPublicOpinion,
  playerId: string,
): PlayerPublicProfile | undefined => state.publicOpinion.profiles[playerId];

export const selectRankedProfiles = (state: StateWithPublicOpinion): PlayerPublicProfile[] =>
  Object.values(state.publicOpinion.profiles).sort((a, b) => b.approval - a.approval);

export const selectActiveDirections = (
  state: StateWithPublicOpinion,
  playerId: string,
): PublicDirection[] =>
  state.publicOpinion.directions.filter((d) => d.playerId === playerId && d.status === 'active');

export const selectAllDirections = (state: StateWithPublicOpinion): PublicDirection[] =>
  state.publicOpinion.directions;

export const selectPublicFeed = (state: StateWithPublicOpinion): PublicFeedEntry[] =>
  state.publicOpinion.feed;
