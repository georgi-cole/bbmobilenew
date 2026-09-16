export type CalibratedSocialMode = 'normal' | 'drama'

/**
 * Canonical social-resource tuning.
 *
 * Energy keeps the Social module playable, Influence represents political
 * leverage, and Info represents actionable intelligence.  Event rewards live
 * here so twists and ceremony middleware do not invent their own scales.
 */
export const SOCIAL_RESOURCE_CALIBRATION = {
  normal: {
    dailyEnergy: 5,
    activeSecondWind: 3,
    secondWindSpendThreshold: 4,
    energyCap: 20,
  },
  drama: {
    dailyEnergy: 7,
    activeSecondWind: 4,
    secondWindSpendThreshold: 4,
    energyCap: 30,
  },
  competition: {
    winnerEnergy: 5,
    secondEnergy: 2,
    thirdEnergy: 1,
    lohInfluence: 15,
    posInfluence: 12,
    voxImmunityInfluence: 10,
    allPowerExtraInfluence: 5,
    voxFinalImmunityInfluence: 15,
  },
  nomination: {
    campaignEnergy: 3,
    savedEnergy: 1,
    safetyFavorInfluence: 5,
  },
  survival: {
    normalEnergy: 2,
    normalInfluence: 8,
    voxInfluence: 12,
    doubleEnergy: 6,
    doubleInfluence: 20,
    voxPublicDarlingInfluence: 5,
  },
  relationships: {
    allianceInfluence: 20,
    allianceBreakInfluence: -25,
    promiseKeptInfluence: 15,
    promiseBrokenInfluence: -25,
  },
  publicSaveInfluence: 15,
  voxUnderTheRadarInfluence: 5,
  incoming: {
    credibleInfo: 50,
    strongInfo: 100,
  },
  battleBack: {
    normal: { energy: 10, influence: 25, info: 100 },
    drama: { energy: 15, influence: 30, info: 100 },
  },
  ambient: {
    sunnyEnergy: 1,
    rainbowEnergy: 1,
    chocolateEnergy: 1,
    easterEggEnergy: 4,
    depressionRecoveryEnergy: 3,
  },
  twinShock: {
    early: { energy: 2, influence: 10, info: 100 },
    late: { energy: 1, influence: 5, info: 75 },
  },
  democracia: {
    sole: { energy: 3, influence: 20 },
    coLoh: { energy: 2, influence: 12 },
  },
  secretMissionInfluence: 75,
  rewardedRechargeEnergy: 6,
} as const

export function calibratedEnergyCap(mode: CalibratedSocialMode): number {
  return SOCIAL_RESOURCE_CALIBRATION[mode].energyCap
}

/**
 * Add earned Energy without ever shrinking a legitimately larger carried bank.
 * The cap limits new accumulation; it is not a destructive clamp.
 */
export function addEarnedEnergy(
  current: number,
  amount: number,
  mode: CalibratedSocialMode
): number {
  const safeCurrent = Math.max(0, current)
  const cap = calibratedEnergyCap(mode)
  return Math.max(safeCurrent, Math.min(cap, safeCurrent + Math.max(0, amount)))
}

export function podiumEnergyForPlacement(placement: number): number {
  if (placement === 1) return SOCIAL_RESOURCE_CALIBRATION.competition.winnerEnergy
  if (placement === 2) return SOCIAL_RESOURCE_CALIBRATION.competition.secondEnergy
  if (placement === 3) return SOCIAL_RESOURCE_CALIBRATION.competition.thirdEnergy
  return 0
}
