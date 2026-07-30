// Integration tests for the SocialManeuvers subsystem.
//
// Validates:
//  1. SOCIAL_ACTIONS contains expected entries with correct shape.
//  2. normalizeCost / normalizeActionCost handle numbers and object shapes.
//  3. SocialEnergyBank.get / set / add read/write Redux state.
//  4. getActionById returns correct definitions.
//  5. getAvailableActions filters by current energy.
//  6. executeAction deducts energy, updates relationships, records log.
//  7. executeAction returns failure when actor lacks energy (no state mutation).
//  8. executeAction returns failure for unknown action id.
//  9. Redux selectors selectEnergyBank and selectSessionLogs are correct.
// 10. updateRelationship reducer merges affinity and tags.

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { configureStore } from '@reduxjs/toolkit'
import gameReducer, { setPhase } from '../../src/store/gameSlice'
import settingsReducer, { setGameUX } from '../../src/store/settingsSlice'
import socialReducer, {
  selectEnergyBank,
  selectInfluenceBank,
  selectInfoBank,
  selectSessionLogs,
  setEnergyBankEntry,
  setInfluenceBankEntry,
  setInfoBankEntry,
  applyEnergyDelta,
  recordSocialAction,
  updateRelationship,
} from '../../src/social/socialSlice'
import { SOCIAL_ACTIONS } from '../../src/social/socialActions'
import { normalizeCost, normalizeActionCost } from '../../src/social/smExecNormalize'
import {
  initEnergyBank,
  get as bankGet,
  set as bankSet,
  add as bankAdd,
} from '../../src/social/SocialEnergyBank'
import {
  initManeuvers,
  getActionById,
  getAvailableActions,
  canAfford,
  computeRepeatedPositiveDelta,
  executeAction,
} from '../../src/social/SocialManeuvers'
import { socialMiddleware } from '../../src/social/socialMiddleware'
import { socialConfig } from '../../src/social/socialConfig'
import { MIN_ALLIANCE_AFFINITY, hasAllianceBetween } from '../../src/social/socialAlliance'
import { executeHumanRealityAction } from '../../src/social/reality/humanFlow'

function sequence(...rolls: number[]) {
  return () => rolls.shift() ?? 0
}

describe('positive interaction repetition curve', () => {
  it('gives the first use an 80% chance and the full +1..+5 range', () => {
    expect(computeRepeatedPositiveDelta(0, sequence(0.79, 0)).delta).toBe(1)
    expect(computeRepeatedPositiveDelta(0, sequence(0.79, 0.999)).delta).toBe(5)
    expect(computeRepeatedPositiveDelta(0, sequence(0.8))).toEqual({
      delta: 0,
      didBackfire: false,
    })
  })

  it('gives the second use a 50% chance and a mild failure consequence', () => {
    expect(computeRepeatedPositiveDelta(1, sequence(0.49, 0)).delta).toBe(1)
    expect(computeRepeatedPositiveDelta(1, sequence(0.49, 0.999)).delta).toBe(3)
    expect(computeRepeatedPositiveDelta(1, sequence(0.5))).toEqual({
      delta: -1,
      didBackfire: true,
    })
  })

  it('gives the third use 25%, then later uses 2% with stronger punishment', () => {
    expect(computeRepeatedPositiveDelta(2, sequence(0.24, 0.999))).toEqual({
      delta: 2,
      didBackfire: false,
    })
    expect(computeRepeatedPositiveDelta(2, sequence(0.25))).toEqual({
      delta: -3,
      didBackfire: true,
    })
    expect(computeRepeatedPositiveDelta(8, sequence(0.019))).toEqual({
      delta: 1,
      didBackfire: false,
    })
    expect(computeRepeatedPositiveDelta(8, sequence(0.02))).toEqual({
      delta: -5,
      didBackfire: true,
    })
  })

  it('uses a more reliable 100/75/30/2 curve for information gathering', () => {
    const informationChances = [1, 0.75, 0.3]
    expect(
      computeRepeatedPositiveDelta(0, sequence(0.999, 0), informationChances).didBackfire
    ).toBe(false)
    expect(computeRepeatedPositiveDelta(1, sequence(0.749, 0), informationChances).delta).toBe(1)
    expect(computeRepeatedPositiveDelta(1, sequence(0.75), informationChances)).toEqual({
      delta: -1,
      didBackfire: true,
    })
    expect(computeRepeatedPositiveDelta(2, sequence(0.299, 0), informationChances).delta).toBe(1)
    expect(computeRepeatedPositiveDelta(2, sequence(0.3), informationChances)).toEqual({
      delta: -3,
      didBackfire: true,
    })
    expect(computeRepeatedPositiveDelta(4, sequence(0.019), informationChances).delta).toBe(1)
    expect(computeRepeatedPositiveDelta(4, sequence(0.02), informationChances)).toEqual({
      delta: -5,
      didBackfire: true,
    })
  })
})
import type { SocialActionLogEntry } from '../../src/social/types'

// ── Helpers ────────────────────────────────────────────────────────────────

function makeStore(dramaMode = false) {
  const store = configureStore({ reducer: { social: socialReducer, settings: settingsReducer } })
  if (dramaMode) store.dispatch(setGameUX({ dramaMode: true }))
  return store
}

function makeStoreWithSocialMiddleware(
  dramaMode = false,
  players = [
    { id: 'p1', name: 'P1', status: 'active' as const },
    { id: 'p2', name: 'P2', status: 'active' as const },
  ]
) {
  const initialGame = gameReducer(undefined, { type: '@@test/init' })
  const store = configureStore({
    reducer: { game: gameReducer, social: socialReducer, settings: settingsReducer },
    preloadedState: {
      game: {
        ...initialGame,
        players,
      },
    } as never,
    middleware: (getDefaultMiddleware) => getDefaultMiddleware().concat(socialMiddleware),
  })
  if (dramaMode) store.dispatch(setGameUX({ dramaMode: true }))
  return store
}

describe('Classic social isolation', () => {
  it('executes a complete Classic action without writing Reality events or traces', () => {
    const store = makeStoreWithSocialMiddleware()
    initManeuvers(store)
    store.dispatch(setEnergyBankEntry({ playerId: 'p1', value: 5 }))

    const result = executeHumanRealityAction({
      actorId: 'p1',
      targetId: 'p2',
      actionId: 'compliment',
    })(store.dispatch as never, store.getState as never)

    expect(result.success).toBe(true)
    expect(store.getState().social.sessionLogs).toHaveLength(1)
    expect(store.getState().social.reality.events).toHaveLength(0)
    expect(store.getState().social.realitySimulation.trace).toHaveLength(0)
    expect(store.getState().social.realitySimulation.rng).toBeNull()
  })
})

// ── socialActions ──────────────────────────────────────────────────────────

describe('SOCIAL_ACTIONS definitions', () => {
  it('contains at least 5 actions', () => {
    expect(SOCIAL_ACTIONS.length).toBeGreaterThanOrEqual(5)
  })

  it('each action has required fields', () => {
    for (const action of SOCIAL_ACTIONS) {
      expect(typeof action.id).toBe('string')
      expect(typeof action.title).toBe('string')
      expect(['friendly', 'strategic', 'aggressive', 'alliance']).toContain(action.category)
      expect(action.baseCost).toBeDefined()
    }
  })

  it('includes compliment, rumor, whisper, proposeAlliance, startFight', () => {
    const ids = SOCIAL_ACTIONS.map((a) => a.id)
    expect(ids).toContain('compliment')
    expect(ids).toContain('rumor')
    expect(ids).toContain('whisper')
    expect(ids).toContain('proposeAlliance')
    expect(ids).toContain('startFight')
  })

  it('compliment is friendly with cost 1', () => {
    const action = SOCIAL_ACTIONS.find((a) => a.id === 'compliment')!
    expect(action.category).toBe('friendly')
    expect(action.baseCost).toBe(1)
  })

  it('startFight has outcomeTag conflict', () => {
    const action = SOCIAL_ACTIONS.find((a) => a.id === 'startFight')!
    expect(action.outcomeTag).toBe('conflict')
  })
})

// ── smExecNormalize ────────────────────────────────────────────────────────

describe('normalizeCost', () => {
  it('returns a number as-is', () => {
    expect(normalizeCost(3)).toBe(3)
  })

  it('returns energy field from object', () => {
    expect(normalizeCost({ energy: 2, info: 1 })).toBe(2)
  })

  it('falls back to 1 when object has no energy field', () => {
    expect(normalizeCost({ info: 1 })).toBe(1)
  })

  it('returns 1 for undefined', () => {
    expect(normalizeCost(undefined)).toBe(1)
  })

  it('returns 1 for null', () => {
    expect(normalizeCost(null)).toBe(1)
  })

  it('returns 1 when energy field is NaN', () => {
    expect(normalizeCost({ energy: NaN })).toBe(1)
  })

  it('returns 1 when energy field is Infinity', () => {
    expect(normalizeCost({ energy: Infinity })).toBe(1)
  })

  it('returns 1 when energy field is negative', () => {
    expect(normalizeCost({ energy: -5 })).toBe(1)
  })
})

describe('normalizeActionCost', () => {
  it('returns numeric baseCost unchanged', () => {
    const action = SOCIAL_ACTIONS.find((a) => a.id === 'compliment')!
    expect(normalizeActionCost(action)).toBe(1)
  })

  it('returns energy field for object baseCost', () => {
    const action = SOCIAL_ACTIONS.find((a) => a.id === 'whisper')!
    expect(normalizeActionCost(action)).toBe(1)
  })
})

// ── SocialEnergyBank ───────────────────────────────────────────────────────

describe('SocialEnergyBank – Redux-backed operations', () => {
  let store: ReturnType<typeof makeStore>

  beforeEach(() => {
    store = makeStore()
    initEnergyBank(store)
  })

  it('get returns 0 for unknown player', () => {
    expect(bankGet('nobody')).toBe(0)
  })

  it('set writes to Redux state', () => {
    bankSet('p1', 5)
    expect(store.getState().social.energyBank['p1']).toBe(5)
  })

  it('get reads from Redux state after set', () => {
    bankSet('p1', 7)
    expect(bankGet('p1')).toBe(7)
  })

  it('add increases energy and returns new value', () => {
    bankSet('p1', 4)
    const result = bankAdd('p1', 3)
    expect(result).toBe(7)
    expect(store.getState().social.energyBank['p1']).toBe(7)
  })

  it('add with negative delta decreases energy', () => {
    bankSet('p1', 5)
    const result = bankAdd('p1', -2)
    expect(result).toBe(3)
  })
})

// ── socialSlice new reducers ───────────────────────────────────────────────

describe('socialSlice – new reducers', () => {
  it('setEnergyBankEntry sets player energy', () => {
    const store = makeStore()
    store.dispatch(setEnergyBankEntry({ playerId: 'p1', value: 10 }))
    expect(store.getState().social.energyBank['p1']).toBe(10)
  })

  it('applyEnergyDelta adds delta to existing energy', () => {
    const store = makeStore()
    store.dispatch(setEnergyBankEntry({ playerId: 'p1', value: 5 }))
    store.dispatch(applyEnergyDelta({ playerId: 'p1', delta: -2 }))
    expect(store.getState().social.energyBank['p1']).toBe(3)
  })

  it('applyEnergyDelta from zero adds delta', () => {
    const store = makeStore()
    store.dispatch(applyEnergyDelta({ playerId: 'p1', delta: 4 }))
    expect(store.getState().social.energyBank['p1']).toBe(4)
  })

  it('recordSocialAction appends to sessionLogs', () => {
    const store = makeStore()
    store.dispatch(
      recordSocialAction({
        entry: {
          actionId: 'compliment',
          actorId: 'p1',
          targetId: 'p2',
          cost: 1,
          delta: 0,
          outcome: 'success',
          newEnergy: 4,
          timestamp: Date.now(),
        },
      })
    )
    expect(store.getState().social.sessionLogs).toHaveLength(1)
  })

  it('updateRelationship creates a new relationship entry', () => {
    const store = makeStore()
    store.dispatch(updateRelationship({ source: 'p1', target: 'p2', delta: 0.1 }))
    expect(store.getState().social.relationships['p1']['p2'].affinity).toBeCloseTo(0.1)
  })

  it('updateRelationship does not create an entry when delta is 0 and no tags', () => {
    const store = makeStore()
    store.dispatch(updateRelationship({ source: 'p1', target: 'p2', delta: 0 }))
    expect(store.getState().social.relationships['p1']?.['p2']).toBeUndefined()
  })

  it('updateRelationship accumulates affinity on existing entry', () => {
    const store = makeStore()
    store.dispatch(updateRelationship({ source: 'p1', target: 'p2', delta: 0.1 }))
    store.dispatch(updateRelationship({ source: 'p1', target: 'p2', delta: 0.05 }))
    expect(store.getState().social.relationships['p1']['p2'].affinity).toBeCloseTo(0.15)
  })

  it('updateRelationship merges tags without duplicates', () => {
    const store = makeStore()
    store.dispatch(updateRelationship({ source: 'p1', target: 'p2', delta: 0, tags: ['ally'] }))
    store.dispatch(
      updateRelationship({ source: 'p1', target: 'p2', delta: 0, tags: ['ally', 'shield'] })
    )
    const tags = store.getState().social.relationships['p1']['p2'].tags
    expect(tags).toContain('ally')
    expect(tags).toContain('shield')
    expect(tags.filter((t) => t === 'ally').length).toBe(1)
  })
})

// ── SocialManeuvers selectors ─────────────────────────────────────────────

describe('selectEnergyBank and selectSessionLogs', () => {
  it('selectEnergyBank returns the energyBank subtree', () => {
    const store = makeStore()
    store.dispatch(setEnergyBankEntry({ playerId: 'p1', value: 3 }))
    const bank = selectEnergyBank(store.getState())
    expect(bank['p1']).toBe(3)
  })

  it('selectSessionLogs returns sessionLogs array', () => {
    const store = makeStore()
    store.dispatch(
      recordSocialAction({
        entry: {
          actionId: 'compliment',
          actorId: 'p1',
          targetId: 'p2',
          cost: 1,
          delta: 0,
          outcome: 'success',
          newEnergy: 4,
          timestamp: Date.now(),
        },
      })
    )
    const logs = selectSessionLogs(store.getState())
    expect(logs).toHaveLength(1)
  })
})

// ── getActionById ─────────────────────────────────────────────────────────

describe('getActionById', () => {
  it('returns the correct definition for a known id', () => {
    const action = getActionById('rumor')
    expect(action).toBeDefined()
    expect(action!.category).toBe('aggressive')
  })

  it('returns undefined for unknown id', () => {
    expect(getActionById('nonexistent')).toBeUndefined()
  })
})

// ── getAvailableActions ───────────────────────────────────────────────────

describe('getAvailableActions', () => {
  beforeEach(() => {
    const store = makeStore()
    initManeuvers(store)
    // Energy not set → starts at 0
  })

  it('returns only zero-cost actions when player has no energy', () => {
    const store = makeStore()
    initManeuvers(store)
    // idle has baseCost 0, so it should still be available even with 0 energy
    const available = getAvailableActions('p1')
    for (const action of available) {
      expect(normalizeActionCost(action)).toBeLessThanOrEqual(0)
    }
  })

  it('returns only affordable actions', () => {
    const store = makeStore()
    initManeuvers(store)
    store.dispatch(setEnergyBankEntry({ playerId: 'p1', value: 1 }))
    // Only actions with cost ≤ 1 should appear
    const available = getAvailableActions('p1')
    for (const action of available) {
      expect(normalizeActionCost(action)).toBeLessThanOrEqual(1)
    }
  })

  it('returns all actions when player has sufficient energy', () => {
    const store = makeStore()
    initManeuvers(store)
    store.dispatch(setEnergyBankEntry({ playerId: 'p1', value: 100 }))
    // vote_rally costs influence 50, favor_request costs influence 20 → need 50+
    store.dispatch(setInfluenceBankEntry({ playerId: 'p1', value: 60 }))
    // proposeAlliance costs info 200, rumor costs info 100 → need 200+
    store.dispatch(setInfoBankEntry({ playerId: 'p1', value: 300 }))
    expect(getAvailableActions('p1').length).toBe(SOCIAL_ACTIONS.length)
  })

  it('accepts an optional state snapshot', () => {
    const store = makeStore()
    initManeuvers(store)
    const snapshot = {
      social: { energyBank: { p1: 2 }, relationships: {}, sessionLogs: [] },
    }
    const available = getAvailableActions('p1', snapshot)
    for (const action of available) {
      expect(normalizeActionCost(action)).toBeLessThanOrEqual(2)
    }
  })

  it('excludes propose alliance for a selected target that is already allied', () => {
    const store = makeStore()
    initManeuvers(store)
    store.dispatch(setEnergyBankEntry({ playerId: 'p1', value: 10 }))
    store.dispatch(setInfoBankEntry({ playerId: 'p1', value: 300 }))
    store.dispatch(
      updateRelationship({ source: 'p1', target: 'p2', delta: 50, tags: ['alliance'] })
    )
    store.dispatch(
      updateRelationship({ source: 'p2', target: 'p1', delta: 50, tags: ['alliance'] })
    )

    const ids = getAvailableActions('p1', undefined, 'p2').map((action) => action.id)

    expect(ids).not.toContain('proposeAlliance')
  })
})

// ── executeAction ─────────────────────────────────────────────────────────

describe('executeAction – happy path', () => {
  it('returns success with correct delta and newEnergy', () => {
    const store = makeStore()
    initManeuvers(store)
    store.dispatch(setEnergyBankEntry({ playerId: 'p1', value: 5 }))

    const result = executeAction('p1', 'p2', 'compliment')
    expect(result.success).toBe(true)
    expect(result.newEnergy).toBe(4) // 5 - cost(1)
  })

  it('deducts energy from Redux state', () => {
    const store = makeStore()
    initManeuvers(store)
    store.dispatch(setEnergyBankEntry({ playerId: 'p1', value: 5 }))

    executeAction('p1', 'p2', 'compliment')
    expect(store.getState().social.energyBank['p1']).toBe(4)
  })

  it('appends an entry to sessionLogs', () => {
    const store = makeStore()
    initManeuvers(store)
    store.dispatch(setEnergyBankEntry({ playerId: 'p1', value: 5 }))

    executeAction('p1', 'p2', 'compliment')
    expect(store.getState().social.sessionLogs).toHaveLength(1)
  })

  it('session log entry contains expected fields', () => {
    const store = makeStore()
    initManeuvers(store)
    store.dispatch(setEnergyBankEntry({ playerId: 'p1', value: 5 }))

    executeAction('p1', 'p2', 'compliment')
    const entry = store.getState().social.sessionLogs[0] as SocialActionLogEntry
    expect(entry.actionId).toBe('compliment')
    expect(entry.actorId).toBe('p1')
    expect(entry.targetId).toBe('p2')
    expect(typeof entry.cost).toBe('number')
    expect(typeof entry.delta).toBe('number')
    expect(entry.outcome).toBe('success')
  })

  it('updates relationship affinity in Redux state', () => {
    const store = makeStore()
    initManeuvers(store)
    store.dispatch(setEnergyBankEntry({ playerId: 'p1', value: 10 }))

    executeAction('p1', 'p2', 'compliment', { random: sequence(0.79, 0.999) })
    const rel = store.getState().social.relationships['p1']?.['p2']
    expect(rel).toBeDefined()
    expect(rel!.affinity).toBe(socialConfig.affinityDeltas.friendlySuccess)
  })

  it('applies and reports the exact persisted delta for a successful friendly action', () => {
    const store = makeStore()
    initManeuvers(store)
    store.dispatch(setEnergyBankEntry({ playerId: 'p1', value: 10 }))

    const result = executeAction('p1', 'p2', 'compliment', {
      random: sequence(0.79, 0.999),
    })
    const relationship = store.getState().social.relationships.p1?.p2
    const log = store.getState().social.sessionLogs[0] as SocialActionLogEntry

    expect(result.delta).toBe(socialConfig.affinityDeltas.friendlySuccess)
    expect(relationship?.affinity).toBe(result.delta)
    expect(log.delta).toBe(result.delta)
    expect(result.summary).toBe('Compliment succeeded (+' + result.delta + ' relationship)')
  })

  it('keeps the original one-sided relationship delta in standard mode', () => {
    const store = makeStore(false)
    initManeuvers(store)
    store.dispatch(setEnergyBankEntry({ playerId: 'p1', value: 10 }))

    const result = executeAction('p1', 'p2', 'compliment', {
      outcome: 'success',
      random: sequence(0.79, 0.999),
    })

    expect(result.delta).toBe(socialConfig.affinityDeltas.friendlySuccess)
  })

  it('tags relationship with outcomeTag when action has one', () => {
    const store = makeStore(true)
    initManeuvers(store)
    store.dispatch(setEnergyBankEntry({ playerId: 'p1', value: 10 }))

    executeAction('p1', 'p2', 'startFight')
    const rel = store.getState().social.relationships['p1']?.['p2']
    expect(rel?.tags).toContain('conflict')
  })

  it('applies the contextual subject tag only for primaryPlusSubject actions', () => {
    const store = makeStoreWithSocialMiddleware(true, [
      { id: 'p1', name: 'P1', status: 'active' },
      { id: 'p2', name: 'P2', status: 'loh' },
      { id: 'p3', name: 'P3', status: 'active' },
    ])
    initManeuvers(store)
    store.dispatch(setEnergyBankEntry({ playerId: 'p1', value: 10 }))
    store.dispatch(setInfluenceBankEntry({ playerId: 'p1', value: 300 }))
    store.dispatch(setInfoBankEntry({ playerId: 'p1', value: 300 }))
    store.dispatch(setPhase('social_1'))

    executeAction('p1', 'p2', 'pitch_target', { subjectId: 'p3' })

    const rel = store.getState().social.relationships['p2']?.['p3']
    expect(rel?.tags).toContain('target')
  })

  it('ignores subjectId for non-primaryPlusSubject actions', () => {
    const store = makeStore()
    initManeuvers(store)
    store.dispatch(setEnergyBankEntry({ playerId: 'p1', value: 10 }))

    executeAction('p1', 'p2', 'startFight', { subjectId: 'p3' })

    const rel = store.getState().social.relationships['p2']?.['p3']
    expect(rel).toBeUndefined()
  })

  it('multiple executions accumulate session logs', () => {
    const store = makeStore()
    initManeuvers(store)
    store.dispatch(setEnergyBankEntry({ playerId: 'p1', value: 10 }))

    executeAction('p1', 'p2', 'compliment')
    executeAction('p1', 'p2', 'compliment')
    expect(store.getState().social.sessionLogs).toHaveLength(2)
  })

  it('can backfire on the third repeated beneficial action against the same target', () => {
    const store = makeStore()
    initManeuvers(store)
    store.dispatch(setEnergyBankEntry({ playerId: 'p1', value: 5 }))
    store.dispatch(setInfluenceBankEntry({ playerId: 'p1', value: 0 }))

    executeAction('p1', 'p2', 'compliment', {
      outcome: 'success',
      random: sequence(0.79, 0.999),
    })
    executeAction('p1', 'p2', 'compliment', {
      outcome: 'success',
      random: sequence(0.49, 0.999),
    })
    expect(store.getState().social.relationships['p1']?.['p2']?.affinity).toBe(8)
    expect(store.getState().social.influenceBank['p1']).toBe(4)

    const result = executeAction('p1', 'p2', 'compliment', {
      outcome: 'success',
      random: sequence(0.25),
    })

    expect(result.delta).toBe(-3)
    expect(result.summary).toBe('Compliment backfired (-3 relationship)')
    expect(store.getState().social.relationships['p1']?.['p2']?.affinity).toBe(5)
    expect(store.getState().social.influenceBank['p1']).toBe(2)
    expect((store.getState().social.sessionLogs[2] as SocialActionLogEntry).yieldsApplied).toEqual({
      influence: -2,
    })
  })

  it('can still land on the third repeated action', () => {
    const store = makeStore()
    initManeuvers(store)
    store.dispatch(setEnergyBankEntry({ playerId: 'p1', value: 5 }))
    store.dispatch(setInfluenceBankEntry({ playerId: 'p1', value: 0 }))

    executeAction('p1', 'p2', 'compliment', {
      outcome: 'success',
      random: sequence(0.79, 0.999),
    })
    executeAction('p1', 'p2', 'compliment', {
      outcome: 'success',
      random: sequence(0.49, 0.999),
    })
    const result = executeAction('p1', 'p2', 'compliment', {
      outcome: 'success',
      random: sequence(0.24, 0.999),
    })

    expect(result.delta).toBe(2)
    expect(result.summary).toBe('Compliment succeeded (+2 relationship)')
    expect(store.getState().social.relationships['p1']?.['p2']?.affinity).toBe(10)
    expect(store.getState().social.influenceBank['p1']).toBe(6)
  })
})

describe('executeAction – failure cases', () => {
  it('returns failure for unknown action id', () => {
    const store = makeStore()
    initManeuvers(store)
    store.dispatch(setEnergyBankEntry({ playerId: 'p1', value: 10 }))

    const result = executeAction('p1', 'p2', 'unknown_action_xyz')
    expect(result.success).toBe(false)
  })

  it('does not mutate state for unknown action id', () => {
    const store = makeStore()
    initManeuvers(store)
    store.dispatch(setEnergyBankEntry({ playerId: 'p1', value: 10 }))

    executeAction('p1', 'p2', 'unknown_action_xyz')
    expect(store.getState().social.sessionLogs).toHaveLength(0)
    expect(store.getState().social.energyBank['p1']).toBe(10)
  })

  it('returns failure when player lacks energy', () => {
    const store = makeStore()
    initManeuvers(store)
    store.dispatch(setEnergyBankEntry({ playerId: 'p1', value: 0 }))

    const result = executeAction('p1', 'p2', 'compliment')
    expect(result.success).toBe(false)
  })

  it('does not deduct energy on insufficient funds', () => {
    const store = makeStore()
    initManeuvers(store)
    store.dispatch(setEnergyBankEntry({ playerId: 'p1', value: 0 }))

    executeAction('p1', 'p2', 'compliment')
    expect(store.getState().social.energyBank['p1']).toBe(0)
  })

  it('does not append to sessionLogs on failure', () => {
    const store = makeStore()
    initManeuvers(store)
    store.dispatch(setEnergyBankEntry({ playerId: 'p1', value: 0 }))

    executeAction('p1', 'p2', 'compliment')
    expect(store.getState().social.sessionLogs).toHaveLength(0)
  })

  it('supports forced failure outcome', () => {
    const store = makeStore()
    initManeuvers(store)
    store.dispatch(setEnergyBankEntry({ playerId: 'p1', value: 10 }))

    const result = executeAction('p1', 'p2', 'compliment', { outcome: 'failure' })
    expect(result.success).toBe(true)
    const entry = store.getState().social.sessionLogs[0] as SocialActionLogEntry
    expect(entry.outcome).toBe('failure')
  })
})

// ── Integration: computeOutcomeDelta wired through executeAction ──────────

describe('executeAction – outcome delta from SocialPolicy', () => {
  it('reports the applied delta for ally on success', () => {
    const store = makeStore()
    initManeuvers(store)
    store.dispatch(setEnergyBankEntry({ playerId: 'p1', value: 10 }))

    const result = executeAction('p1', 'p2', 'ally', {
      outcome: 'success',
      random: sequence(0.79, 0.999),
    })
    expect(result.success).toBe(true)
    expect(result.delta).toBe(socialConfig.affinityDeltas.friendlySuccess)
  })

  it('delta for betray (aggressive, socialConfig) is negative on success', () => {
    const store = makeStore(true)
    initManeuvers(store)
    store.dispatch(setEnergyBankEntry({ playerId: 'p1', value: 10 }))
    store.dispatch(
      updateRelationship({ source: 'p1', target: 'p2', delta: 50, tags: ['alliance'] })
    )
    store.dispatch(
      updateRelationship({ source: 'p2', target: 'p1', delta: 50, tags: ['alliance'] })
    )

    const result = executeAction('p1', 'p2', 'betray', { outcome: 'success' })
    expect(result.success).toBe(true)
    expect(result.delta).toBe(socialConfig.affinityDeltas.aggressiveSuccess)
  })

  it('reports the applied delta for compliment on success', () => {
    const store = makeStore()
    initManeuvers(store)
    store.dispatch(setEnergyBankEntry({ playerId: 'p1', value: 10 }))

    const result = executeAction('p1', 'p2', 'compliment', {
      outcome: 'success',
      random: sequence(0.79, 0.999),
    })
    expect(result.delta).toBe(socialConfig.affinityDeltas.friendlySuccess)
  })
})

// ── SocialEnergyBank energy clamping ──────────────────────────────────────

describe('SocialEnergyBank – energy clamped at 0', () => {
  it('add with delta that would produce negative energy clamps at 0', () => {
    const store = makeStore()
    initEnergyBank(store)
    bankSet('p1', 2)
    const result = bankAdd('p1', -10)
    expect(result).toBe(0)
    expect(store.getState().social.energyBank['p1']).toBe(0)
  })
})

// ── canAfford ──────────────────────────────────────────────────────────────

describe('canAfford', () => {
  it('returns true when all resource balances are sufficient', () => {
    const store = makeStore()
    initManeuvers(store)
    store.dispatch(setEnergyBankEntry({ playerId: 'p1', value: 5 }))
    store.dispatch(setInfluenceBankEntry({ playerId: 'p1', value: 2 }))
    store.dispatch(setInfoBankEntry({ playerId: 'p1', value: 3 }))
    expect(canAfford('p1', { energy: 5, influence: 2, info: 3 })).toBe(true)
  })

  it('returns false when energy is insufficient', () => {
    const store = makeStore()
    initManeuvers(store)
    store.dispatch(setEnergyBankEntry({ playerId: 'p1', value: 0 }))
    store.dispatch(setInfluenceBankEntry({ playerId: 'p1', value: 5 }))
    store.dispatch(setInfoBankEntry({ playerId: 'p1', value: 5 }))
    expect(canAfford('p1', { energy: 1, influence: 0, info: 0 })).toBe(false)
  })

  it('returns false when influence is insufficient', () => {
    const store = makeStore()
    initManeuvers(store)
    store.dispatch(setEnergyBankEntry({ playerId: 'p1', value: 10 }))
    store.dispatch(setInfluenceBankEntry({ playerId: 'p1', value: 0 }))
    store.dispatch(setInfoBankEntry({ playerId: 'p1', value: 10 }))
    expect(canAfford('p1', { energy: 1, influence: 1, info: 0 })).toBe(false)
  })

  it('returns false when info is insufficient', () => {
    const store = makeStore()
    initManeuvers(store)
    store.dispatch(setEnergyBankEntry({ playerId: 'p1', value: 10 }))
    store.dispatch(setInfluenceBankEntry({ playerId: 'p1', value: 10 }))
    store.dispatch(setInfoBankEntry({ playerId: 'p1', value: 0 }))
    expect(canAfford('p1', { energy: 1, influence: 0, info: 1 })).toBe(false)
  })

  it('accepts a state snapshot with optional influenceBank/infoBank', () => {
    const store = makeStore()
    initManeuvers(store)
    const snapshot = {
      social: {
        energyBank: { p1: 5 },
        influenceBank: { p1: 2 },
        infoBank: { p1: 3 },
        relationships: {},
        sessionLogs: [],
      },
    }
    expect(canAfford('p1', { energy: 5, influence: 2, info: 3 }, snapshot)).toBe(true)
    expect(canAfford('p1', { energy: 5, influence: 3, info: 0 }, snapshot)).toBe(false)
  })

  it('treats missing influenceBank/infoBank in snapshot as 0', () => {
    const store = makeStore()
    initManeuvers(store)
    const snapshot = {
      social: { energyBank: { p1: 5 }, relationships: {}, sessionLogs: [] },
    }
    // influence and info are absent → treated as 0
    expect(canAfford('p1', { energy: 5, influence: 0, info: 0 }, snapshot)).toBe(true)
    expect(canAfford('p1', { energy: 5, influence: 1, info: 0 }, snapshot)).toBe(false)
  })
})

// ── multi-resource getAvailableActions ────────────────────────────────────

describe('getAvailableActions – multi-resource filtering', () => {
  it('filters out actions that require influence when player has none', () => {
    const store = makeStore()
    initManeuvers(store)
    store.dispatch(setEnergyBankEntry({ playerId: 'p1', value: 10 }))
    // No influence → vote_rally (energy:2, influence:50) and favor_request (energy:1, influence:20) must be excluded
    const available = getAvailableActions('p1')
    const ids = available.map((a) => a.id)
    expect(ids).not.toContain('vote_rally')
    expect(ids).not.toContain('favor_request')
  })

  it('filters out actions that require info when player has none', () => {
    const store = makeStore()
    initManeuvers(store)
    store.dispatch(setEnergyBankEntry({ playerId: 'p1', value: 10 }))
    // No info → proposeAlliance ({ energy:3, info:200 }) and rumor ({ energy:2, info:100 }) excluded
    const available = getAvailableActions('p1')
    const ids = available.map((a) => a.id)
    expect(ids).not.toContain('proposeAlliance')
    expect(ids).not.toContain('rumor')
  })

  it('includes multi-resource actions when all resources are available', () => {
    const store = makeStore()
    initManeuvers(store)
    store.dispatch(setEnergyBankEntry({ playerId: 'p1', value: 10 }))
    // vote_rally needs influence 50; favor_request needs influence 20
    store.dispatch(setInfluenceBankEntry({ playerId: 'p1', value: 60 }))
    // proposeAlliance needs info 200; rumor needs info 100
    store.dispatch(setInfoBankEntry({ playerId: 'p1', value: 300 }))
    const available = getAvailableActions('p1')
    const ids = available.map((a) => a.id)
    expect(ids).toContain('proposeAlliance')
    expect(ids).toContain('vote_rally')
    expect(ids).toContain('rumor')
  })
})

// ── executeAction – multi-resource deductions ─────────────────────────────

describe('executeAction – multi-resource deductions', () => {
  it('deducts info cost when executing rumor (info cost 100 pts)', () => {
    const store = makeStore(true)
    initManeuvers(store)
    store.dispatch(setEnergyBankEntry({ playerId: 'p1', value: 5 }))
    store.dispatch(setInfoBankEntry({ playerId: 'p1', value: 150 }))

    executeAction('p1', 'p2', 'rumor')
    expect(store.getState().social.infoBank['p1']).toBe(50) // 150 - 100
  })

  it('deducts influence cost when executing vote_rally (influence cost 50 pts)', () => {
    const store = makeStore()
    initManeuvers(store)
    store.dispatch(setEnergyBankEntry({ playerId: 'p1', value: 5 }))
    store.dispatch(setInfluenceBankEntry({ playerId: 'p1', value: 60 }))

    // Force failure so no yield is applied — isolates the cost deduction
    executeAction('p1', 'p2', 'vote_rally', { outcome: 'failure' })
    expect(store.getState().social.influenceBank['p1']).toBe(10) // 60 - 50
  })

  it('returns failure when info is insufficient for rumor', () => {
    const store = makeStore(true)
    initManeuvers(store)
    store.dispatch(setEnergyBankEntry({ playerId: 'p1', value: 5 }))
    // No info set → 0 < 100 required

    const result = executeAction('p1', 'p2', 'rumor')
    expect(result.success).toBe(false)
    expect(result.summary).toBe('Insufficient resources')
  })

  it('does not mutate any state when info is insufficient for rumor', () => {
    const store = makeStore()
    initManeuvers(store)
    store.dispatch(setEnergyBankEntry({ playerId: 'p1', value: 5 }))

    executeAction('p1', 'p2', 'rumor')
    expect(store.getState().social.energyBank['p1']).toBe(5)
    expect(store.getState().social.sessionLogs).toHaveLength(0)
  })

  it('applies influence yield (2 pts) on successful compliment', () => {
    const store = makeStore()
    initManeuvers(store)
    store.dispatch(setEnergyBankEntry({ playerId: 'p1', value: 5 }))
    store.dispatch(setInfluenceBankEntry({ playerId: 'p1', value: 0 }))

    executeAction('p1', 'p2', 'compliment', {
      outcome: 'success',
      random: sequence(0.79, 0.999),
    })
    expect(store.getState().social.influenceBank['p1']).toBe(2) // 0 + yield(2 pts)
  })

  it('does not apply influence yield on failure', () => {
    const store = makeStore()
    initManeuvers(store)
    store.dispatch(setEnergyBankEntry({ playerId: 'p1', value: 5 }))
    store.dispatch(setInfluenceBankEntry({ playerId: 'p1', value: 0 }))

    executeAction('p1', 'p2', 'compliment', { outcome: 'failure' })
    expect(store.getState().social.influenceBank['p1']).toBe(0) // no yield on failure
  })

  it('can reverse positive resource yields after repeated use', () => {
    const store = makeStore()
    initManeuvers(store)
    store.dispatch(setEnergyBankEntry({ playerId: 'p1', value: 5 }))
    store.dispatch(setInfoBankEntry({ playerId: 'p1', value: 0 }))

    executeAction('p1', 'p2', 'whisper', {
      outcome: 'success',
      random: sequence(0.79, 0.999),
    })
    executeAction('p1', 'p2', 'whisper', {
      outcome: 'success',
      random: sequence(0.49, 0.999),
    })
    executeAction('p1', 'p2', 'whisper', {
      outcome: 'success',
      random: sequence(0.3),
    })

    expect(store.getState().social.infoBank['p1']).toBe(100)
    expect((store.getState().social.sessionLogs[2] as SocialActionLogEntry).yieldsApplied).toEqual({
      info: -100,
    })
  })

  it('propose alliance success creates a reciprocal alliance', () => {
    const store = makeStore(true)
    initManeuvers(store)
    store.dispatch(setEnergyBankEntry({ playerId: 'p1', value: 10 }))
    store.dispatch(setInfoBankEntry({ playerId: 'p1', value: 300 }))

    const result = executeAction('p1', 'p2', 'proposeAlliance', {
      outcome: 'success',
      random: () => 0,
    })

    expect(result.success).toBe(true)
    expect(store.getState().social.relationships.p1?.p2?.tags).toContain('alliance')
    expect(store.getState().social.relationships.p2?.p1?.tags).toContain('alliance')
    expect(store.getState().social.relationships.p1?.p2?.affinity).toBeGreaterThanOrEqual(
      MIN_ALLIANCE_AFFINITY
    )
    expect(store.getState().social.relationships.p2?.p1?.affinity).toBeGreaterThanOrEqual(
      MIN_ALLIANCE_AFFINITY
    )
    expect(hasAllianceBetween(store.getState().social.relationships, 'p1', 'p2')).toBe(true)
    expect(getAvailableActions('p1', undefined, 'p2').map((action) => action.id)).not.toContain(
      'proposeAlliance'
    )
  })

  it('grants alliance formation resources only once for a reciprocal alliance', () => {
    const store = makeStoreWithSocialMiddleware(true)
    initManeuvers(store)
    store.dispatch(setEnergyBankEntry({ playerId: 'p1', value: 10 }))
    store.dispatch(setInfoBankEntry({ playerId: 'p1', value: 300 }))
    store.dispatch(setInfluenceBankEntry({ playerId: 'p1', value: 0 }))

    executeAction('p1', 'p2', 'proposeAlliance', {
      outcome: 'success',
      source: 'manual',
      random: () => 0,
    })

    expect(store.getState().social.energyBank.p1).toBe(8)
    expect(store.getState().social.energyBank.p2).toBe(2)
    expect(store.getState().social.influenceBank.p1).toBe(208)
    expect(store.getState().social.influenceBank.p2).toBe(200)
  })

  it('blocks proposing an alliance while the relationship is already allied', () => {
    const store = makeStore()
    initManeuvers(store)
    store.dispatch(setEnergyBankEntry({ playerId: 'p1', value: 10 }))
    store.dispatch(setInfoBankEntry({ playerId: 'p1', value: 300 }))
    store.dispatch(
      updateRelationship({ source: 'p1', target: 'p2', delta: 50, tags: ['alliance'] })
    )
    store.dispatch(
      updateRelationship({ source: 'p2', target: 'p1', delta: 50, tags: ['alliance'] })
    )

    const result = executeAction('p1', 'p2', 'proposeAlliance', { outcome: 'success' })

    expect(result).toMatchObject({ success: false, summary: 'Already allied' })
    expect(store.getState().social.energyBank.p1).toBe(10)
    expect(store.getState().social.sessionLogs).toHaveLength(0)
  })

  it('repairs stale low-affinity alliance tags through a newly accepted proposal', () => {
    const store = makeStore(true)
    initManeuvers(store)
    store.dispatch(setEnergyBankEntry({ playerId: 'p1', value: 10 }))
    store.dispatch(setInfoBankEntry({ playerId: 'p1', value: 300 }))
    store.dispatch(updateRelationship({ source: 'p1', target: 'p2', delta: 5, tags: ['alliance'] }))
    store.dispatch(updateRelationship({ source: 'p2', target: 'p1', delta: 5, tags: ['alliance'] }))
    expect(hasAllianceBetween(store.getState().social.relationships, 'p1', 'p2')).toBe(false)

    const result = executeAction('p1', 'p2', 'proposeAlliance', {
      outcome: 'success',
      random: () => 0,
    })

    expect(result.success).toBe(true)
    expect(hasAllianceBetween(store.getState().social.relationships, 'p1', 'p2')).toBe(true)
  })

  it('can turn a risky alliance proposal into a betrayal', () => {
    const store = makeStore(true)
    initManeuvers(store)
    store.dispatch(setEnergyBankEntry({ playerId: 'p1', value: 10 }))
    store.dispatch(setInfoBankEntry({ playerId: 'p1', value: 300 }))
    store.dispatch(updateRelationship({ source: 'p1', target: 'p2', delta: -20 }))
    const randomSpy = vi
      .spyOn(Math, 'random')
      .mockReturnValueOnce(0.01)
      .mockReturnValueOnce(0.01)
      .mockReturnValue(0.5)

    const result = executeAction('p1', 'p2', 'proposeAlliance')
    randomSpy.mockRestore()

    expect(result.success).toBe(true)
    expect(result.summary).toMatch(/accepted|playing both sides|strategically convenient/)
    expect(store.getState().social.relationships.p1?.p2?.tags ?? []).not.toContain('alliance')
    expect(store.getState().social.relationships.p2?.p1?.tags).toContain('betrayal')
    expect(store.getState().social.relationships.p2?.p1?.tags).not.toContain('alliance')
  })
})

// ── executeAction – balancesAfter in session log ──────────────────────────

describe('executeAction – balancesAfter in sessionLogs', () => {
  it('session log entry contains costs with all three resources (rumor: energy+info)', () => {
    const store = makeStore(true)
    initManeuvers(store)
    store.dispatch(setEnergyBankEntry({ playerId: 'p1', value: 5 }))
    store.dispatch(setInfoBankEntry({ playerId: 'p1', value: 200 }))

    executeAction('p1', 'p2', 'rumor')
    const entry = store.getState().social.sessionLogs[0] as SocialActionLogEntry
    expect(entry.costs).toEqual({ energy: 3, influence: 0, info: 100 })
  })

  it('session log entry contains balancesAfter (whisper: costs energy 1, yields info +100)', () => {
    const store = makeStore()
    initManeuvers(store)
    store.dispatch(setEnergyBankEntry({ playerId: 'p1', value: 5 }))
    store.dispatch(setInfluenceBankEntry({ playerId: 'p1', value: 0 }))
    store.dispatch(setInfoBankEntry({ playerId: 'p1', value: 0 }))

    // whisper: costs energy 1 only; yields info +100 on success
    executeAction('p1', 'p2', 'whisper', {
      outcome: 'success',
      random: sequence(0.79, 0.999),
    })
    const entry = store.getState().social.sessionLogs[0] as SocialActionLogEntry
    expect(entry.balancesAfter).toEqual({ energy: 4, influence: 0, info: 100 })
  })

  it('session log entry contains yieldsApplied for compliment (influence: 2 pts)', () => {
    const store = makeStore()
    initManeuvers(store)
    store.dispatch(setEnergyBankEntry({ playerId: 'p1', value: 5 }))

    executeAction('p1', 'p2', 'compliment', {
      outcome: 'success',
      random: sequence(0.79, 0.999),
    })
    const entry = store.getState().social.sessionLogs[0] as SocialActionLogEntry
    expect(entry.yieldsApplied).toBeDefined()
    expect(entry.yieldsApplied?.influence).toBe(2) // 0.02 × 100
  })

  it('session log entry does not have yieldsApplied for actions without yields', () => {
    const store = makeStore()
    initManeuvers(store)
    store.dispatch(setEnergyBankEntry({ playerId: 'p1', value: 10 }))

    executeAction('p1', 'p2', 'ally')
    const entry = store.getState().social.sessionLogs[0] as SocialActionLogEntry
    expect(entry.yieldsApplied).toBeUndefined()
  })

  it('session log entry does not have yieldsApplied when an action with yields fails', () => {
    const store = makeStore()
    initManeuvers(store)
    store.dispatch(setEnergyBankEntry({ playerId: 'p1', value: 5 }))

    executeAction('p1', 'p2', 'compliment', { outcome: 'failure' })
    const entry = store.getState().social.sessionLogs[0] as SocialActionLogEntry
    expect(entry.yieldsApplied).toBeUndefined()
  })

  it('selectInfluenceBank and selectInfoBank after vote_rally deduction (influence -50)', () => {
    const store = makeStore()
    initManeuvers(store)
    store.dispatch(setEnergyBankEntry({ playerId: 'p1', value: 5 }))
    store.dispatch(setInfluenceBankEntry({ playerId: 'p1', value: 60 }))
    store.dispatch(setInfoBankEntry({ playerId: 'p1', value: 0 }))

    executeAction('p1', 'p2', 'vote_rally', { random: sequence(0.79, 0.999) })
    const influenceBank = selectInfluenceBank(store.getState())
    const infoBank = selectInfoBank(store.getState())
    // vote_rally costs influence 50; on success yields influence +4
    expect(influenceBank['p1']).toBe(14) // 60 - 50 + 4
    expect(infoBank['p1']).toBe(0) // unchanged
  })

  it('whisper info yield: session log entry contains yieldsApplied.info = 100', () => {
    const store = makeStore()
    initManeuvers(store)
    store.dispatch(setEnergyBankEntry({ playerId: 'p1', value: 5 }))

    executeAction('p1', 'p2', 'whisper', {
      outcome: 'success',
      random: sequence(0.79, 0.999),
    })
    const entry = store.getState().social.sessionLogs[0] as SocialActionLogEntry
    expect(entry.yieldsApplied).toBeDefined()
    expect(entry.yieldsApplied?.info).toBe(100) // 1.0 × 100
    expect(entry.yieldsApplied?.influence).toBeUndefined()
  })
})
