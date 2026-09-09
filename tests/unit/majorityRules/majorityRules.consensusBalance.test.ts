import { describe, expect, it } from 'vitest'

import type { AiGameIdentity } from '../../../src/ai/aiGameIdentity'
import {
  chooseAiAnswer,
  resolveMajorityRulesBallot,
  type MajorityRulesQuestion,
} from '../../../src/features/majorityRules/helpers'

const partnerQuestion: MajorityRulesQuestion = {
  id: 'q014',
  prompt: 'What would most people prefer in a partner?',
  options: [
    { id: 'a', label: 'A', text: 'Attractive', baseBias: 0.62 },
    { id: 'b', label: 'B', text: 'Reliable', baseBias: 0.5 },
    { id: 'c', label: 'C', text: 'Fun', baseBias: 0.38 },
  ],
}

const riskQuestion: MajorityRulesQuestion = {
  id: 'q087',
  prompt: 'What would most people choose when facing risk?',
  options: [
    { id: 'a', label: 'A', text: 'Safe option', baseBias: 0.62 },
    { id: 'b', label: 'B', text: 'Moderate option', baseBias: 0.5 },
    { id: 'c', label: 'C', text: 'High-risk option', baseBias: 0.38 },
  ],
}

const identity = (archetype: AiGameIdentity['archetype']): AiGameIdentity => ({
  archetype,
  temperament: 'adaptable',
  competitionDrive: 0.55,
  emotionalVolatility: 0.35,
  audienceFocus: 0.35,
  survivalFocus: 0.35,
})

function topShare(question: MajorityRulesQuestion, sampleSize = 1200) {
  const counts = { a: 0, b: 0, c: 0 }
  for (let seed = 1; seed <= sampleSize; seed += 1) {
    const answer = chooseAiAnswer({
      seed,
      roundNumber: 1,
      playerId: `shape-${seed}`,
      question,
    })
    counts[answer as keyof typeof counts] += 1
  }
  return Math.max(...Object.values(counts)) / sampleSize
}

describe('Majority Rules realistic population model', () => {
  it('allows a curated question prior to overturn the old first-option-always-wins assumption', () => {
    const counts = { a: 0, b: 0, c: 0 }
    for (let seed = 1; seed <= 800; seed += 1) {
      const answer = chooseAiAnswer({
        seed,
        roundNumber: 1,
        playerId: `ai-${seed}`,
        question: partnerQuestion,
      })
      counts[answer as keyof typeof counts] += 1
    }
    expect(counts.b).toBeGreaterThan(counts.a)
    expect(counts.b).toBeGreaterThan(counts.c)
  })

  it('produces materially different vote shapes for divisive and consensus questions', () => {
    const divisiveTopShare = topShare(partnerQuestion)
    const consensusTopShare = topShare(riskQuestion)

    expect(consensusTopShare - divisiveTopShare).toBeGreaterThan(0.08)
  })

  it('lets contestant identity change semantic preferences instead of only adding random noise', () => {
    let riskTakerHighRisk = 0
    let loyalAnchorHighRisk = 0
    for (let seed = 1; seed <= 800; seed += 1) {
      if (
        chooseAiAnswer({
          seed,
          roundNumber: 1,
          playerId: `risk-${seed}`,
          question: riskQuestion,
          identity: identity('risk_taker'),
        }) === 'c'
      ) {
        riskTakerHighRisk += 1
      }
      if (
        chooseAiAnswer({
          seed,
          roundNumber: 1,
          playerId: `loyal-${seed}`,
          question: riskQuestion,
          identity: identity('loyal_anchor'),
        }) === 'c'
      ) {
        loyalAnchorHighRisk += 1
      }
    }
    expect(riskTakerHighRisk).toBeGreaterThan(loyalAnchorHighRisk)
  })

  it('does not mass-eliminate a near-even 5-5-4 split', () => {
    const activeIds = Array.from({ length: 14 }, (_, index) => `p${index + 1}`)
    const answers = Object.fromEntries(
      activeIds.map((id, index) => [id, index < 5 ? 'a' : index < 10 ? 'b' : 'c'])
    )
    const result = resolveMajorityRulesBallot({
      activeIds,
      answers,
      question: partnerQuestion,
      eliminationCount: 1,
    })
    expect(result.kind).toBe('split')
    expect(result.eliminatedIds).toEqual([])
  })

  it('does not eliminate two tied minority groups at once', () => {
    const activeIds = Array.from({ length: 14 }, (_, index) => `p${index + 1}`)
    const answers = Object.fromEntries(
      activeIds.map((id, index) => [id, index < 8 ? 'a' : index < 11 ? 'b' : 'c'])
    )
    const result = resolveMajorityRulesBallot({
      activeIds,
      answers,
      question: partnerQuestion,
      eliminationCount: 1,
    })
    expect(result.kind).toBe('split')
    expect(result.eliminatedIds).toEqual([])
  })

  it('still eliminates a genuinely small minority', () => {
    const activeIds = Array.from({ length: 14 }, (_, index) => `p${index + 1}`)
    const answers = Object.fromEntries(
      activeIds.map((id, index) => [id, index < 8 ? 'a' : index < 12 ? 'b' : 'c'])
    )
    const result = resolveMajorityRulesBallot({
      activeIds,
      answers,
      question: partnerQuestion,
      eliminationCount: 1,
    })
    expect(result.kind).toBe('elimination')
    expect(result.eliminatedIds).toEqual(['p13', 'p14'])
  })
})
