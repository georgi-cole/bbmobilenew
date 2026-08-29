import { describe, expect, it } from 'vitest'
import {
  aiSkillForPlayer,
  generateAIQuestionGuess,
  generateAIResponseTimeMs,
} from '../src/features/cwgo/cwgoHelpers'
import {
  CWGO_QUESTIONS,
  CWGO_QUESTION_BANK_SCHEMA_VERSION,
} from '../src/features/cwgo/cwgoQuestions'

function questionById(id: string) {
  const question = CWGO_QUESTIONS.find((entry) => entry.id === id)
  if (!question) throw new Error(`Missing CWGO question ${id}`)
  return question
}

describe('CWGO question-bank contract', () => {
  it('has a versioned, serialisable and internally consistent schema', () => {
    expect(CWGO_QUESTION_BANK_SCHEMA_VERSION).toBe(1)
    expect(new Set(CWGO_QUESTIONS.map((question) => question.id)).size).toBe(CWGO_QUESTIONS.length)

    for (const question of CWGO_QUESTIONS) {
      expect(question.prompt.trim().length).toBeGreaterThan(0)
      expect(Number.isFinite(question.answer)).toBe(true)
      expect(question.answer).toBeGreaterThanOrEqual(question.min ?? 0)
      expect(question.answer).toBeLessThanOrEqual(question.max ?? Number.MAX_SAFE_INTEGER)
      expect(['common_knowledge', 'exact_fact', 'estimate']).toContain(question.answerMode)

      for (const mistake of question.plausibleMistakes ?? []) {
        expect(Number.isFinite(mistake)).toBe(true)
        expect(mistake).not.toBe(question.answer)
      }

      if (question.answerMode === 'common_knowledge') {
        expect(question.plausibleMistakes?.length ?? 0).toBeGreaterThan(0)
      }
    }
  })
})

describe('CWGO human-like AI answer model', () => {
  it('keeps non-leap-year answers exact or recognisably mistaken, never arbitrary noise', () => {
    const question = questionById('q09')
    const allowedAnswers = new Set([question.answer, ...(question.plausibleMistakes ?? [])])
    let exactAnswers = 0
    const trials = 2_000

    for (let seed = 1; seed <= trials; seed += 1) {
      const guess = generateAIQuestionGuess(question, 0.2, seed * 7919)
      expect(allowedAnswers.has(guess)).toBe(true)
      if (guess === question.answer) exactAnswers += 1
    }

    expect(exactAnswers / trials).toBeGreaterThanOrEqual(0.97)
  })

  it('does not invent values such as 727 or 840 for metres in a kilometre', () => {
    const question = questionById('q31')
    const allowedAnswers = new Set([question.answer, ...(question.plausibleMistakes ?? [])])

    for (let seed = 1; seed <= 1_000; seed += 1) {
      const guess = generateAIQuestionGuess(question, 0.35, seed * 104729)
      expect(allowedAnswers.has(guess)).toBe(true)
    }
  })

  it('preserves varied continuous answers for genuine estimation questions', () => {
    const question = questionById('q54')
    const guesses = new Set<number>()

    for (let seed = 1; seed <= 200; seed += 1) {
      guesses.add(generateAIQuestionGuess(question, 0.55, seed * 65537))
    }

    expect(guesses.size).toBeGreaterThan(50)
    expect([...guesses].some((guess) => guess !== question.answer)).toBe(true)
  })

  it('uses a stable contestant skill instead of resampling intelligence by difficulty', () => {
    expect(aiSkillForPlayer('nova')).toBe(aiSkillForPlayer('nova'))
    expect(aiSkillForPlayer('nova')).not.toBe(aiSkillForPlayer('dex'))
    expect(aiSkillForPlayer('nova')).toBeGreaterThanOrEqual(0.2)
    expect(aiSkillForPlayer('nova')).toBeLessThanOrEqual(0.95)
  })

  it('makes a known common fact deterministic but human-paced in the opening rounds', () => {
    const first = generateAIResponseTimeMs(1, 42, 'nova', 0, {
      answerMode: 'common_knowledge',
      knewAnswer: true,
      aiSkill: 0.7,
    })

    expect(first).toBe(
      generateAIResponseTimeMs(1, 42, 'nova', 0, {
        answerMode: 'common_knowledge',
        knewAnswer: true,
        aiSkill: 0.7,
      })
    )
    expect(first).toBeGreaterThanOrEqual(3_200)
    expect(first).toBeLessThanOrEqual(13_500)
  })
})
