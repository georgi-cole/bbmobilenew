import { configureStore } from '@reduxjs/toolkit'
import { describe, expect, it } from 'vitest'
import gameReducer from '../../src/store/gameSlice'
import settingsReducer, { setGameUX } from '../../src/store/settingsSlice'
import socialReducer, {
  setEnergyBankEntry,
  setInfluenceBankEntry,
  setInfoBankEntry,
  updateRelationship,
} from '../../src/social/socialSlice'
import { executeAction, initManeuvers } from '../../src/social/SocialManeuvers'

const basePlayers = [
  { id: 'actor', name: 'Ava', status: 'nominated' },
  { id: 'holder', name: 'Harper', status: 'active' },
  { id: 'nominee-1', name: 'Nico', status: 'nominated' },
  { id: 'nominee-2', name: 'Maya', status: 'nominated' },
]

function makeContextStore({
  trust = 0,
  holderStatus = 'active',
  nomineeIds = ['nominee-1', 'nominee-2'],
  autoNomineeId = null,
  actorIsLoh = false,
}: {
  trust?: number
  holderStatus?: string
  nomineeIds?: string[]
  autoNomineeId?: string | null
  actorIsLoh?: boolean
} = {}) {
  const initialGame = gameReducer(undefined, { type: '@@test/init' })
  const store = configureStore({
    reducer: { game: gameReducer, settings: settingsReducer, social: socialReducer },
    preloadedState: {
      game: {
        ...initialGame,
        players: basePlayers.map((player) => {
          if (player.id === 'actor' && actorIsLoh) return { ...player, status: 'loh' }
          if (player.id !== 'holder') return player
          return {
            ...player,
            status: actorIsLoh ? 'pos' : holderStatus === 'nominated' ? 'nominated+pos' : 'loh+pos',
          }
        }),
        nomineeIds,
        lohId: actorIsLoh ? 'actor' : 'holder',
        posWinnerId: 'holder',
        phase: 'pos_results',
        nominationContext: { autoNomineeId },
      },
    } as never,
  })

  initManeuvers(store)
  store.dispatch(setGameUX({ dramaMode: true }))
  store.dispatch(setEnergyBankEntry({ playerId: 'actor', value: 100 }))
  store.dispatch(setInfluenceBankEntry({ playerId: 'actor', value: 1000 }))
  store.dispatch(setInfoBankEntry({ playerId: 'actor', value: 1000 }))
  if (trust !== 0) {
    store.dispatch(updateRelationship({ source: 'holder', target: 'actor', delta: trust }))
  }
  return store
}

function run(actionId: string, subjectId?: string) {
  return executeAction('actor', 'holder', actionId, {
    outcome: 'success',
    random: () => 0.999,
    ...(subjectId ? { subjectId } : {}),
  })
}

describe('context-aware social conversation summaries', () => {
  it('explains automatic, strategic, distrustful, and neutral nominations differently', () => {
    const scenarios = [
      { autoNomineeId: 'actor', expected: 'entered danger automatically' },
      { trust: 30, expected: 'competition potential' },
      { trust: -1, expected: 'do not trust your position' },
      { expected: 'needed options' },
    ]

    for (const { expected, ...context } of scenarios) {
      const store = makeContextStore(context)
      const result = run('ask_why_nominated')
      expect(result.success).toBe(true)
      expect(result.summary).toContain(expected)
      expect(store.getState().social.sessionLogs).toHaveLength(1)
    }
  })

  it('tailors Safety-plan disclosure to nomination status, trust, and available nominees', () => {
    let store = makeContextStore({ holderStatus: 'nominated' })
    expect(run('ask_safety_plan').summary).toContain('use Safety on themselves')
    expect(store.getState().social.sessionLogs).toHaveLength(1)

    makeContextStore({ trust: 24 })
    expect(run('ask_safety_plan').summary).toContain('stayed vague')

    store = makeContextStore({ trust: 25 })
    store.dispatch(updateRelationship({ source: 'holder', target: 'nominee-1', delta: 20 }))
    store.dispatch(updateRelationship({ source: 'holder', target: 'nominee-2', delta: 10 }))
    expect(run('ask_safety_plan').summary).toContain('using Safety on Nico')

    makeContextStore({ trust: 25, nomineeIds: [] })
    expect(run('ask_safety_plan').summary).toContain('leaving the nominations unchanged')
  })

  it('distinguishes trusted and guarded Safety requests at the rule boundary', () => {
    makeContextStore({ trust: 20, actorIsLoh: true })
    expect(run('ask_use_safety', 'nominee-1').summary).toContain(
      'seriously consider using Safety on Nico'
    )
    expect(run('ask_hold_safety').summary).toContain("acknowledged the LOH's request")

    makeContextStore({ trust: 19, actorIsLoh: true })
    expect(run('ask_use_safety', 'nominee-1').summary).toContain('refused to reveal the decision')
    expect(run('ask_hold_safety').summary).toContain('belongs to them alone')
  })
})
