// Social module constants – default configuration values for the social subsystem.

import type { SocialState } from './types';
import { createInitialDramaSocialNetwork } from './dramaModeEngine';

/** Default social-action energy each player receives at the start of a phase. */
export const DEFAULT_ENERGY = 5;
/** Human allowance added at the start of every social phase. */
export const HUMAN_SOCIAL_ALLOWANCE = 10;
/** Carry-over cap: three full phases, preventing late-game hoarding. */
export const MAX_HUMAN_SOCIAL_ENERGY = 30;

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
  dramaNetwork: createInitialDramaSocialNetwork(),
  influenceWeights: {},
  panelOpen: false,
  weekStartRelSnapshot: {},
  incomingInboxOpen: false,
};
