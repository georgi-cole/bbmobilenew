from pathlib import Path


def replace_once(text: str, old: str, new: str, label: str) -> str:
    if old not in text:
        if new in text:
            return text
        raise RuntimeError(f'missing anchor: {label}')
    return text.replace(old, new, 1)


helper_path = Path('src/features/majorityRules/helpers.ts')
helper = helper_path.read_text()
helper = replace_once(
    helper,
    "import { mulberry32 } from '../../store/rng'\n",
    "import { mulberry32 } from '../../store/rng'\nimport type { AiGameIdentity } from '../../ai/aiGameIdentity'\n",
    'identity import',
)
helper = replace_once(
    helper,
    "  kind: 'unanimous' | 'revote' | 'elimination'\n",
    "  kind: 'unanimous' | 'revote' | 'split' | 'elimination'\n",
    'ballot resolution kind',
)
helper = replace_once(
    helper,
    "const MAJORITY_RULES_OPTION_BIASES = [0.94, 0.72, 0.46] as const\n",
    "const MAJORITY_RULES_OPTION_BIASES = [0.62, 0.5, 0.38] as const\n\n"
    "const DIVISIVE_QUESTION_IDS = new Set([\n"
    "  'q014', 'q045', 'q051', 'q057', 'q079', 'q094', 'q106', 'q116', 'q136',\n"
    "  'q151', 'q152', 'q157', 'q160', 'q162', 'q175', 'q199', 'q200',\n"
    "])\n"
    "const STRONG_CONSENSUS_QUESTION_IDS = new Set([\n"
    "  'q013', 'q022', 'q055', 'q087', 'q123', 'q132', 'q147', 'q149', 'q161',\n"
    "  'q180', 'q183', 'q193',\n"
    "])\n"
    "const QUESTION_PRIOR_OVERRIDES: Record<string, Record<string, number>> = {\n"
    "  q014: { Attractive: 0.46, Reliable: 0.64, Fun: 0.43 },\n"
    "  q024: { 'Fast food': 0.4, 'Healthy food': 0.5, 'Mixed diet': 0.64 },\n"
    "  q035: { Food: 0.48, Bills: 0.68, Leisure: 0.36 },\n"
    "  q054: { Success: 0.48, Kindness: 0.6, Talent: 0.52 },\n"
    "  q072: { 'Avoid it': 0.46, 'Confront it': 0.42, Compromise: 0.64 },\n"
    "  q087: { 'Safe option': 0.59, 'Moderate option': 0.7, 'High-risk option': 0.27 },\n"
    "  q090: { Wealth: 0.46, Happiness: 0.64, Freedom: 0.55 },\n"
    "  q094: { Intelligence: 0.56, Kindness: 0.6, Success: 0.46 },\n"
    "  q116: { Passion: 0.45, Stability: 0.58, Trust: 0.67 },\n"
    "  q124: { Reliability: 0.68, Chemistry: 0.52, Ambition: 0.37 },\n"
    "  q127: { Speed: 0.48, Privacy: 0.57, 'Ease of use': 0.62 },\n"
    "  q134: { 'Save it': 0.61, 'Spend it': 0.37, 'Pay debt': 0.58 },\n"
    "  q146: { Friendly: 0.61, Confident: 0.56, Polite: 0.48 },\n"
    "  q155: { Pay: 0.58, Security: 0.53, 'Work-life balance': 0.62 },\n"
    "  q162: { Safety: 0.58, Excitement: 0.41, Understanding: 0.64 },\n"
    "  q165: { Decisiveness: 0.45, Empathy: 0.55, Fairness: 0.66 },\n"
    "  q170: { Easygoing: 0.65, Organized: 0.49, Funny: 0.53 },\n"
    "  q178: { Therapy: 0.47, Books: 0.49, 'Better routines': 0.62 },\n"
    "  q185: { 'Low rent': 0.52, 'Good location': 0.65, 'More space': 0.55 },\n"
    "  q190: { Patience: 0.65, 'Practical help': 0.58, Affection: 0.52 },\n"
    "  q197: { 'Be direct': 0.56, 'Be gentle': 0.59, 'Delay it': 0.34 },\n"
    "}\n",
    'question model constants',
)
helper = replace_once(
    helper,
    "function chooseWeightedOption(\n  scores: Record<string, number>,\n  optionIds: string[],\n  rng: () => number\n): string {\n  const weights = optionIds.map((optionId) => Math.max(MIN_OPTION_WEIGHT, scores[optionId] ?? 0))\n",
    "function chooseWeightedOption(\n  scores: Record<string, number>,\n  optionIds: string[],\n  rng: () => number,\n  power = 1\n): string {\n  const weights = optionIds.map(\n    (optionId) => Math.max(MIN_OPTION_WEIGHT, scores[optionId] ?? 0) ** power\n  )\n",
    'weighted choice power',
)
model_functions = r'''
function getQuestionConsensusPower(question: MajorityRulesQuestion): number {
  if (DIVISIVE_QUESTION_IDS.has(question.id)) return 1.15
  if (STRONG_CONSENSUS_QUESTION_IDS.has(question.id)) return 3

  const prompt = question.prompt.toLowerCase()
  if (/\b(first|daily|most often|when tired|before bed|checkout|commute|in danger)\b/.test(prompt)) {
    return 2.6
  }
  if (/\b(prefer|value|want more|rather|admire|fear|regret|envy|known for)\b/.test(prompt)) {
    return 1.35
  }
  return 1.9
}

function getPopulationPrior(question: MajorityRulesQuestion, option: MajorityRulesQuestionOption) {
  return QUESTION_PRIOR_OVERRIDES[question.id]?.[option.text] ?? option.baseBias
}

function getIdentityConformity(identity: AiGameIdentity | undefined): number {
  if (!identity) return 1
  let value = 0.94 + identity.competitionDrive * 0.16
  if (['public_pleaser', 'audience_chameleon', 'media_strategist', 'active_floater', 'strategic_operator'].includes(identity.archetype)) {
    value += 0.12
  }
  if (['chaos_agent', 'lone_wolf', 'antihero', 'risk_taker'].includes(identity.archetype)) {
    value -= 0.18
  }
  return Math.max(0.72, Math.min(1.28, value))
}

function semanticIdentityAffinity(identity: AiGameIdentity | undefined, optionText: string): number {
  if (!identity) return 0
  const text = optionText.toLowerCase()
  const keywordSets: Partial<Record<AiGameIdentity['archetype'], string[]>> = {
    loyal_anchor: ['loyal', 'trust', 'family', 'stability', 'reliable', 'support', 'safety', 'security'],
    romantic_loyalist: ['affection', 'chemistry', 'passion', 'relationship', 'trust', 'loyal', 'understanding'],
    risk_taker: ['risk', 'adventure', 'exciting', 'excitement', 'new', 'travel', 'freedom'],
    chaos_agent: ['risk', 'adventure', 'go out', 'fun', 'new', 'impulse'],
    aggressive_competitor: ['success', 'career', 'achievement', 'gym', 'discipline', 'growth'],
    clutch_competitor: ['success', 'achievement', 'confidence', 'pressure', 'discipline'],
    social_butterfly: ['friends', 'social', 'party', 'connection', 'talk', 'fun', 'people'],
    public_pleaser: ['liked', 'friendly', 'kindness', 'praise', 'attention', 'recognition'],
    audience_darling: ['friendly', 'kindness', 'support', 'people', 'harmony'],
    media_strategist: ['attention', 'recognition', 'status', 'style', 'looks', 'social media'],
    audience_chameleon: ['attention', 'recognition', 'liked', 'style', 'social'],
    underdog_survivor: ['safe', 'safety', 'security', 'saving', 'cheap', 'low cost', 'reliability', 'practical'],
    strategic_operator: ['planning', 'security', 'money', 'career', 'position', 'control'],
    puppet_master: ['control', 'influence', 'recognition', 'connections', 'strategy'],
    puzzle_specialist: ['intelligence', 'knowledge', 'planning', 'focus', 'skill'],
  }
  const keywords = keywordSets[identity.archetype] ?? []
  return keywords.some((keyword) => text.includes(keyword)) ? 0.1 : 0
}

function getIdentityNoiseWeight(identity: AiGameIdentity | undefined): number {
  if (!identity) return NOISE_WEIGHT
  let multiplier = 0.65 + identity.emotionalVolatility * 0.9
  if (identity.temperament === 'impulsive') multiplier += 0.35
  if (identity.temperament === 'calm') multiplier -= 0.2
  return NOISE_WEIGHT * Math.max(0.5, Math.min(1.6, multiplier))
}
'''
helper = replace_once(
    helper,
    "function buildPlayerScores(params: {\n",
    model_functions + "\nfunction buildPlayerScores(params: {\n",
    'model helper functions',
)
helper = replace_once(
    helper,
    "  previousDistribution?: Record<string, number> | null\n  blockedAnswer?: string | null\n}) {\n  const { seed, roundNumber, playerId, question, blockedAnswer } = params\n",
    "  previousDistribution?: Record<string, number> | null\n  blockedAnswer?: string | null\n  identity?: AiGameIdentity\n}) {\n  const { seed, roundNumber, playerId, question, blockedAnswer, identity } = params\n",
    'player score identity param',
)
helper = replace_once(
    helper,
    "  const scores: Record<string, number> = {}\n\n  for (const option of question.options) {\n",
    "  const scores: Record<string, number> = {}\n  const conformity = getIdentityConformity(identity)\n  const choicePower = getQuestionConsensusPower(question) * (0.9 + conformity * 0.1)\n  const noiseWeight = getIdentityNoiseWeight(identity)\n\n  for (const option of question.options) {\n",
    'score setup',
)
helper = replace_once(
    helper,
    "    const personalBias = ((fnv1a32(preferenceKey) % 1000) / 1000 - 0.5) * PERSONALITY_WEIGHT\n    const noise = (rng() - 0.5) * NOISE_WEIGHT\n    scores[option.id] = Math.max(MIN_OPTION_WEIGHT, option.baseBias + personalBias + noise)\n  }\n\n  return { optionIds, scores, rng }\n",
    "    const personalBias = ((fnv1a32(preferenceKey) % 1000) / 1000 - 0.5) * PERSONALITY_WEIGHT * 0.55\n    const noise = (rng() - 0.5) * noiseWeight\n    const populationPrior = getPopulationPrior(question, option)\n    const centeredPrior = 0.5 + (populationPrior - 0.5) * conformity\n    const semanticBias = semanticIdentityAffinity(identity, option.text)\n    scores[option.id] = Math.max(\n      MIN_OPTION_WEIGHT,\n      centeredPrior + semanticBias + personalBias + noise\n    )\n  }\n\n  return { optionIds, scores, rng, choicePower }\n",
    'semantic scores',
)
helper = replace_once(
    helper,
    "  blockedAnswer?: string | null\n}): string {\n  const { optionIds, scores, rng } = buildPlayerScores(params)\n  return chooseWeightedOption(scores, optionIds, rng)\n}\n",
    "  blockedAnswer?: string | null\n  identity?: AiGameIdentity\n}): string {\n  const { optionIds, scores, rng, choicePower } = buildPlayerScores(params)\n  return chooseWeightedOption(scores, optionIds, rng, choicePower)\n}\n",
    'choose answer identity and power',
)
helper = replace_once(
    helper,
    "  blockedAnswers?: Record<string, string>\n}): Record<string, string> {\n",
    "  blockedAnswers?: Record<string, string>\n  aiIdentities?: Record<string, AiGameIdentity | undefined>\n}): Record<string, string> {\n",
    'base answers identity map signature',
)
helper = replace_once(
    helper,
    "    blockedAnswers = {},\n  } = params\n",
    "    blockedAnswers = {},\n    aiIdentities = {},\n  } = params\n",
    'base answers identity map destructure',
)
helper = replace_once(
    helper,
    "      blockedAnswer: blockedAnswers[playerId] ?? null,\n    })\n",
    "      blockedAnswer: blockedAnswers[playerId] ?? null,\n      identity: aiIdentities[playerId],\n    })\n",
    'base answer identity',
)
helper = replace_once(
    helper,
    "  blockedAnswers?: Record<string, string>\n}): MajorityRulesRoundSimulation {\n",
    "  blockedAnswers?: Record<string, string>\n  aiIdentities?: Record<string, AiGameIdentity | undefined>\n}): MajorityRulesRoundSimulation {\n",
    'simulation identity map signature',
)
# replace the later simulate destructure occurrence only
simulate_anchor = "    previousDistribution,\n    blockedAnswers = {},\n  } = params\n\n  const baseAiAnswers = buildBaseAiAnswers({\n"
helper = replace_once(
    helper,
    simulate_anchor,
    "    previousDistribution,\n    blockedAnswers = {},\n    aiIdentities = {},\n  } = params\n\n  const baseAiAnswers = buildBaseAiAnswers({\n",
    'simulation identity destructure',
)
helper = replace_once(
    helper,
    "    previousDistribution,\n    blockedAnswers,\n  })\n  const aiHintDecision = chooseAiHintDecision({\n",
    "    previousDistribution,\n    blockedAnswers,\n    aiIdentities,\n  })\n  const aiHintDecision = chooseAiHintDecision({\n",
    'simulation identity base answers',
)
# Fairness: tied-bottom groups and large minorities are non-elimination split rounds.
old_resolution = """  if (tiedOptionIds.length !== 1) {
    if (tiedOptionIds.length < populatedOptionIds.length) {
      return {
        kind: 'elimination',
        distribution,
        answers,
        eliminatedIds: activeIds.filter((playerId) =>
          tiedOptionIds.includes(answers[playerId] ?? '')
        ),
        minorityOptionId: null,
        tiedOptionIds,
        eliminationCount,
      }
    }
    return {
      kind: 'revote',
      distribution,
      answers,
      eliminatedIds: [],
      minorityOptionId: null,
      tiedOptionIds,
      eliminationCount,
    }
  }

  const minorityOptionId = tiedOptionIds[0]
  const eliminatedIds = activeIds.filter((playerId) => answers[playerId] === minorityOptionId)

  return {
    kind: 'elimination',
"""
new_resolution = """  if (tiedOptionIds.length !== 1) {
    if (tiedOptionIds.length === populatedOptionIds.length) {
      return {
        kind: 'revote',
        distribution,
        answers,
        eliminatedIds: [],
        minorityOptionId: null,
        tiedOptionIds,
        eliminationCount,
      }
    }
    return {
      kind: 'split',
      distribution,
      answers,
      eliminatedIds: [],
      minorityOptionId: null,
      tiedOptionIds,
      eliminationCount,
    }
  }

  const minorityOptionId = tiedOptionIds[0]
  const eliminatedIds = activeIds.filter((playerId) => answers[playerId] === minorityOptionId)
  const maxClearMinoritySize = activeIds.length >= 6 ? 2 : 1
  if (eliminatedIds.length > maxClearMinoritySize) {
    return {
      kind: 'split',
      distribution,
      answers,
      eliminatedIds: [],
      minorityOptionId,
      tiedOptionIds: [],
      eliminationCount,
    }
  }

  return {
    kind: 'elimination',
"""
helper = replace_once(helper, old_resolution, new_resolution, 'clear minority resolution')
helper_path.write_text(helper)


slice_path = Path('src/features/majorityRules/majorityRulesSlice.ts')
slice_text = slice_path.read_text()
slice_text = replace_once(
    slice_text,
    "import { createSlice, type PayloadAction } from '@reduxjs/toolkit';\n",
    "import { createSlice, type PayloadAction } from '@reduxjs/toolkit';\nimport type { AiGameIdentity } from '../../ai/aiGameIdentity';\n",
    'slice identity import',
)
slice_text = replace_once(
    slice_text,
    "  outcomeResolved: boolean;\n}\n",
    "  outcomeResolved: boolean;\n  aiIdentities: Record<string, AiGameIdentity | undefined>;\n}\n",
    'slice state identity map',
)
slice_text = replace_once(
    slice_text,
    "  outcomeResolved: false,\n};\n",
    "  outcomeResolved: false,\n  aiIdentities: {},\n};\n",
    'slice initial identity map',
)
slice_text = replace_once(
    slice_text,
    "        humanPlayerId: string | null;\n      }>,\n",
    "        humanPlayerId: string | null;\n        aiIdentities?: Record<string, AiGameIdentity | undefined>;\n      }>,\n",
    'slice init payload identities',
)
slice_text = replace_once(
    slice_text,
    "        outcomeResolved: false,\n      };\n",
    "        outcomeResolved: false,\n        aiIdentities: action.payload.aiIdentities ?? {},\n      };\n",
    'slice init state identities',
)
# Two calls need identity map: hint preview base answers and lock-round simulation.
slice_text = slice_text.replace(
    "        blockedAnswers: state.blockedAnswers,\n      });",
    "        blockedAnswers: state.blockedAnswers,\n        aiIdentities: state.aiIdentities,\n      });",
    1,
)
slice_text = slice_text.replace(
    "        blockedAnswers: state.blockedAnswers,\n      });\n\n      if (!state.roundHintUsedBy && simulation.aiHintDecision)",
    "        blockedAnswers: state.blockedAnswers,\n        aiIdentities: state.aiIdentities,\n      });\n\n      if (!state.roundHintUsedBy && simulation.aiHintDecision)",
    1,
)
slice_text = replace_once(
    slice_text,
    "      if (result.kind === 'unanimous') {\n",
    "      if (result.kind === 'split') {\n        state.doubleEliminationArmed = false;\n        state.roundNumber += 1;\n        state.revoteNumber = 0;\n        state.previousDistribution = null;\n        state.blockedAnswers = {};\n        prepareQuestion(state);\n        state.phase = 'question';\n        return;\n      }\n\n      if (result.kind === 'unanimous') {\n",
    'slice split advance',
)
slice_path.write_text(slice_text)


component_path = Path('src/components/MajorityRulesComp/MajorityRulesComp.tsx')
component = component_path.read_text()
component = replace_once(
    component,
    "import type { RootState } from '../../store/store'\n",
    "import type { RootState } from '../../store/store'\nimport type { AiGameIdentity } from '../../ai/aiGameIdentity'\n",
    'component identity import',
)
component = replace_once(
    component,
    "    humanPlayerId: string | null\n  }>(() => ({\n",
    "    humanPlayerId: string | null\n    aiIdentities: Record<string, AiGameIdentity | undefined>\n  }>(() => ({\n",
    'component initial config type',
)
component = replace_once(
    component,
    "    humanPlayerId: participants?.find((participant) => participant.isHuman)?.id ?? null,\n  }))\n",
    "    humanPlayerId: participants?.find((participant) => participant.isHuman)?.id ?? null,\n    aiIdentities: Object.fromEntries(\n      gamePlayers\n        .filter((player) => participantIds.includes(player.id) && player.aiGameIdentity)\n        .map((player) => [player.id, player.aiGameIdentity])\n    ),\n  }))\n",
    'component initial config identity map',
)
component = replace_once(
    component,
    "            {reveal?.result.kind === 'revote'\n",
    "            {reveal?.result.kind === 'split'\n              ? 'No clear minority. Nobody falls.'\n              : reveal?.result.kind === 'revote'\n",
    'split reveal headline',
)
component = replace_once(
    component,
    "            {reveal?.result.kind === 'revote'\n              ? reveal.revoteNumber >= 1\n",
    "            {reveal?.result.kind === 'split'\n              ? 'The vote was too divided for a fair elimination. A fresh question will decide the next minority.'\n              : reveal?.result.kind === 'revote'\n              ? reveal.revoteNumber >= 1\n",
    'split reveal copy',
)
component = component.replace(
    "                  ? 'Tie at the bottom. Every minority answer drops.'\n",
    "                  ? 'Tie at the bottom. No one is eliminated.'\n",
)
component_path.write_text(component)


test_path = Path('tests/unit/majorityRules/majorityRules.consensusBalance.test.ts')
test_path.write_text("""import { describe, expect, it } from 'vitest'\n\nimport type { AiGameIdentity } from '../../../src/ai/aiGameIdentity'\nimport {\n  chooseAiAnswer,\n  resolveMajorityRulesBallot,\n  type MajorityRulesQuestion,\n} from '../../../src/features/majorityRules/helpers'\n\nconst partnerQuestion: MajorityRulesQuestion = {\n  id: 'q014',\n  prompt: 'What would most people prefer in a partner?',\n  options: [\n    { id: 'a', label: 'A', text: 'Attractive', baseBias: 0.62 },\n    { id: 'b', label: 'B', text: 'Reliable', baseBias: 0.5 },\n    { id: 'c', label: 'C', text: 'Fun', baseBias: 0.38 },\n  ],\n}\n\nconst riskQuestion: MajorityRulesQuestion = {\n  id: 'q087',\n  prompt: 'What would most people choose when facing risk?',\n  options: [\n    { id: 'a', label: 'A', text: 'Safe option', baseBias: 0.62 },\n    { id: 'b', label: 'B', text: 'Moderate option', baseBias: 0.5 },\n    { id: 'c', label: 'C', text: 'High-risk option', baseBias: 0.38 },\n  ],\n}\n\nconst identity = (archetype: AiGameIdentity['archetype']): AiGameIdentity => ({\n  archetype,\n  temperament: 'adaptable',\n  competitionDrive: 0.55,\n  emotionalVolatility: 0.35,\n  audienceFocus: 0.35,\n  survivalFocus: 0.35,\n})\n\ndescribe('Majority Rules realistic population model', () => {\n  it('allows a curated question prior to overturn the old first-option-always-wins assumption', () => {\n    const counts = { a: 0, b: 0, c: 0 }\n    for (let seed = 1; seed <= 800; seed += 1) {\n      const answer = chooseAiAnswer({\n        seed,\n        roundNumber: 1,\n        playerId: `ai-${seed}`,\n        question: partnerQuestion,\n      })\n      counts[answer as keyof typeof counts] += 1\n    }\n    expect(counts.b).toBeGreaterThan(counts.a)\n    expect(counts.b).toBeGreaterThan(counts.c)\n  })\n\n  it('lets contestant identity change semantic preferences instead of only adding random noise', () => {\n    let riskTakerHighRisk = 0\n    let loyalAnchorHighRisk = 0\n    for (let seed = 1; seed <= 800; seed += 1) {\n      if (\n        chooseAiAnswer({\n          seed,\n          roundNumber: 1,\n          playerId: `risk-${seed}`,\n          question: riskQuestion,\n          identity: identity('risk_taker'),\n        }) === 'c'\n      ) {\n        riskTakerHighRisk += 1\n      }\n      if (\n        chooseAiAnswer({\n          seed,\n          roundNumber: 1,\n          playerId: `loyal-${seed}`,\n          question: riskQuestion,\n          identity: identity('loyal_anchor'),\n        }) === 'c'\n      ) {\n        loyalAnchorHighRisk += 1\n      }\n    }\n    expect(riskTakerHighRisk).toBeGreaterThan(loyalAnchorHighRisk)\n  })\n\n  it('does not mass-eliminate a near-even 5-5-4 split', () => {\n    const activeIds = Array.from({ length: 14 }, (_, index) => `p${index + 1}`)\n    const answers = Object.fromEntries(\n      activeIds.map((id, index) => [id, index < 5 ? 'a' : index < 10 ? 'b' : 'c'])\n    )\n    const result = resolveMajorityRulesBallot({\n      activeIds,\n      answers,\n      question: partnerQuestion,\n      eliminationCount: 1,\n    })\n    expect(result.kind).toBe('split')\n    expect(result.eliminatedIds).toEqual([])\n  })\n\n  it('does not eliminate two tied minority groups at once', () => {\n    const activeIds = Array.from({ length: 14 }, (_, index) => `p${index + 1}`)\n    const answers = Object.fromEntries(\n      activeIds.map((id, index) => [id, index < 8 ? 'a' : index < 11 ? 'b' : 'c'])\n    )\n    const result = resolveMajorityRulesBallot({\n      activeIds,\n      answers,\n      question: partnerQuestion,\n      eliminationCount: 1,\n    })\n    expect(result.kind).toBe('split')\n    expect(result.eliminatedIds).toEqual([])\n  })\n\n  it('still eliminates a genuinely small minority', () => {\n    const activeIds = Array.from({ length: 14 }, (_, index) => `p${index + 1}`)\n    const answers = Object.fromEntries(\n      activeIds.map((id, index) => [id, index < 8 ? 'a' : index < 12 ? 'b' : 'c'])\n    )\n    const result = resolveMajorityRulesBallot({\n      activeIds,\n      answers,\n      question: partnerQuestion,\n      eliminationCount: 1,\n    })\n    expect(result.kind).toBe('elimination')\n    expect(result.eliminatedIds).toEqual(['p13', 'p14'])\n  })\n})\n""")
