// Social module constants – default configuration values for the social subsystem.

import type { SocialState } from './types';

/** Weekly social-action energy added when the first social phase begins. Unspent energy carries forward. */
export const DEFAULT_ENERGY = 5;

/** Initial value for the Redux social state subtree. */
export const SOCIAL_INITIAL_STATE: SocialState = {
  energyBank: {},
  influenceBank: {},
  infoBank: {},
  relationships: {},
  lastReport: null,
  sessionLogs: [],
  incomingInteractions: [],
  incomingInteractionLogs: [],
  scheduledIncomingInteractions: [],
  incomingInteractionDelivery: {
    lastDeliveryPhase: null,
    lastDeliveryWeek: null,
    deliveredThisPhase: 0,
  },
  socialMemory: {},
  commitments: [],
  influenceWeights: {},
  panelOpen: false,
  weekStartRelSnapshot: {},
  incomingInboxOpen: false,
};
