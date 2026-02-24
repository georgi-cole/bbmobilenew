// Social module constants – default configuration values for the social subsystem.

import type { SocialState } from './types';

/** Default social-action energy each player receives at the start of a phase. */
export const DEFAULT_ENERGY = 5;

/** Initial value for the Redux social state subtree. */
export const SOCIAL_INITIAL_STATE: SocialState = {
  energyBank: {},
  influenceBank: {},
  infoBank: {},
  relationships: {},
  lastReport: null,
  sessionLogs: [],
  influenceWeights: {},
  panelOpen: false,
  weekStartRelSnapshot: {},
};
