import { describe, expect, it } from 'vitest'
import {
  buildMissionTasks,
  createSecretMissionState,
  type MissionTemplate,
} from '../../../src/bb/secretMission'
import gameReducer, { acceptSecretMission } from '../../../src/store/gameSlice'

const PUBLIC_ONLY_TEMPLATE: MissionTemplate = {
  id: 'capability-public-only',
  title: 'Capability Test',
  description: 'Forces the public objective when it is eligible.',
  daySpan: 3,
  requirementWeights: {
    competition_placement: 0,
    avoid_last_place: 0,
    public_approval_gain: 1,
    social_energy_empty_streak: 0,
    social_action_count: 0,
    easter_egg_discovery: 0,
    incoming_response_streak: 0,
    target_nominated: 0,
  },
}

function acceptSeededPublicOperatorMission(publicModeEnabled: boolean) {
  const baseState = gameReducer(undefined, { type: '@@INIT' })
  // Day 7 resolves to the Public Operator template. Mission #1 deterministically
  // includes public_approval_gain when Public Mode is available.
  const secretMission = createSecretMissionState(7, { missionNumber: 1 })
  secretMission.status = 'offered'

  return gameReducer(
    {
      ...baseState,
      publicModeEnabled,
      secretMission,
      secretMissionTaskSetHistory: [],
    },
    acceptSecretMission()
  ).secretMission
}

describe('secret mission capability eligibility', () => {
  it('filters Public Meter objectives when Public Mode is unavailable', () => {
    const tasks = buildMissionTasks(PUBLIC_ONLY_TEMPLATE, 5, {
      missionNumber: 1,
      capabilities: { publicModeEnabled: false },
    })

    expect(tasks).toHaveLength(5)
    expect(tasks.some((task) => task.type === 'public_approval_gain')).toBe(false)
  })

  it('keeps Public Meter objectives eligible when Public Mode is active', () => {
    const tasks = buildMissionTasks(PUBLIC_ONLY_TEMPLATE, 5, {
      missionNumber: 1,
      capabilities: { publicModeEnabled: true },
    })

    expect(tasks).toHaveLength(5)
    expect(tasks.some((task) => task.type === 'public_approval_gain')).toBe(true)
  })

  it('uses the season runtime Public Mode flag when accepting a mission', () => {
    const disabledMission = acceptSeededPublicOperatorMission(false)
    const enabledMission = acceptSeededPublicOperatorMission(true)

    expect(disabledMission?.tasks).toHaveLength(5)
    expect(disabledMission?.tasks.some((task) => task.type === 'public_approval_gain')).toBe(false)
    expect(enabledMission?.tasks.some((task) => task.type === 'public_approval_gain')).toBe(true)
  })
})
