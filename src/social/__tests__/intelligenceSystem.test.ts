import { describe, expect, it } from 'vitest'
import type { AiGameIdentity } from '../../ai/aiGameIdentity'
import type { Player } from '../../types'
import { addRealityFact, learnRealityFact } from '../reality/knowledge'
import { createInitialRealityDomainState } from '../reality/state'
import {
  applyCompetitionIntentToScore,
  buildIntelFactFromSocialAction,
  decideCompetitionIntent,
  getIntelLeadViews,
  makeIntelMemory,
  selectDiscoverableFact,
} from '../intelligenceSystem'

const floater: AiGameIdentity = {
  archetype: 'active_floater',
  temperament: 'secretive',
  competitionDrive: 0.35,
  emotionalVolatility: 0.25,
  audienceFocus: 0.4,
  survivalFocus: 0.45,
}

const players: Player[] = [
  { id: 'human', name: 'You', avatar: '', status: 'active', isUser: true },
  { id: 'sol', name: 'Sol', avatar: '', status: 'active', aiGameIdentity: floater },
  { id: 'lux', name: 'Lux', avatar: '', status: 'active' },
]

describe('intelligence system', () => {
  it('never introduces competition throwing in Surveyeval or before day three', () => {
    for (let seed = 0; seed < 100; seed += 1) {
      expect(
        decideCompetitionIntent(seed, 'sol', floater, {
          mode: 'survival',
          day: 8,
          phase: 'loh_comp',
          prizeType: 'LOH',
        })
      ).toBe('compete')
      expect(
        decideCompetitionIntent(seed, 'sol', floater, {
          mode: 'classic',
          day: 2,
          phase: 'loh_comp',
          prizeType: 'LOH',
        })
      ).toBe('compete')
    }
  })

  it('makes an intentional throw visibly weaker without forcing a zero score', () => {
    const score = applyCompetitionIntentToScore(
      900,
      {
        key: 'test',
        category: 'mental',
        scoreDirection: 'higher-is-better',
        volatility: 0.2,
        weights: { mental: 1, physical: 0, precision: 0, nerve: 0 },
        minScore: 100,
        maxScore: 1000,
      },
      'throw',
      44,
      'sol'
    )
    expect(score).toBeGreaterThan(100)
    expect(score).toBeLessThan(500)
  })

  it('turns witnessed social behaviour into a persistent, sourced lead', () => {
    const fact = buildIntelFactFromSocialAction(
      {
        actionId: 'proposeAlliance',
        actorId: 'sol',
        targetId: 'lux',
        cost: 1,
        delta: 4,
        outcome: 'success',
        newEnergy: 4,
        timestamp: 1234,
        week: 4,
        phase: 'social_1',
        source: 'system',
      },
      players,
      'social_1'
    )
    expect(fact?.propositionType).toBe('SECRET_ALLIANCE')
    expect(fact).not.toBeNull()
    if (!fact) return

    const domain = createInitialRealityDomainState()
    addRealityFact(domain, fact)
    const memory = makeIntelMemory({
      ownerId: 'human',
      fact,
      sourceType: 'HEARSAY',
      sourceChain: ['lux'],
      confidence: 0.7,
      day: 4,
      phase: 'social_1',
    })
    learnRealityFact(domain, { ownerId: 'human', factId: fact.id, memory, confidence: 0.7 })
    const [lead] = getIntelLeadViews(domain, 'human', players, 4)
    expect(lead.text).toContain('Sol and Lux')
    expect(lead.confidence).toBe('Credible')
    expect(lead.source).toBe('House rumour')
  })

  it('keeps unwitnessed private facts out of ordinary observation', () => {
    const domain = createInitialRealityDomainState()
    addRealityFact(domain, {
      id: 'fact:intel:private-meeting',
      propositionType: 'SECRET_MEETING',
      subjectIds: ['sol', 'lux'],
      value: true,
      day: 4,
      phase: 'social_1',
      visibility: 'PAIR_ONLY',
      participantIds: ['sol', 'lux'],
      witnessIds: [],
      viewerVisible: false,
      publicVisible: false,
      juryVisible: false,
      sourceEventId: 'social:private-meeting',
    })

    expect(selectDiscoverableFact(domain, 'human', 4, new Set(), true)).toBeNull()
    expect(selectDiscoverableFact(domain, 'human', 4, new Set(), false)?.id).toBe(
      'fact:intel:private-meeting'
    )
  })
})
