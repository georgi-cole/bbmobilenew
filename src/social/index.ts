// Social module public API – re-exports types and constants for use by other modules.

export type {
  SocialEnergyBank,
  RelationshipEntry,
  RelationshipsMap,
  SocialPhaseReport,
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
  selectSocialBudgets,
  selectLastSocialReport,
  selectInfluenceWeights,
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
