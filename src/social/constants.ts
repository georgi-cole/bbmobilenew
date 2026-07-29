// Social module constants – backward-compatible aliases and initial state.

import type { SocialState } from './types'
import { createInitialDramaSocialNetwork } from './dramaModeEngine'
import { SOCIAL_STATE_VERSION } from './socialHistory'
import { createInitialRealitySimulationState } from './realitySimulation'
import { createInitialRealityDomainState } from './reality/state'

/** Normal Mode weekly Energy allowance. */
export const DEFAULT_ENERGY = 5
/** Drama Mode weekly Energy allowance. */
export const HUMAN_SOCIAL_ALLOWANCE = 10
/** Drama Mode carry-over cap. */
export const MAX_HUMAN_SOCIAL_ENERGY = 30

/** Initial value for the Redux social state subtree. */
export const SOCIAL_INITIAL_STATE: SocialState = {
  socialStateVersion: SOCIAL_STATE_VERSION,
  realitySimulation: createInitialRealitySimulationState(),
  reality: createInitialRealityDomainState(),
  energyBank: {},
  influenceBank: {},
  infoBank: {},
  relationships: {},
  lastReport: null,
  sessionLogs: [],
  actionHistory: [],
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
}
