// Integration tests for the calibrated social-resource event economy.
//
// Validates:
//  1. LOH win → +5 energy (competition win remains a major reward)
//  2. Nomination → +3 campaign energy before live_vote
//  3. New alliance → +20 influence each, no energy gift
//  4. Betrayal relationship tags do not implicitly spend Social Energy
//  5. Skipping a competition has no Social Energy punishment

import { describe, it, expect } from 'vitest'
import { configureStore } from '@reduxjs/toolkit'
import gameReducer, {
  selectNominee1,
  finalizeNominations,
  submitPovDecision,
  submitPovSaveTarget,
  setReplacementNominee,
  submitHumanVote,
  commitPublicSave,
  setPhase,
} from '../../src/store/gameSlice'
import socialReducer, {
  setEnergyBankEntry,
  updateRelationship,
  selectEnergyBank,
  selectInfluenceBank,
  engineReady,
} from '../../src/social/socialSlice'
import { relationshipResourcePolicyMiddleware } from '../../src/social/relationshipResourcePolicyMiddleware'
import { socialMiddleware } from '../../src/social/socialMiddleware'
import { SocialEngine } from '../../src/social/SocialEngine'

function makeStore() {
  return configureStore({
    reducer: { game: gameReducer, social: socialReducer },
    middleware: (getDefault) =>
      getDefault().concat(relationshipResourcePolicyMiddleware, socialMiddleware),
  })
}

describe('event delta – LOH competition win', () => {
  it('grants +5 energy and calibrated influence to the LOH winner', () => {
    const store = makeStore()
    SocialEngine.init(store)
    store.dispatch(setPhase('week_start'))

    const players = store.getState().game.players
    const budgets: Record<string, number> = {}
    players.forEach((p: { id: string }) => {
      budgets[p.id] = 3
    })
    store.dispatch(engineReady({ budgets }))

    store.dispatch({ type: 'game/advance' })
    expect(store.getState().game.phase).toBe('loh_comp_announcement')
    store.dispatch({ type: 'game/advance' })
    expect(store.getState().game.phase).toBe('loh_comp')
    store.dispatch({ type: 'game/advance' })

    const stateAfterHoh = store.getState()
    expect(stateAfterHoh.game.phase).toBe('loh_results')
    const lohId = stateAfterHoh.game.lohId
    expect(lohId).not.toBeNull()
    expect(selectEnergyBank(stateAfterHoh)[lohId!]).toBe(8)
    expect(selectInfluenceBank(stateAfterHoh)[lohId!]).toBe(15)
  })
})

describe('event delta – nomination campaigning allowance', () => {
  it('gives nominees capacity to campaign before the live vote without a second late payout', () => {
    const store = makeStore()
    SocialEngine.init(store)

    const alivePlayers = store
      .getState()
      .game.players.filter((p: { status: string }) => p.status !== 'evicted' && p.status !== 'jury')
    const budgets: Record<string, number> = {}
    alivePlayers.forEach((p: { id: string }) => {
      budgets[p.id] = 5
    })
    store.dispatch(engineReady({ budgets }))

    let phase = store.getState().game.phase
    for (let i = 0; i < 80 && phase !== 'live_vote'; i += 1) {
      const gs = store.getState().game
      if (gs.awaitingNominations && !gs.pendingNominee1Id) {
        const alive = gs.players.filter(
          (p: { status: string }) => p.status !== 'evicted' && p.status !== 'jury'
        )
        const pool = alive.filter((p: { id: string }) => p.id !== gs.lohId)
        store.dispatch(selectNominee1(pool[0].id))
      } else if (gs.awaitingNominations && gs.pendingNominee1Id) {
        const alive = gs.players.filter(
          (p: { status: string }) => p.status !== 'evicted' && p.status !== 'jury'
        )
        const pool = alive.filter(
          (p: { id: string }) => p.id !== gs.lohId && p.id !== gs.pendingNominee1Id
        )
        store.dispatch(finalizeNominations(pool[0].id))
      } else if (gs.awaitingPublicSave && gs.nomineeIds.length > 0) {
        store.dispatch(commitPublicSave(gs.nomineeIds[0]))
      } else if (gs.awaitingPovDecision) {
        store.dispatch(submitPovDecision(false))
      } else if (gs.awaitingPovSaveTarget && gs.nomineeIds.length > 0) {
        store.dispatch(submitPovSaveTarget(gs.nomineeIds[0]))
      } else if (gs.replacementNeeded) {
        const alive = gs.players.filter(
          (p: { status: string }) => p.status !== 'evicted' && p.status !== 'jury'
        )
        const pool = alive.filter(
          (p: { id: string }) =>
            p.id !== gs.lohId && p.id !== gs.posWinnerId && !gs.nomineeIds.includes(p.id)
        )
        if (pool.length > 0) store.dispatch(setReplacementNominee(pool[0].id))
        else store.dispatch({ type: 'game/advance' })
      } else if (gs.awaitingHumanVote && gs.nomineeIds.length > 0) {
        store.dispatch(submitHumanVote(gs.nomineeIds[0]))
      } else {
        store.dispatch({ type: 'game/advance' })
      }
      phase = store.getState().game.phase
    }

    const state = store.getState()
    expect(state.game.phase).toBe('live_vote')
    expect(state.game.nomineeIds.length).toBeGreaterThan(0)
    state.game.nomineeIds.forEach((id: string) => {
      expect(selectEnergyBank(state)[id]).toBeGreaterThanOrEqual(8)
    })
  })
})

describe('event delta – new alliance', () => {
  it('awards political capital without gifting Energy', () => {
    const store = makeStore()
    SocialEngine.init(store)

    store.dispatch(setEnergyBankEntry({ playerId: 'p1', value: 3 }))
    store.dispatch(setEnergyBankEntry({ playerId: 'p2', value: 3 }))

    store.dispatch(
      updateRelationship({ source: 'p1', target: 'p2', delta: 10, tags: ['alliance'] })
    )
    store.dispatch(
      updateRelationship({ source: 'p2', target: 'p1', delta: 10, tags: ['alliance'] })
    )

    expect(selectEnergyBank(store.getState())['p1']).toBe(3)
    expect(selectEnergyBank(store.getState())['p2']).toBe(3)
    expect(selectInfluenceBank(store.getState())['p1']).toBe(20)
    expect(selectInfluenceBank(store.getState())['p2']).toBe(20)
  })
})

describe('event delta – betrayal tag has no implicit energy cost', () => {
  it('preserves the actor energy when a betrayal relationship tag is applied', () => {
    const store = makeStore()
    SocialEngine.init(store)
    store.dispatch(setEnergyBankEntry({ playerId: 'p1', value: 5 }))
    store.dispatch(
      updateRelationship({ source: 'p1', target: 'p2', delta: -5, tags: ['betrayal'] })
    )
    expect(selectEnergyBank(store.getState())['p1']).toBe(5)
  })

  it('does not affect the target on betrayal tag', () => {
    const store = makeStore()
    SocialEngine.init(store)
    store.dispatch(setEnergyBankEntry({ playerId: 'p2', value: 5 }))
    store.dispatch(
      updateRelationship({ source: 'p1', target: 'p2', delta: -5, tags: ['betrayal'] })
    )
    expect(selectEnergyBank(store.getState())['p2']).toBe(5)
  })
})

describe('event delta – skipping competition is resource-neutral', () => {
  it('does not punish social bandwidth for a competition skip', () => {
    const store = makeStore()
    SocialEngine.init(store)

    const alivePlayers = store
      .getState()
      .game.players.filter((p: { status: string }) => p.status !== 'evicted' && p.status !== 'jury')
    const budgets: Record<string, number> = {}
    alivePlayers.forEach((p: { id: string }) => {
      budgets[p.id] = 5
    })
    store.dispatch(engineReady({ budgets }))

    store.dispatch({ type: 'game/skipMinigame' })

    const energyBank = selectEnergyBank(store.getState())
    alivePlayers.forEach((p: { id: string }) => {
      expect(energyBank[p.id]).toBe(5)
    })
  })
})
