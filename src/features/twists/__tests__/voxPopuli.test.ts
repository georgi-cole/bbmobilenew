import { describe, expect, it } from 'vitest'
import type { PlayerPublicProfile } from '../../../publicOpinion/types'
import gameReducer, {
  advance,
  applyMinigameWinner,
  applyF3MinigameWinner,
  completeVoxSeasonRecap,
  completeVoxFinalistShowcase,
  commitNominees,
  commitVoxAudienceVote,
  createInitialGameState,
  finalizePendingEviction,
  prepareVoxFinalThreeTest,
  resolveVoxSeasonWinner,
  startVoxFinalVote,
  submitPovDecision,
} from '../../../store/gameSlice'
import {
  createInitialVoxPopuliState,
  resolveVoxAudienceEviction,
  reconcileVoxAudienceResultWithPreview,
  resolveVoxAudiencePreview,
  resolveVoxNominations,
  resolveVoxReplacementNominees,
  shouldScheduleVoxPopuliSeason,
} from '../voxPopuli'

describe('Vox Populi rules', () => {
  it('adds the automatic nominee without consuming either secret-ballot place', () => {
    const result = resolveVoxNominations({
      activeIds: ['a', 'b', 'c', 'd', 'e'],
      immunityWinnerId: 'a',
      autoNomineeId: 'b',
      ballots: {
        a: ['c', 'd'],
        b: ['c', 'd'],
        c: ['d', 'e'],
        d: ['c', 'e'],
        e: ['c', 'd'],
      },
      ballotNomineeCount: 2,
      seed: 101,
    })

    expect(new Set(result.nomineeIds)).toEqual(new Set(['b', 'c', 'd']))
    expect(result.nomineeIds).toHaveLength(3)
  })

  it('includes everyone tied at the ballot cutoff', () => {
    const result = resolveVoxNominations({
      activeIds: ['a', 'b', 'c', 'd', 'e', 'f'],
      immunityWinnerId: 'a',
      autoNomineeId: 'b',
      ballots: {
        a: ['c', 'd'],
        b: ['c', 'e'],
        c: ['d', 'e'],
        d: ['c', 'e'],
        e: ['c', 'd'],
        f: ['d', 'e'],
      },
      ballotNomineeCount: 2,
      seed: 202,
    })

    expect(new Set(result.nomineeIds)).toEqual(new Set(['b', 'c', 'd', 'e']))
    expect(result.cutoffVotes).toBe(4)
  })

  it('uses the next original vote-getter only when fewer than two nominees remain', () => {
    const base = {
      activeIds: ['a', 'b', 'c', 'd', 'e'],
      protectedIds: ['c'],
      immunityWinnerId: 'a',
      nominationVoteCounts: { a: 0, b: 0, c: 5, d: 4, e: 3 },
      seed: 303,
    }

    expect(
      resolveVoxReplacementNominees({
        ...base,
        currentNomineeIds: ['b', 'd'],
      })
    ).toEqual([])
    expect(
      resolveVoxReplacementNominees({
        ...base,
        currentNomineeIds: ['b'],
      })
    ).toEqual(['d'])
  })

  it('adds every housemate tied at the qualifying backup rank', () => {
    expect(
      resolveVoxReplacementNominees({
        activeIds: ['immune', 'saved', 'still-up', 'backup-a', 'backup-b', 'other'],
        currentNomineeIds: ['still-up'],
        protectedIds: ['saved'],
        immunityWinnerId: 'immune',
        nominationVoteCounts: {
          immune: 0,
          saved: 7,
          'still-up': 6,
          'backup-a': 4,
          'backup-b': 4,
          other: 2,
        },
        seed: 304,
      })
    ).toEqual(['backup-a', 'backup-b'])
  })

  it('does not invent a replacement when Safety leaves three nominees on the block', () => {
    let state = createInitialGameState({ seed: 305 })
    const [saved, nomineeB, nomineeC, nomineeD, immunityWinner] = state.players.slice(1)
    state.voxPopuli = {
      ...createInitialVoxPopuliState(state.season),
      status: 'active',
      activatedSeason: state.season,
      immunityWinnerId: immunityWinner.id,
      nominationVoteCounts: {
        [saved.id]: 8,
        [nomineeB.id]: 7,
        [nomineeC.id]: 6,
        [nomineeD.id]: 5,
      },
    }
    state.lohId = immunityWinner.id
    state.nomineeIds = [saved.id, nomineeB.id, nomineeC.id, nomineeD.id]
    state.posWinnerId = saved.id
    saved.status = 'nominated+pos'
    state.phase = 'pos_ceremony'

    state = gameReducer(state, advance())

    expect(new Set(state.nomineeIds)).toEqual(new Set([nomineeB.id, nomineeC.id, nomineeD.id]))
    expect(state.voxPopuli?.lastReplacementNomineeIds).toEqual([])
    expect(state.tvFeed.some((event) => event.major === 'vox_populi_replacement')).toBe(false)
    expect(state.tvFeed[0]?.text).toContain('saved')
    expect(state.tvFeed[0]?.text).toContain('face the audience')
    expect(state.tvFeed[0]?.text).not.toContain('secret-ballot ranking')
  })

  it('restores a Double Elimination block to at least three, including backup ties', () => {
    let state = createInitialGameState({ seed: 306 })
    const [saved, nomineeB, nomineeC, backupA, backupB, immunityWinner] = state.players.slice(1)
    state.voxPopuli = {
      ...createInitialVoxPopuliState(state.season),
      status: 'active',
      activatedSeason: state.season,
      immunityWinnerId: immunityWinner.id,
      nominationVoteCounts: {
        [saved.id]: 8,
        [nomineeB.id]: 7,
        [nomineeC.id]: 6,
        [backupA.id]: 4,
        [backupB.id]: 4,
      },
    }
    state.doubleEviction = { usedCount: 1, weekActive: true, pendingSecondEviction: null }
    state.lohId = immunityWinner.id
    state.nomineeIds = [saved.id, nomineeB.id, nomineeC.id]
    state.posWinnerId = saved.id
    saved.status = 'nominated+pos'
    state.phase = 'pos_ceremony'

    state = gameReducer(state, advance())

    expect(new Set(state.nomineeIds)).toEqual(
      new Set([nomineeB.id, nomineeC.id, backupA.id, backupB.id])
    )
    expect(new Set(state.voxPopuli?.lastReplacementNomineeIds)).toEqual(
      new Set([backupA.id, backupB.id])
    )
  })

  it('makes lower approval produce a larger vote-to-eliminate share', () => {
    const profile = (
      playerId: string,
      approval: number,
      previousApproval = approval
    ): PlayerPublicProfile => ({
      playerId,
      approval,
      previousApproval,
      seasonApprovals: [approval],
      completedDirectionCount: 0,
      cumulativePositiveDelta: 0,
    })
    const result = resolveVoxAudienceEviction({
      nomineeIds: ['popular', 'unpopular'],
      profiles: {
        popular: profile('popular', 80),
        unpopular: profile('unpopular', 20, 30),
      },
      seed: 404,
      week: 6,
    })

    expect(result.percentages.unpopular).toBeGreaterThan(result.percentages.popular)
    expect(Object.values(result.percentages).reduce((sum, value) => sum + value, 0)).toBe(100)
    expect(result.rankedIds[0]).toBe('unpopular')
  })

  it('lets later public history amplify real differences without forcing a landslide', () => {
    const profile = (playerId: string, approvals: number[]): PlayerPublicProfile => ({
      playerId,
      approval: approvals.at(-1) ?? 50,
      previousApproval: approvals.at(-2) ?? approvals.at(-1) ?? 50,
      seasonApprovals: approvals,
      completedDirectionCount: 0,
      cumulativePositiveDelta: 0,
    })
    const close = resolveVoxAudienceEviction({
      nomineeIds: ['a', 'b'],
      profiles: {
        a: profile('a', [61, 62, 61, 63, 62, 63, 62]),
        b: profile('b', [60, 61, 60, 62, 61, 61, 60]),
      },
      seed: 405,
      week: 7,
    })
    const separated = resolveVoxAudienceEviction({
      nomineeIds: ['a', 'b'],
      profiles: {
        a: profile('a', [70, 72, 74, 75, 77, 78, 80]),
        b: profile('b', [50, 48, 46, 44, 42, 40, 38]),
      },
      seed: 405,
      week: 7,
    })

    expect(Math.abs(close.percentages.a - close.percentages.b)).toBeLessThan(15)
    expect(Math.abs(separated.percentages.a - separated.percentages.b)).toBeGreaterThan(35)
  })

  it('keeps a temporary audience snapshot related to the final count without making it predictive', () => {
    const preview = resolveVoxAudiencePreview({
      finalPercentages: { a: 51, b: 49 },
      nomineeIds: ['a', 'b'],
      seed: 991,
      week: 7,
    })
    expect(preview.a + preview.b).toBe(100)

    const reconciled = reconcileVoxAudienceResultWithPreview({
      finalPercentages: { a: 30, b: 70 },
      previewPercentages: { a: 80, b: 20 },
      nomineeIds: ['a', 'b'],
    })
    expect(reconciled.percentages.a).toBe(48)
    expect(reconciled.percentages.b).toBe(52)
  })

  it('uses the Final 4 competition for a last-place nominee without awarding immunity', () => {
    let state = createInitialGameState({ seed: 406 })
    const finalists = state.players.slice(0, 4)
    state.players.forEach((player) => {
      player.status = finalists.includes(player) ? 'active' : 'evicted'
    })
    state.voxPopuli = {
      ...createInitialVoxPopuliState(state.season),
      status: 'active',
      activatedSeason: state.season,
    }
    state.phase = 'loh_comp'

    state = gameReducer(
      state,
      applyMinigameWinner({
        winnerId: finalists[0].id,
        participants: finalists.map((player) => player.id),
        scores: {
          [finalists[0].id]: 100,
          [finalists[1].id]: 80,
          [finalists[2].id]: 60,
          [finalists[3].id]: 20,
        },
        lastPlaceId: finalists[3].id,
        lastPlaceType: 'scored',
      })
    )

    expect(state.voxPopuli?.immunityWinnerId).toBeNull()
    expect(state.players.find((player) => player.id === finalists[0].id)?.status).toBe('active')
    expect(state.voxPopuli?.autoNomineeId).toBe(finalists[3].id)
    expect(state.lastHohCompFinisherId).toBe(finalists[3].id)
    expect(
      state.tvFeed.some((event) => event.text.includes('there is no immunity'))
    ).toBe(true)
    expect(
      state.tvFeed.some((event) => event.text.includes('is now on the block'))
    ).toBe(true)
    const resultBroadcast = state.tvFeed.find((event) =>
      event.text.includes('wins the Final 4 competition')
    )
    expect(resultBroadcast?.meta?.announcementTitle).toContain(finalists[0].name)
    expect(resultBroadcast?.meta?.announcementSubtitle).toContain('no immunity')
  })

  it('is scheduled for its default season but remains exclusive with Cupid', () => {
    expect(
      shouldScheduleVoxPopuliSeason({
        season: 4,
        seasonArchives: [],
        seed: 1,
      })
    ).toBe(true)
    expect(
      shouldScheduleVoxPopuliSeason({
        season: 4,
        seasonArchives: [],
        seed: 1,
        cupidScheduled: true,
      })
    ).toBe(false)
  })

  it('runs the human secret ballot without assigning nomination power to immunity', () => {
    let state = createInitialGameState({ seed: 505 })
    const human = state.players.find((player) => player.isUser)!
    const others = state.players.filter((player) => !player.isUser)
    const immunityWinner = others[0]
    const automaticNominee = others[1]
    state.voxPopuli = {
      ...createInitialVoxPopuliState(state.season),
      status: 'active',
      activatedSeason: state.season,
      immunityWinnerId: immunityWinner.id,
      autoNomineeId: automaticNominee.id,
    }
    state.lohId = immunityWinner.id
    state.lastHohCompFinisherId = automaticNominee.id
    state.phase = 'nominations'

    state = gameReducer(state, advance())
    expect(state.phase).toBe('nomination_results')
    expect(state.awaitingNominations).toBe(true)

    const choices = state.players
      .filter(
        (player) =>
          player.id !== human.id &&
          player.id !== immunityWinner.id &&
          player.id !== automaticNominee.id
      )
      .slice(0, 2)
      .map((player) => player.id)
    state = gameReducer(state, commitNominees(choices))

    expect(state.awaitingNominations).toBe(false)
    expect(state.nomineeIds).toContain(automaticNominee.id)
    expect(state.nomineeIds).not.toContain(immunityWinner.id)
    expect(state.nomineeIds.length).toBeGreaterThanOrEqual(3)
    expect(state.currentWeekNominationRecord).toBeNull()
    const resultBroadcast = state.tvFeed.find(
      (event) => event.meta?.major === 'vox_populi_nomination_result'
    )
    expect(resultBroadcast?.text).not.toContain('automatically nominated')
    expect(resultBroadcast?.text).toContain(`join ${automaticNominee.name} on the block`)
    expect(resultBroadcast?.meta?.broadcastPriority).toBe('critical')
  })

  it('protects the Safety stand-pat decision from later social messages', () => {
    let state = createInitialGameState({ seed: 515 })
    const holder = state.players[0]
    const nominees = state.players.slice(1, 4)
    state.voxPopuli = {
      ...createInitialVoxPopuliState(state.season),
      status: 'active',
      activatedSeason: state.season,
    }
    state.posWinnerId = holder.id
    state.nomineeIds = nominees.map((player) => player.id)
    state.awaitingPovDecision = true

    state = gameReducer(state, submitPovDecision(false))

    const safetyBroadcast = state.tvFeed.find(
      (event) => event.meta?.major === 'vox_populi_safety_outcome'
    )
    expect(safetyBroadcast?.text).toContain('chosen not to use the Power of Safety')
    expect(safetyBroadcast?.meta?.broadcastPriority).toBe('critical')
  })

  it('opens an audience vote with no house ballot and queues the highest share to leave', () => {
    let state = createInitialGameState({ seed: 606 })
    const nominees = state.players.slice(0, 3)
    state.voxPopuli = {
      ...createInitialVoxPopuliState(state.season),
      status: 'active',
      activatedSeason: state.season,
    }
    state.nomineeIds = nominees.map((player) => player.id)
    state.phase = 'social_2'

    state = gameReducer(state, advance())
    expect(state.phase).toBe('live_vote')
    expect(state.voxPopuli?.awaitingPublicVote).toBe(true)
    expect(state.awaitingHumanVote).toBe(false)
    expect(state.votes).toEqual({})

    state = gameReducer(
      state,
      commitVoxAudienceVote({
        context: 'eviction',
        percentages: {
          [nominees[0].id]: 51.2,
          [nominees[1].id]: 30.3,
          [nominees[2].id]: 18.5,
        },
        rankedIds: nominees.map((player) => player.id),
      })
    )

    expect(state.voteResultsMode).toBe('public')
    expect(state.pendingEviction?.evicteeId).toBe(nominees[0].id)
    expect(state.pendingExitContext?.leaderIds).toEqual([])
    expect(state.pendingExitContext?.votesByVoterId).toEqual({})
  })

  it('never schedules two Double Elimination exits from only two nominees', () => {
    let state = createInitialGameState({ seed: 607 })
    const nominees = state.players.slice(0, 2)
    state.voxPopuli = {
      ...createInitialVoxPopuliState(state.season),
      status: 'active',
      activatedSeason: state.season,
    }
    state.doubleEviction = { usedCount: 1, weekActive: true, pendingSecondEviction: null }
    state.nomineeIds = nominees.map((player) => player.id)
    state.phase = 'live_vote'
    state.voxPopuli.awaitingPublicVote = true
    state.voxPopuli.publicVoteContext = 'eviction'

    state = gameReducer(
      state,
      commitVoxAudienceVote({
        context: 'eviction',
        percentages: {
          [nominees[0].id]: 60,
          [nominees[1].id]: 40,
        },
        rankedIds: nominees.map((player) => player.id),
      })
    )

    expect(state.pendingEviction?.evicteeId).toBe(nominees[0].id)
    expect(state.doubleEviction?.pendingSecondEviction).toBeNull()
  })

  it('makes the Final 3 challenge winner immune while the audience decides third place', () => {
    let state = createInitialGameState({ seed: 707 })
    const finalists = state.players.slice(0, 3)
    state.players.forEach((player) => {
      player.status = finalists.includes(player) ? 'active' : 'evicted'
    })
    state.voxPopuli = {
      ...createInitialVoxPopuliState(state.season),
      status: 'active',
      activatedSeason: state.season,
    }
    state.phase = 'final3_comp3_minigame'
    state.f3Part1WinnerId = finalists[0].id
    state.f3Part2WinnerId = finalists[1].id

    state = gameReducer(state, applyF3MinigameWinner(finalists[0].id))

    expect(state.phase).toBe('final3_decision')
    expect(state.voxPopuli?.immunityWinnerId).toBe(finalists[0].id)
    expect(state.voxPopuli?.publicVoteContext).toBeNull()
    expect(state.voxPopuli?.awaitingPublicVote).toBe(false)
    expect(state.awaitingFinal3Eviction).toBe(false)
    expect(state.awaitingFinal3Plea).toBe(false)
    expect(new Set(state.nomineeIds)).toEqual(new Set([finalists[1].id, finalists[2].id]))

    state = gameReducer(state, advance())
    expect(state.voxPopuli?.awaitingPublicVote).toBe(true)
    expect(state.voxPopuli?.publicVoteContext).toBe('final3')
    expect(state.tvFeed[0]?.meta?.finalThreePacingKey).toBe('public_decision')
  })

  it('clears classic Final 3 ceremony flags when the Vox public verdict locks', () => {
    let state = createInitialGameState({ seed: 7071 })
    const finalists = state.players.slice(0, 3)
    state.players.forEach((player) => {
      player.status = finalists.includes(player) ? 'active' : 'evicted'
    })
    state.voxPopuli = {
      ...createInitialVoxPopuliState(state.season),
      status: 'active',
      activatedSeason: state.season,
      awaitingPublicVote: true,
      publicVoteContext: 'final3',
    }
    state.phase = 'final3_decision'
    state.lohId = finalists[0].id
    state.nomineeIds = [finalists[1].id, finalists[2].id]
    // Simulates an old/stale classic flag surviving into the Vox branch.
    state.awaitingFinal3Plea = true
    state.awaitingFinal3Eviction = true

    state = gameReducer(
      state,
      commitVoxAudienceVote({
        context: 'final3',
        percentages: { [finalists[1].id]: 58, [finalists[2].id]: 42 },
        rankedIds: [finalists[1].id, finalists[2].id],
      })
    )

    expect(state.awaitingFinal3Plea).toBe(false)
    expect(state.awaitingFinal3Eviction).toBe(false)
    expect(state.pendingEviction?.evicteeId).toBe(finalists[1].id)
  })

  it('moves from the Final 3 public verdict into the Final 2 without reopening the vote', () => {
    let state = createInitialGameState({ seed: 7072 })
    const finalists = state.players.slice(0, 3)
    state.players.forEach((player) => {
      player.status = finalists.includes(player) ? 'active' : 'evicted'
    })
    state.voxPopuli = {
      ...createInitialVoxPopuliState(state.season),
      status: 'active',
      activatedSeason: state.season,
      awaitingPublicVote: true,
      publicVoteContext: 'final3',
    }
    state.phase = 'final3_decision'
    state.lohId = finalists[0].id
    state.nomineeIds = [finalists[1].id, finalists[2].id]

    state = gameReducer(
      state,
      commitVoxAudienceVote({
        context: 'final3',
        percentages: { [finalists[1].id]: 58, [finalists[2].id]: 42 },
        rankedIds: [finalists[1].id, finalists[2].id],
      })
    )
    state = gameReducer(state, finalizePendingEviction(finalists[1].id))
    state = gameReducer(state, advance())

    expect(state.phase).toBe('week_end')
    expect(state.voxPopuli?.publicVoteContext).toBeNull()
    expect(state.voxPopuli?.awaitingPublicVote).toBe(false)
    expect(state.voxPopuli?.finalistIds).toEqual([finalists[0].id, finalists[2].id])
  })

  it('announces the winner before building the complete season recap', () => {
    let state = createInitialGameState({ seed: 708 })
    const finalists = state.players.slice(0, 2)
    state.players.forEach((player) => {
      player.status = finalists.includes(player) ? 'active' : 'evicted'
    })
    state.voxPopuli = {
      ...createInitialVoxPopuliState(state.season),
      status: 'active',
      activatedSeason: state.season,
    }
    state.phase = 'week_end'

    state = gameReducer(state, advance())
    expect(state.voxPopuli?.finaleStage).toBe('showcase')

    state = gameReducer(state, completeVoxFinalistShowcase())
    expect(state.voxPopuli?.finaleStage).toBe('ready')

    state = gameReducer(state, startVoxFinalVote())
    expect(state.voxPopuli?.finaleStage).toBe('final_vote')

    state = gameReducer(state, resolveVoxSeasonWinner(finalists[0].id))
    expect(state.voxPopuli?.winnerId).toBe(finalists[0].id)
    expect(state.voxPopuli?.finaleStage).toBe('recap')
    expect(state.players.find((player) => player.id === finalists[0].id)?.isWinner).toBe(true)
    expect(state.seasonFinale).toBeNull()

    state = gameReducer(state, completeVoxSeasonRecap())
    expect(state.voxPopuli?.finaleStage).toBeNull()
    expect(state.seasonFinale?.phase).toBe('winnerInterview')
    expect(state.seasonFinale?.isChatOpen).toBe(true)
  })

  it('creates a clean Final Three ceremony without Final Four roles or stale broadcasts', () => {
    let state = createInitialGameState({ seed: 709 })
    state.voxPopuli = {
      ...createInitialVoxPopuliState(state.season),
      status: 'active',
      activatedSeason: state.season,
    }
    state.lohId = state.players[3].id
    state.posWinnerId = state.players[4].id
    state.nomineeIds = [state.players[1].id, state.players[2].id]
    state.players[1].status = 'nominated'
    state.players[2].status = 'nominated'
    state.players[3].status = 'loh'
    state.players[4].status = 'pos'

    state = gameReducer(state, prepareVoxFinalThreeTest())

    const alive = state.players.filter((player) => player.status !== 'evicted' && player.status !== 'jury')
    expect(alive).toHaveLength(3)
    expect(state.phase).toBe('final3')
    expect(state.lohId).toBeNull()
    expect(state.posWinnerId).toBeNull()
    expect(state.nomineeIds).toEqual([])
    expect(state.voteResults).toBeNull()
    expect(state.tvFeed).toHaveLength(1)
    expect(state.tvFeed[0].meta?.major).toBe('vox_final3')
  })
})
