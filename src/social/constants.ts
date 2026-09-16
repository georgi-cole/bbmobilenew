// Social module constants – backward-compatible aliases and initial state.

import type { SocialState } from './types'
import { createInitialDramaSocialNetwork } from './dramaModeEngine'
import { SOCIAL_STATE_VERSION } from './socialHistory'
import { createInitialRealitySimulationState } from './realitySimulation'
import { createInitialRealityDomainState } from './reality/state'
import { SOCIAL_RESOURCE_CALIBRATION } from './socialResourceCalibration'

/** Normal Mode Energy allowance. Kept as a compatibility alias. */
export const DEFAULT_ENERGY = SOCIAL_RESOURCE_CALIBRATION.normal.dailyEnergy
/** Reality/Drama Mode Energy allowance. Kept as a compatibility alias. */
export const HUMAN_SOCIAL_ALLOWANCE = SOCIAL_RESOURCE_CALIBRATION.drama.dailyEnergy
/** Reality/Drama Mode carry-over cap. */
export const MAX_HUMAN_SOCIAL_ENERGY = SOCIAL_RESOURCE_CALIBRATION.drama.energyCap

/** Initial value for the Redux social state subtree. */
export const SOCIAL_INITIAL_STATE: SocialState = {
  socialStateVersion: SOCIAL_STATE_VERSION,
  realitySimulation: createInitialRealitySimulationState(),
  reality: createInitialRealityDomainState(),
  intelligenceDeliveries: [],
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
