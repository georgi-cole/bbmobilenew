import { describe, expect, it } from 'vitest'
import { validateSocialExecution } from '../socialExecutionGuard'
import { SOCIAL_ACTIONS } from '../socialActions'

const voxOnlyActions = [
  'pitch_target',
  'suggest_replacement',
  'ask_hold_safety',
  'warn_about_danger',
  'ask_why_nominated',
  'ask_loh_target',
  'rally_votes_against',
]

const action = (id: string) => SOCIAL_ACTIONS.find((candidate) => candidate.id === id)!

describe('Vox Populi social actions', () => {
  it('marks every LOH, replacement, and house-vote action unavailable', () => {
    expect(voxOnlyActions.map((id) => action(id).unavailableInVox)).toEqual(
      voxOnlyActions.map(() => true)
    )
  })

  it('rejects a stale classic action even if it somehow reaches execution', () => {
    expect(
      validateSocialExecution(
        {
          game: {
            phase: 'social_1',
            week: 1,
            voxPopuli: { status: 'active' },
            players: [
              { id: 'human', isUser: true, status: 'active' },
              { id: 'loh', status: 'loh' },
            ],
          },
        },
        { action: action('ask_loh_target'), actorId: 'human', targetIds: ['loh'] }
      )
    ).toEqual({ eligible: false, reason: 'This action does not apply to Vox Populi rules.' })
  })

  it('keeps valid Vox social play and Safety consultation available', () => {
    expect(action('build_quiet_bond').voxOnly).toBe(true)
    expect(action('ask_use_safety').unavailableInVox).not.toBe(true)
    expect(action('ask_safety_plan').unavailableInVox).not.toBe(true)
  })
})
