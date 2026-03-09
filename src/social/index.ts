// Social module public API – re-exports types and constants for use by other modules.

export type {
  IncomingInteraction,
  IncomingInteractionPriority,
  IncomingInteractionResponseType,
  IncomingInteractionType,
  IncomingInteractionDeliveryState,
  SocialEnergyBank,
  RelationshipEntry,
  RelationshipsMap,
  ScheduledIncomingInteraction,
  SocialMemoryEntry,
  SocialMemoryEvent,
  SocialMemoryMap,
  SocialPhaseReport,
  SocialActionLogEntry,
  SocialState,
  PolicyContext,
} from './types';

export { DEFAULT_ENERGY, SOCIAL_INITIAL_STATE } from './constants';
export { socialConfig } from './socialConfig';
export { SocialEngine } from './SocialEngine';
export {
  autoResolveExpiredIncomingInteractionsForWeek,
  getIncomingInteractionTypeLabel,
  respondToIncomingInteraction,
} from './incomingInteractions';
export {
  scheduleIncomingInteractionsForPhase,
  computeIncomingInteractionEngagementScore,
  chooseIncomingInteractionType,
  shouldEnqueueInteraction,
} from './incomingInteractionAutonomy';
export type { AutonomyContext, AutonomyPlayer, AutonomyStore } from './incomingInteractionAutonomy';
export { normalizeAffinity } from './affinityUtils';
export {
  engineReady,
  engineComplete,
  setLastReport,
  influenceUpdated,
  setEnergyBankEntry,
  applyEnergyDelta,
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
  openIncomingInbox,
  closeIncomingInbox,
  selectSocialBudgets,
  selectEnergyBank,
  selectLastSocialReport,
  selectInfluenceWeights,
  selectSessionLogs,
  selectIncomingInboxOpen,
  selectIncomingInteractions,
  selectScheduledIncomingInteractions,
  selectScheduledIncomingInteractionCount,
  selectIncomingInteractionDeliveryState,
  selectUnreadIncomingInteractionCount,
  selectPendingIncomingInteractionCount,
  selectActiveIncomingInteractions,
  selectSocialMemory,
} from './socialSlice';
export { socialMiddleware } from './socialMiddleware';
export {
  deliverScheduledIncomingInteractionsForPhase,
  getIncomingInteractionPriority,
} from './incomingInteractionScheduler';
export {
  chooseActionFor,
  chooseTargetsFor,
  computeOutcomeDelta,
} from './SocialPolicy';
export {
  initInfluence,
  computeNomBias,
  computeVetoBias,
  update as influenceUpdate,
} from './SocialInfluence';
export type { ActionCategory, SocialActionDefinition } from './socialActions';
export { SOCIAL_ACTIONS } from './socialActions';
export { normalizeCost, normalizeActionCost } from './smExecNormalize';
export {
  initEnergyBank,
  get as energyBankGet,
  set as energyBankSet,
  add as energyBankAdd,
  SocialEnergyBank as SocialEnergyBankModule,
} from './SocialEnergyBank';
export type { ExecuteActionOptions, ExecuteActionResult } from './SocialManeuvers';
export {
  initManeuvers,
  getActionById,
  getAvailableActions,
  computeActionCost,
  executeAction,
  SocialManeuvers,
} from './SocialManeuvers';
export { socialAIDriver } from './socialAIDriver';
export { dispatchSocialSummary, SocialSummaryBridge } from './SocialSummaryBridge';
