import { createSlice } from '@reduxjs/toolkit';
import type { PayloadAction } from '@reduxjs/toolkit';
import type { SocialActionLogEntry, SocialPhaseReport, SocialState } from './types';
import { SOCIAL_INITIAL_STATE } from './constants';

const socialSlice = createSlice({
  name: 'social',
  initialState: SOCIAL_INITIAL_STATE,
  reducers: {
    engineReady(state, action: PayloadAction<{ budgets: Record<string, number> }>) {
      state.energyBank = action.payload.budgets;
    },
    /** Signals the engine has finished a phase; report is written via setLastReport. */
    engineComplete() {},
    setLastReport(state, action: PayloadAction<SocialPhaseReport>) {
      state.lastReport = action.payload;
    },
    /** Stores influence weights keyed by actor and decision type. */
    influenceUpdated(
      state,
      action: PayloadAction<{
        actorId: string;
        decisionType: string;
        weights: Record<string, number>;
      }>,
    ) {
      const { actorId, decisionType, weights } = action.payload;
      if (!state.influenceWeights[actorId]) {
        state.influenceWeights[actorId] = {};
      }
      state.influenceWeights[actorId][decisionType] = weights;
    },
    /** Set a player's energy bank value directly. */
    setEnergyBankEntry(state, action: PayloadAction<{ playerId: string; value: number }>) {
      state.energyBank[action.payload.playerId] = action.payload.value;
    },
    /** Add a delta to a player's energy bank (can be negative to deduct). */
    applyEnergyDelta(state, action: PayloadAction<{ playerId: string; delta: number }>) {
      const current = state.energyBank[action.payload.playerId] ?? 0;
      state.energyBank[action.payload.playerId] = current + action.payload.delta;
    },
    /** Append a social action log entry to sessionLogs. */
    recordSocialAction(state, action: PayloadAction<{ entry: SocialActionLogEntry }>) {
      state.sessionLogs.push(action.payload.entry);
    },
    /** Update the affinity (and optionally tags) for a directed relationship. */
    updateRelationship(
      state,
      action: PayloadAction<{ source: string; target: string; delta: number; tags?: string[] }>,
    ) {
      const { source, target, delta, tags } = action.payload;
      if (!state.relationships[source]) {
        state.relationships[source] = {};
      }
      const rel = state.relationships[source][target];
      if (rel) {
        rel.affinity += delta;
        if (tags) {
          rel.tags = Array.from(new Set([...rel.tags, ...tags]));
        }
      } else {
        state.relationships[source][target] = { affinity: delta, tags: tags ?? [] };
      }
    },
  },
});

export const {
  engineReady,
  engineComplete,
  setLastReport,
  influenceUpdated,
  setEnergyBankEntry,
  applyEnergyDelta,
  recordSocialAction,
  updateRelationship,
} = socialSlice.actions;
export default socialSlice.reducer;

// Selectors – typed against a minimal shape to avoid circular imports with store.ts
export const selectSocialBudgets = (state: { social: SocialState }) => state.social.energyBank;
/** Alias for selectSocialBudgets – prefer this name in SocialManeuvers contexts. */
export const selectEnergyBank = (state: { social: SocialState }) => state.social.energyBank;
export const selectLastSocialReport = (state: { social: SocialState }) =>
  state.social.lastReport ?? null;
export const selectInfluenceWeights = (state: { social: SocialState }) =>
  state.social.influenceWeights;
export const selectSessionLogs = (state: { social: SocialState }) =>
  state.social.sessionLogs as SocialState['sessionLogs'];
