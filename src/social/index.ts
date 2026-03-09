// Social module public API – re-exports types and constants for use by other modules.

export type {
  IncomingInteraction,
  IncomingInteractionResponseType,
  IncomingInteractionType,
  SocialEnergyBank,
  RelationshipEntry,
  RelationshipsMap,
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
  engineReady,
  engineComplete,
  setLastReport,
  influenceUpdated,
  setEnergyBankEntry,
  applyEnergyDelta,
  recordSocialAction,
  pushIncomingInteraction,
  markIncomingInteractionRead,
  markAllIncomingInteractionsRead,
  resolveIncomingInteraction,
  dismissIncomingInteraction,
  resolveExpiredIncomingInteractionsForWeek,
  updateRelationship,
  openIncomingInbox,
  closeIncomingInbox,
  selectSocialBudgets,
  selectEnergyBank,
  selectLastSocialReport,
  selectInfluenceWeights,
  selectSessionLogs,
  selectIncomingInboxOpen,
  selectIncomingInteractions,
  selectUnreadIncomingInteractionCount,
  selectPendingIncomingInteractionCount,
  selectActiveIncomingInteractions,
} from './socialSlice';
export { socialMiddleware } from './socialMiddleware';
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
