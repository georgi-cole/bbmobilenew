import { configureStore } from '@reduxjs/toolkit'
import { describe, expect, it } from 'vitest'
import gameReducer, {
  activateCupidArrowNow,
  advance,
  applyMinigameWinner,
  commitNominees,
  finalizePendingEviction,
  forceHoH,
  forceNominees,
  forcePhase,
  forcePovWinner,
  selfEvict,
  submitHumanVote,
  submitTieBreak,
  triggerSecretMission,
} from '../src/store/gameSlice'
import type { GameState, Player } from '../src/types'
import {
  shouldScheduleCupidArrowSeason,
  CUPID_ARROW_RETRY_CHANCE,
} from '../src/features/twists/cupidArrow'

function makePlayers(): Player[] {
  return Array.from({ length: 16 }, (_, index) => ({
    id: index === 0 ? 'user' : `p${index}`,
    name: index === 0 ? 'You' : `Player ${index}`,
    avatar: '🧑',
    status: 'active',
    isUser: index === 0,
    sex: index % 2 === 0 ? 'Male' : 'Female',
  }))
}

function makeStore() {
  const base = gameReducer(undefined, { type: '@@INIT' })
  const game: GameState = {
    ...base,
    season: 3,
    week: 1,
    phase: 'week_start',
    players: makePlayers(),
    cupidArrow: {
      scheduledSeason: 3,
      status: 'scheduled',
      activatedSeason: null,
      activatedWeek: null,
      pairs: [],
      eliminatedPairCount: 0,
      pendingPartnerEvictionId: null,
    },
  }
  return configureStore({ reducer: { game: gameReducer }, preloadedState: { game } })
}

describe("Cupid's Arrow season shock", () => {
  it('debuts in Season 3, observes a one-season cooldown, and honours Valentine\'s Day', () => {
    const seasonThree = shouldScheduleCupidArrowSeason({
      season: 3,
      seasonArchives: [],
      seed: 1,
      now: new Date(2026, 0, 12),
    })
    const cooldownSeason = shouldScheduleCupidArrowSeason({
      season: 4,
      seasonArchives: [{ seasonIndex: 3, seasonId: 'season-3', playerSummaries: [], cupidArrowActivated: true }],
      seed: 1,
      now: new Date(2026, 0, 12),
    })
    const valentinesOverride = shouldScheduleCupidArrowSeason({
      season: 4,
      seasonArchives: [{ seasonIndex: 3, seasonId: 'season-3', playerSummaries: [], cupidArrowActivated: true }],
      seed: 1,
      now: new Date(2026, 1, 14),
    })

    expect(seasonThree).toBe(true)
    expect(cooldownSeason).toBe(false)
    expect(valentinesOverride).toBe(true)
    expect(CUPID_ARROW_RETRY_CHANCE).toBe(0.1)
  })

  it('uses a stable 10% draw for eligible later seasons', () => {
    const options = {
      season: 5,
      seasonArchives: [{ seasonIndex: 4, seasonId: 'season-4', playerSummaries: [] }],
      seed: 987654321,
      now: new Date(2026, 0, 12),
    }

    expect(shouldScheduleCupidArrowSeason(options)).toBe(
      shouldScheduleCupidArrowSeason(options)
    )
  })

  it('activates at the season-opening LOH announcement before the competition begins', () => {
    const store = makeStore()
    store.dispatch(advance())

    const state = store.getState().game
    expect(state.phase).toBe('loh_comp_announcement')
    expect(state.cupidArrow?.status).toBe('active')
    expect(state.tvFeed[0].meta?.major).toBe('cupid_arrow')
  })

  it('creates eight mixed-gender pairs and shares LOH and Safety roles', () => {
    const store = makeStore()
    store.dispatch(activateCupidArrowNow())

    const active = store.getState().game.cupidArrow
    expect(active?.status).toBe('active')
    expect(active?.pairs).toHaveLength(8)
    expect(active?.pairs.every((pair) => pair.memberIds.length === 2)).toBe(true)

    const firstPair = active!.pairs[0]
    const [winnerId, partnerId] = firstPair.memberIds
    const players = store.getState().game.players
    const winner = players.find((player) => player.id === winnerId)!
    const partner = players.find((player) => player.id === partnerId)!
    expect(winner.sex).not.toBe(partner.sex)

    store.dispatch(forceHoH(winnerId))
    let state = store.getState().game
    expect(state.players.find((player) => player.id === winnerId)?.status).toContain('loh')
    expect(state.players.find((player) => player.id === partnerId)?.status).toContain('loh')

    store.dispatch(forcePovWinner(winnerId))
    state = store.getState().game
    expect(state.players.find((player) => player.id === partnerId)?.status).toContain('pos')
    expect(state.povProtectedIds).toContain(partnerId)
  })

  it('expands two human nomination choices to both full pairs', () => {
    const store = makeStore()
    store.dispatch(activateCupidArrowNow())
    const pairs = store.getState().game.cupidArrow!.pairs
    const humanPair = pairs.find((pair) => pair.memberIds.includes('user'))!
    store.dispatch(forceHoH('user'))
    store.dispatch(forcePhase('nominations'))
    store.dispatch(advance())
    expect(store.getState().game.awaitingNominations).toBe(true)

    const targetPairs = pairs.filter((pair) => pair.id !== humanPair.id).slice(0, 2)
    store.dispatch(commitNominees(targetPairs.map((pair) => pair.memberIds[0])))

    const nominees = store.getState().game.nomineeIds
    expect(nominees).toHaveLength(4)
    targetPairs
      .flatMap((pair) => pair.memberIds)
      .forEach((id) => {
        expect(nominees).toContain(id)
      })
  })

  it("never treats the LOH winner's partner as the public auto-nominee", () => {
    const store = makeStore()
    store.dispatch(activateCupidArrowNow())
    const [winnerId, partnerId] = store.getState().game.cupidArrow!.pairs[0].memberIds
    const participants = store.getState().game.players.map((player) => player.id)
    store.dispatch(forcePhase('loh_comp'))
    store.dispatch(
      applyMinigameWinner({
        winnerId,
        participants,
        lastPlaceId: partnerId,
      })
    )

    const state = store.getState().game
    expect(state.lastHohCompFinisherId).not.toBe(winnerId)
    expect(state.lastHohCompFinisherId).not.toBe(partnerId)
  })

  it('applies a voluntary exit to both halves of the active pair', () => {
    const store = makeStore()
    store.dispatch(activateCupidArrowNow())
    const pair = store
      .getState()
      .game.cupidArrow!.pairs.find((candidate) => candidate.memberIds.includes('user'))!

    store.dispatch(selfEvict('user'))

    const state = store.getState().game
    pair.memberIds.forEach((id) => {
      expect(state.players.find((player) => player.id === id)?.status).toBe('evicted')
    })
    expect(state.cupidArrow?.eliminatedPairCount).toBe(1)
  })

  it('casts one joint pair choice as two eviction votes', () => {
    const store = makeStore()
    store.dispatch(activateCupidArrowNow())
    const pairs = store.getState().game.cupidArrow!.pairs
    const humanPair = pairs.find((pair) => pair.memberIds.includes('user'))!
    const lohPair = pairs.find((pair) => pair.id !== humanPair.id)!
    const nomineePairs = pairs
      .filter((pair) => pair.id !== humanPair.id && pair.id !== lohPair.id)
      .slice(0, 2)

    store.dispatch(forceHoH(lohPair.memberIds[0]))
    store.dispatch(forceNominees(nomineePairs.map((pair) => pair.memberIds[0])))
    store.dispatch(forcePhase('social_2'))
    store.dispatch(advance())
    store.dispatch(advance())

    let state = store.getState().game
    expect(state.awaitingHumanVote).toBe(true)
    const targetId = nomineePairs[0].memberIds[0]
    store.dispatch(submitHumanVote(targetId))
    state = store.getState().game

    expect(state.votes[humanPair.memberIds[0]]).toBe(targetId)
    expect(state.votes[humanPair.memberIds[1]]).toBe(targetId)
    pairs
      .filter(
        (pair) =>
          pair.id !== lohPair.id &&
          !nomineePairs.some((nomineePair) => nomineePair.id === pair.id)
      )
      .forEach((pair) => {
        expect(state.votes[pair.memberIds[0]]).toBe(state.votes[pair.memberIds[1]])
      })
  })

  it('postpones Secret Missions while the spell is active', () => {
    const store = makeStore()
    store.dispatch(activateCupidArrowNow())
    store.dispatch(triggerSecretMission(3))

    expect(store.getState().game.secretMission).toBeUndefined()
  })

  it('eliminates partners together and breaks the spell after four pairs', () => {
    const store = makeStore()
    store.dispatch(activateCupidArrowNow())
    const protectedPair = store
      .getState()
      .game.cupidArrow!.pairs.find((pair) => pair.memberIds.includes('user'))!
    store.dispatch(forceHoH('user'))

    for (let cycle = 0; cycle < 4; cycle += 1) {
      const stateBefore = store.getState().game
      const availablePairs = stateBefore.cupidArrow!.pairs.filter(
        (pair) =>
          pair.id !== protectedPair.id &&
          pair.memberIds.every((id) => {
            const status = stateBefore.players.find((player) => player.id === id)?.status
            return status !== 'evicted' && status !== 'jury'
          })
      )
      store.dispatch(forceNominees(availablePairs.slice(0, 2).map((pair) => pair.memberIds[0])))
      store.dispatch(forcePhase('social_2'))
      store.dispatch(advance())
      store.dispatch(advance())

      let state = store.getState().game
      if (state.awaitingTieBreak) {
        store.dispatch(submitTieBreak(state.tiedNomineeIds![0]))
        state = store.getState().game
      }
      const firstId = state.pendingEviction?.evicteeId
      expect(firstId).toBeTruthy()
      store.dispatch(finalizePendingEviction(firstId!))

      const partnerId = store.getState().game.pendingEviction?.evicteeId
      expect(partnerId).toBeTruthy()
      store.dispatch(finalizePendingEviction(partnerId!))
    }

    const finalState = store.getState().game
    expect(finalState.cupidArrow?.eliminatedPairCount).toBe(4)
    expect(finalState.cupidArrow?.status).toBe('broken')
    expect(
      finalState.players.filter((player) => player.status !== 'evicted' && player.status !== 'jury')
    ).toHaveLength(8)

    store.dispatch(triggerSecretMission(5))
    expect(store.getState().game.secretMission?.status).toBe('available')
  })
})
