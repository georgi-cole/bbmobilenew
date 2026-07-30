import { configureStore } from '@reduxjs/toolkit'
import { describe, expect, it } from 'vitest'
import socialReducer, { setEnergyBankEntry } from '../socialSlice'
import { SOCIAL_ACTIONS } from '../socialActions'
import { normalizeActionCosts } from '../smExecNormalize'
import { getSocialResourceEffect, nextHumanSocialEnergy } from '../socialResourceEconomy'
import { executeGroupAction, initManeuvers } from '../SocialManeuvers'

function groupAction() {
  const action = SOCIAL_ACTIONS.find((candidate) => candidate.id === 'group_chat')
  if (!action) throw new Error('Missing group_chat action')
  return action
}

function makeStore(dramaMode = true) {
  return configureStore({
    reducer: {
      social: socialReducer,
      settings: () => ({ gameUX: { dramaMode } }),
    },
  })
}

describe('social resource economy', () => {
  it('adds a doubled human allowance while preserving unused energy under the cap', () => {
    expect(nextHumanSocialEnergy(0)).toBe(10)
    expect(nextHumanSocialEnergy(7)).toBe(17)
    expect(nextHumanSocialEnergy(27)).toBe(30)
  })

  it('makes Group Chat cost scale exactly with its audience', () => {
    expect(normalizeActionCosts(groupAction(), 1, true).energy).toBe(2)
    expect(normalizeActionCosts(groupAction(), 2, true).energy).toBe(2)
    expect(normalizeActionCosts(groupAction(), 3, true).energy).toBe(3)
    expect(normalizeActionCosts(groupAction(), 6, true).energy).toBe(6)
    expect(normalizeActionCosts(groupAction(), 6, false).energy).toBe(6)
  })

  it('gives every action meaningful outcome-sensitive resource effects', () => {
    for (const action of SOCIAL_ACTIONS) {
      expect(getSocialResourceEffect(action, 'success'), action.id).toBeDefined()
      expect(getSocialResourceEffect(action, 'failure'), action.id).toBeDefined()
      expect(getSocialResourceEffect(action, 'backfire'), action.id).toBeDefined()
    }
    expect(getSocialResourceEffect(groupAction(), 'success', 5).influence).toBe(6)
    expect(getSocialResourceEffect(groupAction(), 'backfire', 5).influence).toBeLessThan(0)
  })
})

describe('atomic Group Chat execution', () => {
  it('keeps main’s multi-target Group Chat behavior in normal mode', () => {
    const store = makeStore(false)
    initManeuvers(store)
    store.dispatch(setEnergyBankEntry({ playerId: 'user', value: 10 }))

    const result = executeGroupAction('user', ['a', 'b'], 'group_chat')

    expect(result.success).toBe(true)
    expect(store.getState().social.energyBank.user).toBe(8)
  })

  it('rejects one participant before spending or logging anything', () => {
    const store = makeStore()
    initManeuvers(store)
    store.dispatch(setEnergyBankEntry({ playerId: 'user', value: 10 }))

    const result = executeGroupAction('user', ['a'], 'group_chat')

    expect(result.success).toBe(false)
    expect(store.getState().social.energyBank.user).toBe(10)
    expect(store.getState().social.sessionLogs).toHaveLength(0)
  })

  it('charges once and changes every selected relationship independently', () => {
    const store = makeStore()
    initManeuvers(store)
    store.dispatch(setEnergyBankEntry({ playerId: 'user', value: 10 }))

    const rolls = [0, 0, 0, 0.999]
    const result = executeGroupAction('user', ['a', 'b'], 'group_chat', {
      source: 'manual',
      random: () => rolls.shift() ?? 0.5,
    })

    expect(result.success).toBe(true)
    expect(result.newEnergy).toBe(8)
    expect(result.targetDeltas?.a).toBe(1)
    expect(result.targetDeltas?.b).toBe(5)
    expect(store.getState().social.relationships.user.a.affinity).toBe(1)
    expect(store.getState().social.relationships.user.b.affinity).toBe(5)
    expect(store.getState().social.sessionLogs).toHaveLength(1)
    expect(store.getState().social.sessionLogs[0].targetIds).toEqual(['a', 'b'])
  })

  it('cannot partially execute when the full audience is unaffordable', () => {
    const store = makeStore()
    initManeuvers(store)
    store.dispatch(setEnergyBankEntry({ playerId: 'user', value: 3 }))

    const result = executeGroupAction('user', ['a', 'b', 'c', 'd'], 'group_chat')

    expect(result.success).toBe(false)
    expect(store.getState().social.energyBank.user).toBe(3)
    expect(store.getState().social.relationships.user).toBeUndefined()
    expect(store.getState().social.sessionLogs).toHaveLength(0)
  })
})
