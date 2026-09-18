import { describe, expect, it } from 'vitest'
import type { GameState, Player } from '../../types'
import gameReducer, {
  activateBattleBack,
  activateDayStartShock,
  activateDoubleEviction,
  advance,
  commitNominees,
  completeBattleBack,
  confirmDayStartShock,
  createInitialGameState,
  finalizePendingEviction,
  getNominationTargetScore,
  queueForcedShock,
  submitCoupReplacement,
  submitDiamondReplacement,
  submitPosTieBreak,
  submitVipSecondSaveTarget,
} from '../gameSlice'
import { withLohNominationPlanning } from '../lohNominationPlanning'
import { withImmediateVoxPublicMode } from '../voxPublicModeReducer'
import { createInitialVoxPopuliState } from '../../features/twists/voxPopuli'
import {
  FORCED_SHOCK_CRITICAL_RULES,
  FORMAT_CRITICAL_RULES,
  canCastClassicEvictionVote,
  getCanonicalVoterId,
  getClassicEvictionTieBreakerId,
} from '../criticalGameRules'

const criticalGameReducer = withImmediateVoxPublicMode(
  withLohNominationPlanning(gameReducer, getNominationTargetScore)
)

function alive(state: GameState): Player[] {
  return state.players.filter((player) => player.status !== 'evicted' && player.status !== 'jury')
}

function cleanState(seed: number): GameState {
  const state = createInitialGameState({ seed })
  state.players.forEach((player) => {
    player.status = 'active'
  })
  state.week = 5
  state.publicModeEnabled = false
  state.pendingPublicModeEnabled = null
  state.nomineeIds = []
  state.lohId = null
  state.coLohIds = null
  state.posWinnerId = null
  state.votes = {}
  state.voteResults = null
  state.awaitingHumanVote = false
  state.awaitingTieBreak = false
  state.tiedNomineeIds = null
  state.pendingEviction = null
  state.pendingExitContext = null
  state.lohNominationPlan = null
  state.currentWeekNominationRecord = null
  state.nominationContext = null
  state.awaitingNominations = false
  state.awaitingCoLohNomination = false
  state.awaitingPosTieBreak = false
  state.povSavedId = null
  state.povProtectedIds = []
  state.replacementNomineeIds = []
  state.twistActive = false
  state.twistActivatedThisWeek = false
  state.dayStartShock = null
  state.depressionShock = undefined
  state.cupidArrow = {
    scheduledSeason: null,
    status: 'inactive',
    activatedSeason: null,
    activatedWeek: null,
    pairs: [],
    eliminatedPairCount: 0,
    pendingPartnerEvictionId: null,
    visualsRevealed: false,
  }
  state.voxPopuli = undefined
  if (state.doubleEviction) {
    state.doubleEviction.weekActive = false
    state.doubleEviction.pendingSecondEviction = null
  }
  if (state.specialVeto) {
    state.specialVeto.activeType = null
    state.specialVeto.activatedWeek = null
    state.specialVeto.awaitingHolderReplacement = false
    state.specialVeto.awaitingCoupReplacement1 = false
    state.specialVeto.awaitingCoupReplacement2 = false
    state.specialVeto.coupReplacement1Id = null
    state.specialVeto.awaitingVipSecondUseDecision = false
    state.specialVeto.awaitingVipSecondSaveTarget = false
  }
  return state
}

function assertStoredVotesAreEligible(state: GameState): void {
  for (const voteKey of Object.keys(state.votes ?? {})) {
    expect(canCastClassicEvictionVote(state, getCanonicalVoterId(voteKey))).toBe(true)
  }
}

describe('critical shock / ruleset matrix', () => {
  it('forces every current shock to declare its critical engine impact and behavioral coverage', () => {
    // Add a key here only after adding/updating a behavioral scenario for that
    // shock in this file. Combined with the exhaustive production registry,
    // a new ForcedShockType cannot silently bypass critical-engine review.
    const behaviorallyCoveredForcedShocks = [
      'battleBack',
      'coup',
      'dayStartShock',
      'democracia',
      'depressionShock',
      'diamond',
      'doubleEviction',
      'spotlight',
      'twinShock',
      'vip',
    ]
    expect(Object.keys(FORCED_SHOCK_CRITICAL_RULES).sort()).toEqual(
      behaviorallyCoveredForcedShocks.sort()
    )
    expect(Object.keys(FORMAT_CRITICAL_RULES).sort()).toEqual(
      ['cupidArrow', 'publicMode', 'voxPopuli'].sort()
    )
    Object.values(FORCED_SHOCK_CRITICAL_RULES).forEach((declaration) => {
      expect(declaration.rationale.length).toBeGreaterThan(20)
    })
    expect(
      Object.entries(FORCED_SHOCK_CRITICAL_RULES)
        .filter(([, declaration]) => declaration.voxCompatible)
        .map(([type]) => type)
        .sort()
    ).toEqual(['dayStartShock', 'depressionShock', 'doubleEviction', 'twinShock'].sort())
  })

  it('keeps the debug shock queue aligned with Vox-compatible production rules', () => {
    const base = cleanState(504)
    base.expansionMode = 'voxPopuli'
    base.voxPopuli = {
      ...createInitialVoxPopuliState(base.season),
      status: 'active',
      activatedSeason: base.season,
      activatedWeek: 1,
    }

    const depressionQueued = criticalGameReducer(base, queueForcedShock('depressionShock'))
    expect(depressionQueued.pendingForcedShock?.type).toBe('depressionShock')

    const reset = {
      ...depressionQueued,
      pendingForcedShock: null,
    }
    const detoxRejected = criticalGameReducer(reset, queueForcedShock('coup'))
    expect(detoxRejected.pendingForcedShock).toBeNull()
    expect(detoxRejected.tvFeed[0]?.text).toMatch(/unavailable during Vox Populi/i)
  })

  it('rejects forced shocks immediately while Cupid owns the season', () => {
    const state = cleanState(503)
    state.expansionMode = 'cupidArrow'
    state.cupidArrow = {
      scheduledSeason: state.season,
      status: 'scheduled',
      activatedSeason: null,
      activatedWeek: null,
      pairs: [],
      eliminatedPairCount: 0,
      pendingPartnerEvictionId: null,
      visualsRevealed: false,
    }

    const result = criticalGameReducer(state, queueForcedShock('doubleEviction'))
    expect(result.pendingForcedShock).toBeNull()
    expect(result.tvFeed[0]?.text).toMatch(/unavailable while Cupid's Arrow/i)
  })

  it('restores a Battle Back winner to the active Classic eligibility pool', () => {
    let state = cleanState(505)
    const returnee = alive(state).find((player) => !player.isUser)
    if (!returnee) throw new Error('Expected a Battle Back candidate')

    returnee.status = 'jury'
    expect(canCastClassicEvictionVote(state, returnee.id)).toBe(false)

    state = criticalGameReducer(
      state,
      activateBattleBack({ candidates: [returnee.id], week: state.week })
    )
    state = criticalGameReducer(state, completeBattleBack(returnee.id))

    expect(state.players.find((player) => player.id === returnee.id)?.status).toBe('active')
    expect(state.battleBack?.winnerId).toBe(returnee.id)
    expect(canCastClassicEvictionVote(state, returnee.id)).toBe(true)
  })

  it('keeps Double Trouble replacements legal after the second Safety use', () => {
    let state = cleanState(506)
    const holder = alive(state).find((player) => player.isUser)
    const aiPlayers = alive(state).filter((player) => !player.isUser)
    if (!holder || aiPlayers.length < 4) throw new Error('Expected Double Trouble players')

    const [loh, savedNominee, remainingNominee] = aiPlayers
    loh.status = 'loh'
    holder.status = 'pos'
    savedNominee.status = 'nominated'
    remainingNominee.status = 'nominated'
    state.lohId = loh.id
    state.posWinnerId = holder.id
    state.nomineeIds = [savedNominee.id, remainingNominee.id]
    state.specialVeto = {
      seasonUsed: true,
      activeType: 'vip',
      activatedWeek: state.week,
      vipUseStage: 2,
      awaitingHolderReplacement: false,
      awaitingCoupReplacement1: false,
      awaitingCoupReplacement2: false,
      coupReplacement1Id: null,
      awaitingVipSecondUseDecision: false,
      awaitingVipSecondSaveTarget: true,
    }

    state = criticalGameReducer(state, submitVipSecondSaveTarget(savedNominee.id))

    expect(state.nomineeIds).toHaveLength(2)
    expect(state.nomineeIds).toContain(remainingNominee.id)
    expect(state.nomineeIds).not.toContain(savedNominee.id)
    expect(state.nomineeIds).not.toContain(loh.id)
    expect(state.nomineeIds).not.toContain(holder.id)
    expect(state.povProtectedIds).toContain(savedNominee.id)
    expect(
      state.players
        .filter((player) => player.status.split('+').includes('nominated'))
        .map((player) => player.id)
        .sort()
    ).toEqual([...state.nomineeIds].sort())
  })

  it('keeps Halo Exchange replacement authority with the holder without exposing LOH', () => {
    let state = cleanState(507)
    const holder = alive(state).find((player) => player.isUser)
    const aiPlayers = alive(state).filter((player) => !player.isUser)
    if (!holder || aiPlayers.length < 4) throw new Error('Expected Halo Exchange players')

    const [loh, remainingNominee, replacement] = aiPlayers
    loh.status = 'loh'
    holder.status = 'pos'
    remainingNominee.status = 'nominated'
    state.lohId = loh.id
    state.posWinnerId = holder.id
    state.nomineeIds = [remainingNominee.id]
    state.specialVeto = {
      seasonUsed: true,
      activeType: 'diamond',
      activatedWeek: state.week,
      vipUseStage: 0,
      awaitingHolderReplacement: true,
      awaitingCoupReplacement1: false,
      awaitingCoupReplacement2: false,
      coupReplacement1Id: null,
      awaitingVipSecondUseDecision: false,
      awaitingVipSecondSaveTarget: false,
    }

    const illegalLohAttempt = criticalGameReducer(state, submitDiamondReplacement(loh.id))
    expect(illegalLohAttempt.nomineeIds).toEqual([remainingNominee.id])
    expect(illegalLohAttempt.specialVeto?.awaitingHolderReplacement).toBe(true)

    state = criticalGameReducer(illegalLohAttempt, submitDiamondReplacement(replacement.id))
    expect(state.nomineeIds).toEqual([remainingNominee.id, replacement.id])
    expect(state.nomineeIds).not.toContain(loh.id)
    expect(state.specialVeto?.awaitingHolderReplacement).toBe(false)
  })

  it('forces Force Majeure to save and replace without changing Classic voter roles', () => {
    let state = cleanState(508)
    const aiPlayers = alive(state).filter((player) => !player.isUser)
    if (aiPlayers.length < 4) throw new Error('Expected Force Majeure players')

    const [loh, holder, otherNominee] = aiPlayers
    loh.status = 'loh'
    holder.status = 'nominated+pos'
    otherNominee.status = 'nominated'
    state.phase = 'pos_ceremony'
    state.lohId = loh.id
    state.posWinnerId = holder.id
    state.nomineeIds = [holder.id, otherNominee.id]
    state.specialVeto = {
      seasonUsed: true,
      activeType: 'spotlight',
      activatedWeek: state.week,
      vipUseStage: 0,
      awaitingHolderReplacement: false,
      awaitingCoupReplacement1: false,
      awaitingCoupReplacement2: false,
      coupReplacement1Id: null,
      awaitingVipSecondUseDecision: false,
      awaitingVipSecondSaveTarget: false,
    }

    state = criticalGameReducer(state, advance())

    expect(state.phase).toBe('pos_ceremony_results')
    expect(state.povSavedId).toBe(holder.id)
    expect(state.povProtectedIds).toContain(holder.id)
    expect(state.nomineeIds).toHaveLength(2)
    expect(state.nomineeIds).toContain(otherNominee.id)
    expect(state.nomineeIds).not.toContain(holder.id)
    expect(state.nomineeIds).not.toContain(loh.id)
    expect(canCastClassicEvictionVote(state, loh.id)).toBe(false)
  })

  it('preserves Classic vote eligibility during Double Eviction while expanding the block to three', () => {
    let state = cleanState(510)
    state.phase = 'nominations'
    const loh = alive(state).find((player) => !player.isUser)
    if (!loh) throw new Error('Expected an AI LOH')
    state.lohId = loh.id
    loh.status = 'loh'

    state = criticalGameReducer(state, activateDoubleEviction())
    state = criticalGameReducer(state, advance())

    expect(state.phase).toBe('nomination_results')
    expect(state.nomineeIds).toHaveLength(3)
    expect(state.nomineeIds).not.toContain(loh.id)

    state = { ...state, phase: 'social_2', awaitingHumanVote: false }
    state = criticalGameReducer(state, advance())

    expect(state.phase).toBe('live_vote')
    assertStoredVotesAreEligible(state)
    expect((state.votes ?? {})[loh.id]).toBeUndefined()
    state.nomineeIds.forEach((nomineeId) => {
      expect((state.votes ?? {})[nomineeId]).toBeUndefined()
    })
  })

  it('treats Democracia co-LOHs as non-voters and delegates a tie to an eligible POS holder', () => {
    let state = cleanState(520)
    const players = alive(state)
    const human = players.find((player) => player.isUser)
    const ai = players.filter((player) => !player.isUser)
    if (!human || ai.length < 4) throw new Error('Expected enough players')

    const [coLohA, coLohB, otherNominee, posHolder] = ai
    coLohA.status = 'loh'
    coLohB.status = 'loh'
    human.status = 'nominated'
    otherNominee.status = 'nominated'
    posHolder.status = 'pos'

    state.phase = 'social_2'
    state.lohId = coLohA.id
    state.coLohIds = [coLohA.id, coLohB.id]
    state.posWinnerId = posHolder.id
    state.nomineeIds = [human.id, otherNominee.id]
    state.democracia = {
      usedThisSeason: true,
      active: false,
      activatedDay: state.week,
      round: 2,
      candidateIds: [],
      eligibleVoterIds: [],
      votesByVoterId: {},
      awaitingHumanVote: false,
      awaitingPublicBreaker: false,
      resultDisplay: null,
    }

    state = criticalGameReducer(state, advance())

    expect(state.phase).toBe('live_vote')
    assertStoredVotesAreEligible(state)
    expect((state.votes ?? {})[coLohA.id]).toBeUndefined()
    expect((state.votes ?? {})[coLohB.id]).toBeUndefined()
    expect((state.votes ?? {})[human.id]).toBeUndefined()
    expect((state.votes ?? {})[otherNominee.id]).toBeUndefined()
    expect(getClassicEvictionTieBreakerId(state)).toBe(posHolder.id)
  })

  it('keeps Cupid pair roles atomic in the ordinary eviction vote', () => {
    let state = cleanState(530)
    const players = alive(state).slice(0, 8)
    if (players.length < 8) throw new Error('Expected eight active players')
    state.players.forEach((player) => {
      if (!players.some((entry) => entry.id === player.id)) player.status = 'evicted'
    })

    const pairs = [
      { id: 'pair-1', memberIds: [players[0].id, players[1].id] as [string, string], color: '#1' },
      { id: 'pair-2', memberIds: [players[2].id, players[3].id] as [string, string], color: '#2' },
      { id: 'pair-3', memberIds: [players[4].id, players[5].id] as [string, string], color: '#3' },
      { id: 'pair-4', memberIds: [players[6].id, players[7].id] as [string, string], color: '#4' },
    ]
    state.cupidArrow = {
      scheduledSeason: state.season,
      status: 'active',
      activatedSeason: state.season,
      activatedWeek: 1,
      pairs,
      eliminatedPairCount: 0,
      pendingPartnerEvictionId: null,
      visualsRevealed: true,
    }

    const human = players.find((player) => player.isUser)
    if (!human) throw new Error('Expected the human inside the selected Cupid roster')
    const humanPair = pairs.find((pair) => pair.memberIds.includes(human.id))
    if (!humanPair) throw new Error('Expected a human Cupid pair')
    const lohPair = pairs.find((pair) => pair.id !== humanPair.id)!
    state.lohId = lohPair.memberIds[0]
    lohPair.memberIds.forEach((id) => {
      const player = state.players.find((entry) => entry.id === id)
      if (player) player.status = 'loh'
    })
    state.nomineeIds = [...humanPair.memberIds]
    humanPair.memberIds.forEach((id) => {
      const player = state.players.find((entry) => entry.id === id)
      if (player) player.status = 'nominated'
    })
    state.phase = 'social_2'

    state = criticalGameReducer(state, advance())

    expect(state.phase).toBe('live_vote')
    assertStoredVotesAreEligible(state)
    for (const id of [...lohPair.memberIds, ...humanPair.memberIds]) {
      expect((state.votes ?? {})[id]).toBeUndefined()
    }
    for (const pair of pairs.filter((pair) => pair.id !== lohPair.id && pair.id !== humanPair.id)) {
      expect((state.votes ?? {})[pair.memberIds[0]]).toBeDefined()
      expect((state.votes ?? {})[pair.memberIds[1]]).toBe((state.votes ?? {})[pair.memberIds[0]])
    }
  })

  it('keeps Depression Shock strategic only: LOH and nominees remain excluded from eviction voting', () => {
    let state = cleanState(540)
    const players = alive(state)
    const loh = players.find((player) => !player.isUser)
    const human = players.find((player) => player.isUser)
    const otherNominee = players.find(
      (player) => player.id !== loh?.id && player.id !== human?.id && !player.isUser
    )
    if (!loh || !human || !otherNominee) throw new Error('Expected players')

    loh.status = 'loh'
    human.status = 'nominated'
    otherNominee.status = 'nominated'
    state.lohId = loh.id
    state.nomineeIds = [human.id, otherNominee.id]
    state.depressionShock = {
      rollResolved: true,
      pendingActivation: false,
      activatedWeek: state.week,
      activeDay: 1,
      recoveryWeek: null,
      completed: false,
    }
    state.phase = 'social_2'

    state = criticalGameReducer(state, advance())

    assertStoredVotesAreEligible(state)
    expect((state.votes ?? {})[loh.id]).toBeUndefined()
    expect((state.votes ?? {})[human.id]).toBeUndefined()
    expect((state.votes ?? {})[otherNominee.id]).toBeUndefined()
  })

  it('lets Detox make the LOH vulnerable but nominee status overrides all LOH voting privilege', () => {
    let state = cleanState(550)
    const humanHolder = alive(state).find((player) => player.isUser)
    const aiPlayers = alive(state).filter((player) => !player.isUser)
    if (!humanHolder || aiPlayers.length < 3) throw new Error('Expected players')
    const [loh, otherReplacement] = aiPlayers

    state.phase = 'pos_ceremony_results'
    state.lohId = loh.id
    state.posWinnerId = humanHolder.id
    loh.status = 'loh'
    humanHolder.status = 'pos'
    state.specialVeto = {
      seasonUsed: true,
      activeType: 'coup',
      activatedWeek: state.week,
      vipUseStage: 0,
      awaitingHolderReplacement: false,
      awaitingCoupReplacement1: true,
      awaitingCoupReplacement2: false,
      coupReplacement1Id: null,
      awaitingVipSecondUseDecision: false,
      awaitingVipSecondSaveTarget: false,
    }

    state = criticalGameReducer(state, submitCoupReplacement(loh.id))
    state = criticalGameReducer(state, submitCoupReplacement(otherReplacement.id))

    expect(state.nomineeIds).toContain(loh.id)
    expect(canCastClassicEvictionVote(state, loh.id)).toBe(false)
    expect(getClassicEvictionTieBreakerId(state)).toBeNull()

    const eligibleVoters = alive(state).filter((player) =>
      canCastClassicEvictionVote(state, player.id)
    )
    if (eligibleVoters.length < 4) throw new Error('Expected four eligible Detox voters')

    state = {
      ...state,
      phase: 'live_vote',
      awaitingHumanVote: false,
      votes: {
        [eligibleVoters[0].id]: loh.id,
        [eligibleVoters[1].id]: loh.id,
        [eligibleVoters[2].id]: otherReplacement.id,
        [eligibleVoters[3].id]: otherReplacement.id,
        // This stale/forged LOH ballot must be removed, not counted.
        [loh.id]: otherReplacement.id,
      },
    }
    const tied = criticalGameReducer(state, advance())

    expect(tied.phase).toBe('eviction_results')
    expect(tied.pendingExitContext?.voteCounts[loh.id]).toBe(2)
    expect(tied.pendingExitContext?.voteCounts[otherReplacement.id]).toBe(2)
    expect((tied.votes ?? {})[loh.id]).toBeUndefined()
    expect(tied.pendingExitContext?.votesByVoterId[loh.id]).toBeUndefined()
    expect(tied.awaitingTieBreak).toBe(true)
    expect(tied.awaitingPosTieBreak).toBe(true)
    expect(getClassicEvictionTieBreakerId(tied)).toBe(humanHolder.id)
    expect(tied.pendingEviction).toBeNull()

    const decided = criticalGameReducer(tied, submitPosTieBreak(loh.id))
    expect(decided.awaitingTieBreak).toBe(false)
    expect(decided.awaitingPosTieBreak).toBe(false)
    expect(decided.pendingEviction?.evicteeId).toBe(loh.id)
  })

  it('keeps Twin Shock target restrictions inside the critical nomination path', () => {
    const state = cleanState(560)
    const lia = state.players.find((player) => player.id === 'lia')
    const originalHuman = state.players.find((player) => player.isUser)
    const otherChoices = state.players.filter(
      (player) => player.id !== 'lia' && player.id !== 'ali' && !player.isUser
    )
    if (!lia || !originalHuman || otherChoices.length < 2) {
      throw new Error('Expected Lia, human, and other nominees')
    }

    originalHuman.isUser = false
    lia.isUser = true
    lia.status = 'loh'
    if (!state.players.some((player) => player.id === 'ali')) {
      state.players.push({
        id: 'ali',
        name: 'Ali',
        avatar: 'assets/skins/Ali_avatar.webp',
        status: 'active',
        isUser: false,
        lateEntrant: true,
      })
    }
    state.twinShockResolution = 'mission_success'
    state.phase = 'nomination_results'
    state.lohId = lia.id
    state.awaitingNominations = true

    const invalid = criticalGameReducer(state, commitNominees(['ali', otherChoices[0].id]))
    expect(invalid.nomineeIds).toEqual([])
    expect(invalid.awaitingNominations).toBe(true)

    const valid = criticalGameReducer(
      invalid,
      commitNominees([otherChoices[0].id, otherChoices[1].id])
    )
    expect(valid.awaitingNominations).toBe(false)
    expect(valid.nomineeIds).toEqual([otherChoices[0].id, otherChoices[1].id])
  })

  it('allows a Day Start Shock direct exit without pretending it was a nomination or house vote', () => {
    let state = cleanState(570)
    const target = alive(state).find((player) => !player.isUser)
    if (!target) throw new Error('Expected a shock target')
    state.phase = 'week_start'

    state = criticalGameReducer(
      state,
      activateDayStartShock({
        targetId: target.id,
        reason: `${target.name} leaves immediately.`,
        templateId: 'integrity-test',
        triggeredWeek: state.week,
        source: 'debug',
      })
    )
    state = criticalGameReducer(state, confirmDayStartShock())

    expect(state.pendingEviction?.evicteeId).toBe(target.id)
    expect(state.nomineeIds).not.toContain(target.id)
    expect(state.votes).toEqual({})

    state = criticalGameReducer(state, finalizePendingEviction(target.id))
    const exited = state.players.find((player) => player.id === target.id)

    expect(['evicted', 'jury']).toContain(exited?.status)
    expect(state.pendingEviction).toBeNull()
  })
})
