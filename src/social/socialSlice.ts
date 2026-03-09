import { createSlice } from '@reduxjs/toolkit';
import type { PayloadAction } from '@reduxjs/toolkit';
import type {
  IncomingInteraction,
  IncomingInteractionResponseType,
  ScheduledIncomingInteraction,
  SocialActionLogEntry,
  SocialMemoryEvent,
  SocialPhaseReport,
  SocialState,
} from './types';
import { SOCIAL_INITIAL_STATE } from './constants';
import {
  appendSocialMemoryEvent,
  applySocialMemoryDelta,
  createSocialMemoryEntry,
  decaySocialMemoryEntry,
  hasSocialMemoryDelta,
  type SocialMemoryDelta,
} from './socialMemory';

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
    /** Set a player's influence bank value directly. */
    setInfluenceBankEntry(state, action: PayloadAction<{ playerId: string; value: number }>) {
      state.influenceBank[action.payload.playerId] = action.payload.value;
    },
    /** Add a delta to a player's influence bank (can be negative to deduct). */
    applyInfluenceDelta(state, action: PayloadAction<{ playerId: string; delta: number }>) {
      const current = state.influenceBank[action.payload.playerId] ?? 0;
      state.influenceBank[action.payload.playerId] = current + action.payload.delta;
    },
    /** Set a player's info bank value directly. */
    setInfoBankEntry(state, action: PayloadAction<{ playerId: string; value: number }>) {
      state.infoBank[action.payload.playerId] = action.payload.value;
    },
    /** Add a delta to a player's info bank (can be negative to deduct). */
    applyInfoDelta(state, action: PayloadAction<{ playerId: string; delta: number }>) {
      const current = state.infoBank[action.payload.playerId] ?? 0;
      state.infoBank[action.payload.playerId] = current + action.payload.delta;
    },
    /** Append a social action log entry to sessionLogs. */
    recordSocialAction(state, action: PayloadAction<{ entry: SocialActionLogEntry }>) {
      state.sessionLogs.push(action.payload.entry);
    },
    /** Add a new incoming interaction (newest-first). */
    pushIncomingInteraction(state, action: PayloadAction<IncomingInteraction>) {
      state.incomingInteractions.unshift(action.payload);
    },
    /** Schedule an incoming interaction for a future delivery window. */
    scheduleIncomingInteraction(state, action: PayloadAction<ScheduledIncomingInteraction>) {
      state.scheduledIncomingInteractions.push(action.payload);
    },
    /**
     * Deliver scheduled interactions and update delivery counters in one reducer pass.
     * Any scheduled interactions not included in remainingScheduled are removed.
     */
    applyScheduledIncomingInteractionDelivery(
      state,
      action: PayloadAction<{
        deliveries: ScheduledIncomingInteraction[];
        remainingScheduled: ScheduledIncomingInteraction[];
        phase: string;
        week: number;
      }>,
    ) {
      const { deliveries, remainingScheduled, phase, week } = action.payload;
      state.scheduledIncomingInteractions = remainingScheduled;
      if (deliveries.length > 0) {
        const deliveredInteractions = deliveries.map((entry) => entry.interaction);
        state.incomingInteractions = [...deliveredInteractions, ...state.incomingInteractions];
      }

      const deliveryState = state.incomingInteractionDelivery;
      const samePhase =
        deliveryState.lastDeliveryPhase === phase && deliveryState.lastDeliveryWeek === week;
      state.incomingInteractionDelivery = {
        lastDeliveryPhase: phase,
        lastDeliveryWeek: week,
        deliveredThisPhase: (samePhase ? deliveryState.deliveredThisPhase : 0) + deliveries.length,
      };
    },
    /** Mark a specific incoming interaction as read. */
    markIncomingInteractionRead(state, action: PayloadAction<string>) {
      const entry = state.incomingInteractions.find((interaction) => interaction.id === action.payload);
      if (entry) {
        entry.read = true;
      }
    },
    /** Mark all incoming interactions as read. */
    markAllIncomingInteractionsRead(state) {
      state.incomingInteractions.forEach((interaction) => {
        interaction.read = true;
      });
    },
    /** Resolve an interaction with a response. */
    resolveIncomingInteraction(
      state,
      action: PayloadAction<{
        interactionId: string;
        resolvedWith: IncomingInteractionResponseType;
        resolvedAt?: number;
      }>,
    ) {
      const { interactionId, resolvedWith, resolvedAt } = action.payload;
      const entry = state.incomingInteractions.find((interaction) => interaction.id === interactionId);
      if (!entry || entry.resolved) return;
      entry.resolved = true;
      entry.read = true;
      entry.resolvedAt = resolvedAt ?? Date.now();
      entry.resolvedWith = resolvedWith;
    },
    /** Convenience helper for dismissing an interaction. */
    dismissIncomingInteraction(
      state,
      action: PayloadAction<{ interactionId: string; resolvedAt?: number }>,
    ) {
      const entry = state.incomingInteractions.find(
        (interaction) => interaction.id === action.payload.interactionId,
      );
      if (!entry || entry.resolved) return;
      entry.resolved = true;
      entry.read = true;
      entry.resolvedAt = action.payload.resolvedAt ?? Date.now();
      entry.resolvedWith = 'dismiss';
    },
    /** Resolve expired interactions when the week transitions. */
    resolveExpiredIncomingInteractionsForWeek(
      state,
      action: PayloadAction<{ week: number; resolvedAt?: number }>,
    ) {
      const { week, resolvedAt } = action.payload;
      const resolvedTimestamp = resolvedAt ?? Date.now();
      state.incomingInteractions.forEach((interaction) => {
        if (!interaction.resolved && interaction.expiresAtWeek < week) {
          interaction.resolved = true;
          interaction.read = true;
          interaction.resolvedAt = resolvedTimestamp;
          interaction.resolvedWith = 'ignore';
        }
      });
    },
    /** Update the affinity (and optionally tags) for a directed relationship. */
    updateRelationship(
      state,
      action: PayloadAction<{
        source: string;
        target: string;
        delta: number;
        tags?: string[];
        /** Origin of the action that produced this relationship change. */
        actionSource?: 'manual' | 'system';
      }>,
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
        // Avoid creating zero-information relationships (no affinity change, no tags).
        if (delta === 0 && (!tags || tags.length === 0)) {
          return;
        }
        state.relationships[source][target] = { affinity: delta, tags: tags ?? [] };
      }
    },
    /** Apply delta updates to directed social memory entries. */
    updateSocialMemory(
      state,
      action: PayloadAction<{
        actorId: string;
        targetId: string;
        deltas?: SocialMemoryDelta;
        event?: SocialMemoryEvent;
      }>,
    ) {
      const { actorId, targetId, deltas, event } = action.payload;
      // Avoid creating zero-information social memory entries (no deltas, no event).
      if (!event && !hasSocialMemoryDelta(deltas)) {
        return;
      }
      if (!state.socialMemory[actorId]) {
        state.socialMemory[actorId] = {};
      }
      let entry = state.socialMemory[actorId][targetId];
      if (!entry) {
        entry = createSocialMemoryEntry();
        state.socialMemory[actorId][targetId] = entry;
      }

      if (deltas) {
        applySocialMemoryDelta(entry, deltas);
      }
      if (event) {
        appendSocialMemoryEvent(entry, event);
      }
    },
    /** Decay all social memory signals toward zero (called at week start). */
    decaySocialMemory(state) {
      Object.values(state.socialMemory).forEach((targets) => {
        Object.values(targets).forEach((entry) => {
          decaySocialMemoryEntry(entry);
        });
      });
    },
    /** Manually open the social panel (e.g. via the FAB 💬 button). */
    openSocialPanel(state) {
      state.panelOpen = true;
    },
    /** Manually close the social panel. */
    closeSocialPanel(state) {
      state.panelOpen = false;
    },
    /** Open the incoming interactions inbox panel. */
    openIncomingInbox(state) {
      state.incomingInboxOpen = true;
    },
    /** Close the incoming interactions inbox panel. */
    closeIncomingInbox(state) {
      state.incomingInboxOpen = false;
    },
    /** Clear all session log entries (e.g. after exporting to Diary Room). */
    clearSessionLogs(state) {
      state.sessionLogs = [];
    },
    /**
     * Snapshot current relationship affinities into weekStartRelSnapshot.
     * Called at the start of each week so the week-over-week trend arrow can
     * compare current affinities against the baseline captured here.
     */
    snapshotWeekRelationships(state) {
      const snapshot: Record<string, Record<string, number>> = {};
      for (const [actorId, targets] of Object.entries(state.relationships)) {
        snapshot[actorId] = {};
        for (const [targetId, rel] of Object.entries(targets)) {
          snapshot[actorId][targetId] = rel.affinity;
        }
      }
      state.weekStartRelSnapshot = snapshot;
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
  setInfluenceBankEntry,
  applyInfluenceDelta,
  setInfoBankEntry,
  applyInfoDelta,
  recordSocialAction,
  pushIncomingInteraction,
  scheduleIncomingInteraction,
  applyScheduledIncomingInteractionDelivery,
  markIncomingInteractionRead,
  markAllIncomingInteractionsRead,
  resolveIncomingInteraction,
  dismissIncomingInteraction,
  resolveExpiredIncomingInteractionsForWeek,
  updateRelationship,
  updateSocialMemory,
  decaySocialMemory,
  openSocialPanel,
  closeSocialPanel,
  openIncomingInbox,
  closeIncomingInbox,
  clearSessionLogs,
  snapshotWeekRelationships,
} = socialSlice.actions;
export default socialSlice.reducer;

// Selectors – typed against a minimal shape to avoid circular imports with store.ts
export const selectSocialBudgets = (state: { social: SocialState }) => state.social?.energyBank;
/** Alias for selectSocialBudgets – prefer this name in SocialManeuvers contexts. */
export const selectEnergyBank = (state: { social: SocialState }) => state.social?.energyBank;
export const selectInfluenceBank = (state: { social: SocialState }) => state.social?.influenceBank;
export const selectInfoBank = (state: { social: SocialState }) => state.social?.infoBank;
export const selectLastSocialReport = (state: { social: SocialState }) =>
  state.social?.lastReport ?? null;
export const selectInfluenceWeights = (state: { social: SocialState }) =>
  state.social?.influenceWeights;
export const selectSessionLogs = (state: { social: SocialState }) =>
  state.social?.sessionLogs as SocialState['sessionLogs'];
export const selectSocialPanelOpen = (state: { social: SocialState }) =>
  state.social?.panelOpen ?? false;
export const selectSocialMemory = (state: { social: SocialState }) =>
  state.social?.socialMemory ?? {};
export const selectWeekStartRelSnapshot = (state: { social: SocialState }) =>
  state.social?.weekStartRelSnapshot ?? {};
export const selectIncomingInboxOpen = (state: { social: SocialState }) =>
  state.social?.incomingInboxOpen ?? false;
export const selectIncomingInteractions = (state: { social: SocialState }) =>
  state.social?.incomingInteractions ?? [];
export const selectScheduledIncomingInteractions = (state: { social: SocialState }) =>
  state.social?.scheduledIncomingInteractions ?? [];
export const selectIncomingInteractionDeliveryState = (state: { social: SocialState }) =>
  state.social?.incomingInteractionDelivery;
export const selectUnreadIncomingInteractionCount = (state: { social: SocialState }) =>
  selectIncomingInteractions(state).filter((interaction) => !interaction.read).length;
export const selectPendingIncomingInteractionCount = (state: { social: SocialState }) =>
  selectIncomingInteractions(state).filter((interaction) => !interaction.resolved).length;
export const selectActiveIncomingInteractions = (state: { social: SocialState }) =>
  selectIncomingInteractions(state).filter((interaction) => !interaction.resolved);
export const selectScheduledIncomingInteractionCount = (state: { social: SocialState }) =>
  selectScheduledIncomingInteractions(state).length;
