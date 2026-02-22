// Social module public API – re-exports types and constants for use by other modules.

export type {
  SocialEnergyBank,
  RelationshipEntry,
  RelationshipsMap,
  SocialPhaseReport,
  SocialState,
} from './types';

export { DEFAULT_ENERGY, SOCIAL_INITIAL_STATE } from './constants';
export { socialConfig } from './socialConfig';
export { SocialEngine } from './SocialEngine';
export {
  engineReady,
  engineComplete,
  setLastReport,
  selectSocialBudgets,
  selectLastSocialReport,
} from './socialSlice';
export { socialMiddleware } from './socialMiddleware';
