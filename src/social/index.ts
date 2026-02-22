// Social module public API – re-exports types and constants for use by other modules.

export type {
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
  engineReady,
  engineComplete,
  setLastReport,
  influenceUpdated,
  setEnergyBankEntry,
  applyEnergyDelta,
  recordSocialAction,
  updateRelationship,
  selectSocialBudgets,
  selectEnergyBank,
  selectLastSocialReport,
  selectInfluenceWeights,
  selectSessionLogs,
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
export { normalizeCost, normalizeActionCosts } from './smExecNormalize';
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
