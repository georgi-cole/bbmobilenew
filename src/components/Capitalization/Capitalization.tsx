import { useCallback, useEffect, useMemo, useRef, useState, type MutableRefObject } from 'react'
import type { GenericMinigameProps } from '../../minigames/reactComponents'
import { useI18n } from '../../i18n'
import MinigameRules from '../MinigameRules/MinigameRules'
import { getGame } from '../../minigames/registry'
import {
  CAPITALIZATION_CONTINENT_STYLES,
  CAPITALIZATION_LAND_SHAPES,
  type CapitalizationContinent,
} from './capitalizationData'
import {
  CAPITALIZATION_QUESTIONS_PER_CONTINENT,
  CAPITALIZATION_TOTAL_CONTINENTS,
  CAPITALIZATION_TOTAL_QUESTIONS,
  applyCapitalizationPerformance,
  buildCapitalizationQuestionSet,
  buildCapitalizationRawResults,
  createCapitalizationAiRng,
  createCapitalizationStandings,
  eliminateCapitalizationField,
  formatCapitalizationTimeMs,
  isCapitalAnswerAccepted,
  rankCapitalizationStandings,
  resolveCapitalizationRunSeed,
  simulateCapitalizationAiPerformance,
  type CapitalizationParticipant,
  type CapitalizationQuestion,
  type CapitalizationRoundPerformance,
  type CapitalizationStanding,
} from './capitalizationUtils'
import './Capitalization.css'
import InlineKeyboard from '../InlineKeyboard/InlineKeyboard'

const SPIN_DURATION_MS = 2600

type CapitalizationPhase = 'spinning' | 'question' | 'answerReview' | 'scoreboard'
type CapitalizationContext = 'loh' | 'battleBack'

interface CapitalizationProps extends GenericMinigameProps {
  context?: CapitalizationContext
}

interface CapitalizationScoreboard {
  question: CapitalizationQuestion
  standings: CapitalizationStanding[]
  eliminatedIds: string[]
  final: boolean
}

const FALLBACK_PARTICIPANTS: CapitalizationParticipant[] = [
  { id: 'human', name: 'You', isHuman: true, precomputedScore: 0 },
  { id: 'ai-atlas', name: 'Atlas Byte', isHuman: false, precomputedScore: 78 },
  { id: 'ai-mira', name: 'Mira Meridian', isHuman: false, precomputedScore: 72 },
  { id: 'ai-nova', name: 'Nova Nomad', isHuman: false, precomputedScore: 66 },
  { id: 'ai-rio', name: 'Rio Riddle', isHuman: false, precomputedScore: 60 },
  { id: 'ai-orbit', name: 'Orbit Oracle', isHuman: false, precomputedScore: 84 },
  { id: 'ai-vega', name: 'Vega Vale', isHuman: false, precomputedScore: 56 },
]

function resolveParticipants(
  participantIds?: string[],
  participants?: GenericMinigameProps['participants']
): CapitalizationParticipant[] {
  if (participants && participants.length > 0) {
    return participants.map((participant) => ({
      id: participant.id,
      name: participant.name,
      isHuman: participant.isHuman,
      precomputedScore: participant.precomputedScore,
    }))
  }

  if (participantIds && participantIds.length > 0) {
    return participantIds.map((id, index) => ({
      id,
      name: index === 0 ? 'You' : `Player ${index + 1}`,
      isHuman: index === 0,
      precomputedScore: 52 + index * 6,
    }))
  }

  return FALLBACK_PARTICIPANTS
}

export default function Capitalization({
  onFinish,
  participantIds,
  participants,
  seed,
  context = 'loh',
}: CapitalizationProps) {
  const { t } = useI18n()
  const resolvedParticipants = useMemo(
    () => resolveParticipants(participantIds, participants),
    [participantIds, participants]
  )
  const [fallbackRunSeed] = useState(() => resolveCapitalizationRunSeed(undefined))
  const runSeed = resolveCapitalizationRunSeed(seed, () => fallbackRunSeed)
  const questionSet = useMemo(() => buildCapitalizationQuestionSet(runSeed), [runSeed])
  const humanId = useMemo(
    () =>
      resolvedParticipants.find((participant) => participant.isHuman)?.id ??
      resolvedParticipants[0]?.id ??
      'human',
    [resolvedParticipants]
  )

  const [standings, setStandings] = useState<CapitalizationStanding[]>(() =>
    createCapitalizationStandings(resolvedParticipants)
  )
  const [questionIndex, setQuestionIndex] = useState(0)
  const [phase, setPhase] = useState<CapitalizationPhase>('spinning')
  const [answerInput, setAnswerInput] = useState('')
  const [attempts, setAttempts] = useState(0)
  const [feedback, setFeedback] = useState('The globe is choosing the next continent.')
  const [inputError, setInputError] = useState<string | null>(null)
  const [hintOptions, setHintOptions] = useState<string[] | null>(null)
  const [hintUsed, setHintUsed] = useState(false)
  const [autoAdvanceReview, setAutoAdvanceReview] = useState(false)
  const [scoreboard, setScoreboard] = useState<CapitalizationScoreboard | null>(null)
  const [nowMs, setNowMs] = useState(0)
  const [questionStartedAtMs, setQuestionStartedAtMs] = useState(0)
  const [rulesOpen, setRulesOpen] = useState(context === 'battleBack')
  const inputRef = useRef<HTMLInputElement | null>(null)
  const questionStartedAtRef = useRef(0)
  const completionFiredRef = useRef(false)
  const rulesGame = getGame('capitalization')

  const currentQuestion = questionSet.questions[questionIndex]
  const currentContinentIndex =
    Math.floor(questionIndex / CAPITALIZATION_QUESTIONS_PER_CONTINENT) + 1
  const humanStanding = standings.find((standing) => standing.participantId === humanId) ?? null
  const rankedStandings = useMemo(() => rankCapitalizationStandings(standings), [standings])
  const activeCount = standings.filter(
    (standing) => standing.eliminatedAfterQuestion === null
  ).length
  const elapsedMs =
    phase === 'question' && questionStartedAtMs > 0 ? nowMs - questionStartedAtMs : 0

  useEffect(() => {
    if (rulesOpen || phase !== 'spinning' || !currentQuestion) return

    const timer = window.setTimeout(() => {
      questionStartedAtRef.current = Date.now()
      setQuestionStartedAtMs(questionStartedAtRef.current)
      setNowMs(questionStartedAtRef.current)
      setPhase('question')
      setFeedback(`Name the capital of ${currentQuestion.name}.`)
      window.setTimeout(() => inputRef.current?.focus(), 0)
    }, SPIN_DURATION_MS)

    return () => window.clearTimeout(timer)
  }, [currentQuestion, phase, rulesOpen])

  useEffect(() => {
    if (phase !== 'question') return
    const timer = window.setInterval(() => setNowMs(Date.now()), 120)
    return () => window.clearInterval(timer)
  }, [phase])

  const finishCompetition = useCallback(
    (finalStandings: CapitalizationStanding[]) => {
      if (!onFinish || completionFiredRef.current) return
      completionFiredRef.current = true

      const ranked = rankCapitalizationStandings(finalStandings)
      const winner = ranked[0]
      const rawResults = buildCapitalizationRawResults(finalStandings)
      const humanRawValue = rawResults[humanId] ?? winner?.cumulativeScore ?? 0

      onFinish(humanRawValue, undefined, {
        authoritativeWinnerId: winner?.participantId ?? null,
        rawValue: humanRawValue,
        rawResults,
      })
    },
    [humanId, onFinish]
  )

  const resolveQuestion = useCallback(
    (humanPerformance: CapitalizationRoundPerformance) => {
      if (!currentQuestion || phase !== 'question') return

      const performanceByParticipantId: Record<string, CapitalizationRoundPerformance> = {
        [humanId]: humanPerformance,
      }
      const activeIds = new Set(
        standings
          .filter((standing) => standing.eliminatedAfterQuestion === null)
          .map((standing) => standing.participantId)
      )

      resolvedParticipants.forEach((participant) => {
        if (participant.isHuman || !activeIds.has(participant.id)) return
        performanceByParticipantId[participant.id] = simulateCapitalizationAiPerformance(
          {
            participant,
            question: currentQuestion,
          },
          createCapitalizationAiRng({
            seed: runSeed,
            participantId: participant.id,
            questionNumber: currentQuestion.questionNumber,
          })
        )
      })

      const scoredStandings = applyCapitalizationPerformance(standings, performanceByParticipantId)
      const shouldEliminate =
        currentQuestion.questionNumber % CAPITALIZATION_QUESTIONS_PER_CONTINENT === 0 &&
        currentQuestion.questionNumber < CAPITALIZATION_TOTAL_QUESTIONS
      const { standings: nextStandings, eliminatedIds } = shouldEliminate
        ? eliminateCapitalizationField(scoredStandings, currentQuestion.questionNumber)
        : { standings: scoredStandings, eliminatedIds: [] }
      const ranked = rankCapitalizationStandings(nextStandings)
      const final = currentQuestion.questionNumber >= CAPITALIZATION_TOTAL_QUESTIONS
      const checkpoint =
        final || currentQuestion.questionNumber % CAPITALIZATION_QUESTIONS_PER_CONTINENT === 0

      setStandings(nextStandings)
      setScoreboard({
        question: currentQuestion,
        standings: ranked,
        eliminatedIds,
        final,
      })
      setFeedback(
        humanPerformance.guessed
          ? `Correct. ${currentQuestion.capital} is the capital of ${currentQuestion.name}.`
          : humanPerformance.incorrect
            ? `Incorrect. ${currentQuestion.capital} is the capital of ${currentQuestion.name}.`
            : `Skipped. ${currentQuestion.capital} is the capital of ${currentQuestion.name}.`
      )
      setPhase(checkpoint ? 'scoreboard' : 'answerReview')
    },
    [currentQuestion, humanId, phase, resolvedParticipants, runSeed, standings]
  )

  const submitAnswer = useCallback(() => {
    if (!currentQuestion || phase !== 'question') return
    const trimmed = answerInput.trim()
    if (!trimmed) {
      setInputError('Enter a capital or skip.')
      return
    }

    const nextAttempts = attempts + 1
    setAttempts(nextAttempts)
    setInputError(null)

    if (!isCapitalAnswerAccepted(trimmed, currentQuestion)) {
      if (hintUsed) {
        setAutoAdvanceReview(true)
        setAnswerInput('')
        resolveQuestion({
          guessed: false,
          incorrect: true,
          attempts: nextAttempts,
          timeMs: Date.now() - questionStartedAtRef.current,
          hintUsed: true,
        })
        return
      }
      setFeedback(`No match for "${trimmed}". Try again or skip.`)
      setAnswerInput('')
      return
    }

    resolveQuestion({
      guessed: true,
      attempts: nextAttempts,
      timeMs: Date.now() - questionStartedAtRef.current,
      hintUsed,
    })
  }, [answerInput, attempts, currentQuestion, hintUsed, phase, resolveQuestion])

  const submitHintOption = useCallback(
    (option: string) => {
      if (!currentQuestion || phase !== 'question' || !hintUsed) return
      const nextAttempts = attempts + 1
      const guessed = isCapitalAnswerAccepted(option, currentQuestion)
      setAnswerInput(option)
      setAttempts(nextAttempts)
      setInputError(null)
      setAutoAdvanceReview(!guessed)
      resolveQuestion({
        guessed,
        incorrect: !guessed,
        attempts: nextAttempts,
        timeMs: Date.now() - questionStartedAtRef.current,
        hintUsed: true,
      })
    },
    [attempts, currentQuestion, hintUsed, phase, resolveQuestion]
  )

  const requestHint = useCallback(() => {
    if (!currentQuestion || phase !== 'question' || hintUsed) return
    const distractors = Array.from(
      new Set(
        questionSet.questions
          .map((question) => question.capital)
          .filter((capital) => capital !== currentQuestion.capital)
      )
    )
    const start = (runSeed + currentQuestion.questionNumber) % Math.max(1, distractors.length)
    const picked = [
      distractors[start],
      distractors[(start + 3) % Math.max(1, distractors.length)],
    ].filter((value): value is string => Boolean(value))
    const options = Array.from(new Set([currentQuestion.capital, ...picked])).slice(0, 3)
    const correctPosition = (runSeed ^ currentQuestion.questionNumber) % options.length
    const correct = options.shift()
    if (correct) options.splice(correctPosition, 0, correct)
    setHintOptions(options)
    setHintUsed(true)
    setAutoAdvanceReview(false)
    setFeedback('Hint used — choose once. A wrong choice scores 0 and ends the question.')
  }, [currentQuestion, hintUsed, phase, questionSet.questions, runSeed])

  const skipQuestion = useCallback(() => {
    if (!currentQuestion || phase !== 'question') return
    resolveQuestion({
      guessed: false,
      skipped: true,
      attempts: Math.max(1, attempts),
      timeMs: Date.now() - questionStartedAtRef.current,
      hintUsed,
    })
  }, [attempts, currentQuestion, hintUsed, phase, resolveQuestion])

  const continueFromScoreboard = useCallback(() => {
    if (!scoreboard) return
    if (scoreboard.final) {
      finishCompetition(scoreboard.standings)
      return
    }
    const nextQuestion = questionSet.questions[questionIndex + 1]
    setAnswerInput('')
    setAttempts(0)
    setInputError(null)
    setHintOptions(null)
    setHintUsed(false)
    setAutoAdvanceReview(false)
    setScoreboard(null)
    setQuestionStartedAtMs(0)
    setFeedback(`The globe is landing on ${nextQuestion?.continent ?? 'the next continent'}.`)
    setQuestionIndex((index) => index + 1)
    setPhase('spinning')
  }, [finishCompetition, questionIndex, questionSet.questions, scoreboard])

  useEffect(() => {
    if (phase !== 'answerReview' || !autoAdvanceReview || !scoreboard) return undefined
    const timer = window.setTimeout(continueFromScoreboard, 1200)
    return () => window.clearTimeout(timer)
  }, [autoAdvanceReview, continueFromScoreboard, phase, scoreboard])

  const winner = scoreboard?.standings[0] ?? rankedStandings[0] ?? null
  const inputDisabled = phase !== 'question'
  const showCheckpoint = phase === 'scoreboard' && scoreboard
  const showGlobe = phase === 'spinning'
  const isBattleBackContext = context === 'battleBack'
  const rootClassName = ['capitalization', `capitalization--${phase}`].join(' ')

  return (
    <>
      {rulesOpen && rulesGame && (
        <MinigameRules
          game={rulesGame}
          confirmLabel={t('capitalization.startBattleBack')}
          onConfirm={() => setRulesOpen(false)}
        />
      )}
      <div className={rootClassName} data-testid="capitalization-root">
        <div className="capitalization__shell">
          <header className="capitalization__header">
            <div>
              <p className="capitalization__eyebrow">
                {isBattleBackContext
                  ? t('capitalization.mode.battleBack')
                  : t('capitalization.mode.standard')}
              </p>
              <h2 className="capitalization__title">
                {phase === 'spinning'
                  ? t('capitalization.phase.globeSpin')
                  : phase === 'scoreboard' && scoreboard?.final
                    ? t('capitalization.phase.finalScoreboard')
                    : phase === 'scoreboard'
                      ? t('capitalization.phase.checkpoint')
                      : phase === 'answerReview'
                        ? t('capitalization.phase.answerRevealed')
                        : t('capitalization.phase.nameCapital')}
              </h2>
            </div>
            <div className="capitalization__meta" aria-live="polite">
              <span>
                {t('capitalization.meta.question', {
                  current: currentQuestion?.questionNumber ?? 0,
                  total: CAPITALIZATION_TOTAL_QUESTIONS,
                })}
              </span>
              <span>
                {t('capitalization.meta.continent', {
                  current: Math.min(currentContinentIndex, CAPITALIZATION_TOTAL_CONTINENTS),
                  total: CAPITALIZATION_TOTAL_CONTINENTS,
                })}
              </span>
              <span>{t('capitalization.meta.alive', { count: activeCount })}</span>
            </div>
          </header>

          {showCheckpoint ? (
            <Scoreboard
              scoreboard={scoreboard}
              winner={winner}
              onContinue={continueFromScoreboard}
              context={context}
            />
          ) : (
            <section
              className={[
                'capitalization__arena',
                showGlobe ? 'capitalization__arena--spinning' : 'capitalization__arena--focused',
              ].join(' ')}
              aria-label={t('capitalization.aria.game')}
            >
              {showGlobe && (
                <div className="capitalization__globe-panel">
                  <CapitalizationGlobe question={currentQuestion} phase={phase} />
                  <div className="capitalization__globe-caption" aria-live="polite">
                    {t('capitalization.finding', {
                      continent: currentQuestion?.continent ?? t('capitalization.unknownContinent'),
                    })}
                  </div>
                </div>
              )}

              {!showGlobe && (
                <section
                  className="capitalization__question-panel"
                  aria-label={t('capitalization.aria.question')}
                >
                  <div className="capitalization__country-strip">
                    <span
                      className="capitalization__flag"
                      aria-label={
                        currentQuestion
                          ? t('capitalization.aria.flag', { country: currentQuestion.name })
                          : t('capitalization.flag')
                      }
                    >
                      {currentQuestion?.flag ?? '?'}
                    </span>
                    <div>
                      <p className="capitalization__continent-label">
                        {currentQuestion?.continent ?? t('capitalization.awaitingContinent')}
                      </p>
                      <h3 className="capitalization__country-name">
                        {currentQuestion?.name ?? t('capitalization.country')}
                      </h3>
                    </div>
                  </div>

                  <div
                    className="capitalization__stats"
                    aria-label={t('capitalization.aria.roundStats')}
                  >
                    <div>
                      <span>{t('capitalization.timer')}</span>
                      <strong>{formatCapitalizationTimeMs(elapsedMs)}</strong>
                    </div>
                    <div>
                      <span>{t('capitalization.attempts')}</span>
                      <strong>{attempts}</strong>
                    </div>
                    <div>
                      <span>{t('capitalization.yourScore')}</span>
                      <strong>{humanStanding?.cumulativeScore ?? 0}</strong>
                    </div>
                  </div>

                  {phase === 'question' && (
                    <form
                      className="capitalization__answer-form"
                      onSubmit={(event) => {
                        event.preventDefault()
                        submitAnswer()
                      }}
                    >
                      <label htmlFor="capitalization-answer">
                        {t('capitalization.capitalCity')}
                      </label>
                      <div className="capitalization__answer-row">
                        <input
                          ref={inputRef}
                          id="capitalization-answer"
                          type="text"
                          inputMode="none"
                          readOnly
                          value={answerInput}
                          disabled={inputDisabled}
                          onChange={(event) => setAnswerInput(event.target.value)}
                          aria-label={t('capitalization.aria.capitalAnswer')}
                        />
                        <button type="submit" disabled={inputDisabled}>
                          {t('common.submit')}
                        </button>
                        <button type="button" disabled={inputDisabled} onClick={skipQuestion}>
                          {t('common.skip')}
                        </button>
                        <button
                          type="button"
                          disabled={inputDisabled || hintUsed}
                          onClick={requestHint}
                        >
                          {t('capitalization.hintHalf')}
                        </button>
                      </div>
                      <InlineKeyboard value={answerInput} onChange={setAnswerInput} onSubmit={submitAnswer} disabled={inputDisabled} />
                      {hintOptions && (
                        <div
                          className="capitalization__hint-options"
                          aria-label={t('capitalization.aria.hintOptions')}
                        >
                          {hintOptions.map((option) => (
                            <button
                              key={option}
                              type="button"
                              onClick={() => submitHintOption(option)}
                            >
                              {option}
                            </button>
                          ))}
                        </div>
                      )}
                      {inputError && <p className="capitalization__error">{inputError}</p>}
                    </form>
                  )}

                  <div className="capitalization__feedback" aria-live="polite">
                    {feedback}
                  </div>

                  {phase === 'answerReview' && scoreboard && (
                    <AnswerReview scoreboard={scoreboard} onContinue={continueFromScoreboard} />
                  )}

                  {currentQuestion && (
                    <div className="capitalization__location">
                      <span>{t('capitalization.location')}</span>
                      <strong>
                        {Math.abs(currentQuestion.latitude).toFixed(1)}
                        {t('capitalization.degrees')}{' '}
                        {t(
                          currentQuestion.latitude >= 0
                            ? 'capitalization.direction.north'
                            : 'capitalization.direction.south'
                        )}{' '}
                        {Math.abs(currentQuestion.longitude).toFixed(1)}
                        {t('capitalization.degrees')}{' '}
                        {t(
                          currentQuestion.longitude >= 0
                            ? 'capitalization.direction.east'
                            : 'capitalization.direction.west'
                        )}
                      </strong>
                    </div>
                  )}
                </section>
              )}
            </section>
          )}
        </div>
      </div>
    </>
  )
}

function AnswerReview({
  scoreboard,
  onContinue,
}: {
  scoreboard: CapitalizationScoreboard
  onContinue: () => void
}) {
  return (
    <section className="capitalization__answer-review" aria-label="Answer result">
      <div>
        <p className="capitalization__eyebrow">
          Question {scoreboard.question.questionNumber} complete
        </p>
        <h3>{scoreboard.question.capital}</h3>
      </div>
      <button type="button" onClick={onContinue}>
        Continue
      </button>
    </section>
  )
}

function Scoreboard({
  scoreboard,
  winner,
  onContinue,
  context,
}: {
  scoreboard: CapitalizationScoreboard
  winner: CapitalizationStanding | null
  onContinue: () => void
  context: CapitalizationContext
}) {
  const eliminatedNames = scoreboard.eliminatedIds
    .map(
      (id) =>
        scoreboard.standings.find((standing) => standing.participantId === id)?.participantName ??
        id
    )
    .join(', ')
  const isBattleBackContext = context === 'battleBack'
  const finalWinnerSummary = isBattleBackContext
    ? `${winner?.participantName ?? 'A player'} has won the right to return to the game.`
    : `${winner?.participantName ?? 'A player'} is ready to be crowned LOH.`

  return (
    <section
      className="capitalization__scoreboard"
      aria-label={scoreboard.final ? 'Final standings' : 'Round standings'}
    >
      {scoreboard.final && winner && (
        <div className="capitalization__winner-line">
          🏆 {winner.participantName} wins with {winner.cumulativeScore} points
        </div>
      )}
      <div className="capitalization__scoreboard-copy">
        <p className="capitalization__eyebrow">
          {scoreboard.final
            ? 'Question 9 complete'
            : `Question ${scoreboard.question.questionNumber} complete`}
        </p>
        <h3>{scoreboard.question.capital}</h3>
        <p>
          {scoreboard.final
            ? finalWinnerSummary
            : eliminatedNames
              ? `Eliminated before the next continent: ${eliminatedNames}.`
              : 'No elimination before the next continent.'}
        </p>
      </div>

      <ol className="capitalization__standings-list">
        {scoreboard.standings.map((standing, index) => {
          const eliminatedNow = scoreboard.eliminatedIds.includes(standing.participantId)
          const eliminated = standing.eliminatedAfterQuestion !== null
          const status =
            scoreboard.final && index === 0
              ? isBattleBackContext
                ? 'Winner'
                : 'LOH'
              : eliminatedNow
                ? 'Eliminated'
                : eliminated
                  ? `Out Q${standing.eliminatedAfterQuestion}`
                  : 'Alive'

          return (
            <li
              key={standing.participantId}
              className={[
                'capitalization__standing-card',
                standing.isHuman ? 'capitalization__standing-card--human' : '',
                index === 0 ? 'capitalization__standing-card--leader' : '',
                eliminated ? 'capitalization__standing-card--eliminated' : '',
              ]
                .filter(Boolean)
                .join(' ')}
            >
              <span className="capitalization__rank">
                {index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : index + 1}
              </span>
              <div className="capitalization__standing-main">
                <strong>{standing.isHuman ? 'You' : standing.participantName}</strong>
                <span>
                  {standing.correctAnswers}/{standing.questionsPlayed} correct ·{' '}
                  {standing.hintsUsed} hint{standing.hintsUsed === 1 ? '' : 's'} · last round{' '}
                  {standing.lastQuestionScore}
                </span>
              </div>
              <div className="capitalization__standing-score">
                <strong>{standing.cumulativeScore}</strong>
                <span>
                  {status} · {standing.hintsUsed} hint{standing.hintsUsed === 1 ? '' : 's'}
                </span>
              </div>
            </li>
          )
        })}
      </ol>

      <div className="capitalization__footer">
        <span>
          {scoreboard.final
            ? isBattleBackContext
              ? `${winner?.participantName ?? 'Winner'} tops the final board.`
              : `${winner?.participantName ?? 'Winner'} leads the final board.`
            : 'Next globe spin starts when you continue.'}
        </span>
        <button type="button" onClick={onContinue}>
          {scoreboard.final && !isBattleBackContext ? 'Crown LOH' : 'Continue'}
        </button>
      </div>
    </section>
  )
}
function CapitalizationGlobe({
  question,
  phase,
}: {
  question?: CapitalizationQuestion
  phase: CapitalizationPhase
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const viewRef = useRef({ latitude: 8, longitude: 0 })
  const spinRef = useRef<{
    startedAt: number
    fromLatitude: number
    fromLongitude: number
    toLatitude: number
    toLongitude: number
  } | null>(null)

  useEffect(() => {
    if (!question) return
    const center = CAPITALIZATION_CONTINENT_STYLES[question.continent].center
    spinRef.current = {
      startedAt: performance.now(),
      fromLatitude: viewRef.current.latitude,
      fromLongitude: viewRef.current.longitude,
      toLatitude: center.latitude,
      toLongitude: center.longitude + 720 + (question.questionNumber % 2) * 180,
    }
  }, [question?.questionNumber, question])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    let frame = 0
    const draw = (now: number) => {
      renderGlobe(ctx, canvas, now, viewRef, spinRef, question, phase)
      frame = requestAnimationFrame(draw)
    }
    frame = requestAnimationFrame(draw)
    return () => cancelAnimationFrame(frame)
  }, [phase, question])

  return <canvas ref={canvasRef} className="capitalization__globe" aria-hidden="true" />
}

function renderGlobe(
  ctx: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  now: number,
  viewRef: MutableRefObject<{ latitude: number; longitude: number }>,
  spinRef: MutableRefObject<{
    startedAt: number
    fromLatitude: number
    fromLongitude: number
    toLatitude: number
    toLongitude: number
  } | null>,
  question: CapitalizationQuestion | undefined,
  phase: CapitalizationPhase
) {
  const rect = canvas.getBoundingClientRect()
  const scale = window.devicePixelRatio || 1
  const width = Math.max(320, Math.floor(rect.width * scale))
  const height = Math.max(320, Math.floor(rect.height * scale))
  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width
    canvas.height = height
  }

  const view = viewRef.current
  const spin = spinRef.current
  if (spin) {
    const progress = Math.min(1, (now - spin.startedAt) / SPIN_DURATION_MS)
    const eased = easeOutCubic(progress)
    view.latitude = lerp(spin.fromLatitude, spin.toLatitude, eased)
    view.longitude = lerp(spin.fromLongitude, spin.toLongitude, eased)
    if (progress >= 1) {
      view.latitude = spin.toLatitude
      view.longitude = normalizeLongitude(spin.toLongitude)
      spinRef.current = null
    }
  } else if (phase === 'spinning') {
    view.longitude = normalizeLongitude(view.longitude + 0.28)
  }

  ctx.setTransform(scale, 0, 0, scale, 0, 0)
  const viewWidth = width / scale
  const viewHeight = height / scale
  const cx = viewWidth / 2
  const cy = viewHeight / 2
  const radius = Math.min(viewWidth, viewHeight) * 0.39

  ctx.clearRect(0, 0, viewWidth, viewHeight)
  drawSpace(ctx, viewWidth, viewHeight)
  drawSphere(ctx, cx, cy, radius)

  ctx.save()
  ctx.beginPath()
  ctx.arc(cx, cy, radius, 0, Math.PI * 2)
  ctx.clip()
  drawGrid(ctx, cx, cy, radius, view)
  drawLand(ctx, cx, cy, radius, view, question?.continent)
  if (question && phase !== 'spinning') {
    drawMarker(ctx, cx, cy, radius, view, question.latitude, question.longitude)
  }
  ctx.restore()

  ctx.beginPath()
  ctx.arc(cx, cy, radius, 0, Math.PI * 2)
  ctx.lineWidth = 2
  ctx.strokeStyle = 'rgba(255,255,255,0.32)'
  ctx.stroke()

  ctx.beginPath()
  ctx.arc(cx - radius * 0.18, cy - radius * 0.16, radius * 0.92, 0, Math.PI * 2)
  ctx.lineWidth = radius * 0.14
  ctx.strokeStyle = 'rgba(255,255,255,0.055)'
  ctx.stroke()
}

function drawSpace(ctx: CanvasRenderingContext2D, width: number, height: number) {
  ctx.fillStyle = '#091113'
  ctx.fillRect(0, 0, width, height)
  ctx.fillStyle = 'rgba(255,255,255,0.38)'
  for (let index = 0; index < 54; index += 1) {
    const x = (index * 139 + 29) % width
    const y = (index * 83 + 47) % height
    const size = index % 5 === 0 ? 1.8 : 1
    ctx.globalAlpha = 0.28 + ((index * 7) % 10) / 22
    ctx.fillRect(x, y, size, size)
  }
  ctx.globalAlpha = 1
}

function drawSphere(ctx: CanvasRenderingContext2D, cx: number, cy: number, radius: number) {
  const ocean = ctx.createRadialGradient(
    cx - radius * 0.32,
    cy - radius * 0.36,
    radius * 0.2,
    cx,
    cy,
    radius
  )
  ocean.addColorStop(0, '#34a9db')
  ocean.addColorStop(0.58, '#0b668f')
  ocean.addColorStop(1, '#062b42')
  ctx.beginPath()
  ctx.arc(cx, cy, radius, 0, Math.PI * 2)
  ctx.fillStyle = ocean
  ctx.fill()
}

function drawGrid(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  radius: number,
  view: { latitude: number; longitude: number }
) {
  ctx.lineWidth = 1
  ctx.strokeStyle = 'rgba(255,255,255,0.12)'
  for (let latitude = -60; latitude <= 60; latitude += 30) {
    drawProjectedLine(
      ctx,
      Array.from({ length: 73 }, (_, index) => ({
        latitude,
        longitude: -180 + index * 5,
      })),
      cx,
      cy,
      radius,
      view
    )
  }
  for (let longitude = -180; longitude < 180; longitude += 30) {
    drawProjectedLine(
      ctx,
      Array.from({ length: 37 }, (_, index) => ({
        latitude: -90 + index * 5,
        longitude,
      })),
      cx,
      cy,
      radius,
      view
    )
  }
}

function drawLand(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  radius: number,
  view: { latitude: number; longitude: number },
  highlightedContinent?: CapitalizationContinent
) {
  CAPITALIZATION_LAND_SHAPES.forEach((shape) => {
    const color = CAPITALIZATION_CONTINENT_STYLES[shape.continent].color
    const highlighted = highlightedContinent === shape.continent
    ctx.beginPath()
    let hasVisible = false
    shape.points.forEach(([longitude, latitude]) => {
      const projected = project(latitude, longitude, cx, cy, radius, view)
      if (!projected.visible) return
      if (!hasVisible) ctx.moveTo(projected.x, projected.y)
      else ctx.lineTo(projected.x, projected.y)
      hasVisible = true
    })
    if (!hasVisible) return
    ctx.closePath()
    ctx.fillStyle = highlighted ? color : blendHex(color, 0.58)
    ctx.globalAlpha = highlighted ? 0.92 : 0.62
    ctx.fill()
    ctx.globalAlpha = 1
    ctx.lineWidth = highlighted ? 2.4 : 1
    ctx.strokeStyle = highlighted ? 'rgba(255,255,255,0.74)' : 'rgba(255,255,255,0.24)'
    ctx.stroke()
  })
}

function drawMarker(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  radius: number,
  view: { latitude: number; longitude: number },
  latitude: number,
  longitude: number
) {
  const projected = project(latitude, longitude, cx, cy, radius, view)
  if (!projected.visible) return
  ctx.beginPath()
  ctx.arc(projected.x, projected.y, 13, 0, Math.PI * 2)
  ctx.fillStyle = 'rgba(243,199,95,0.24)'
  ctx.fill()
  ctx.beginPath()
  ctx.arc(projected.x, projected.y, 6, 0, Math.PI * 2)
  ctx.fillStyle = '#f3c75f'
  ctx.fill()
  ctx.lineWidth = 2
  ctx.strokeStyle = '#1c1609'
  ctx.stroke()
}

function drawProjectedLine(
  ctx: CanvasRenderingContext2D,
  points: Array<{ latitude: number; longitude: number }>,
  cx: number,
  cy: number,
  radius: number,
  view: { latitude: number; longitude: number }
) {
  let drawing = false
  ctx.beginPath()
  points.forEach((point) => {
    const projected = project(point.latitude, point.longitude, cx, cy, radius, view)
    if (!projected.visible) {
      drawing = false
      return
    }
    if (!drawing) {
      ctx.moveTo(projected.x, projected.y)
      drawing = true
    } else {
      ctx.lineTo(projected.x, projected.y)
    }
  })
  ctx.stroke()
}

function project(
  latitude: number,
  longitude: number,
  cx: number,
  cy: number,
  radius: number,
  view: { latitude: number; longitude: number }
) {
  const latRad = toRad(latitude)
  const lonRad = toRad(longitude - view.longitude)
  const centerLatRad = toRad(view.latitude)
  const cosLat = Math.cos(latRad)
  const sinLat = Math.sin(latRad)
  const cosCenter = Math.cos(centerLatRad)
  const sinCenter = Math.sin(centerLatRad)
  const x = cosLat * Math.sin(lonRad)
  const y = sinLat * cosCenter - cosLat * Math.cos(lonRad) * sinCenter
  const z = sinLat * sinCenter + cosLat * Math.cos(lonRad) * cosCenter

  return {
    x: cx + radius * x,
    y: cy - radius * y,
    visible: z > -0.05,
  }
}

function blendHex(hex: string, amount: number): string {
  const clean = hex.replace('#', '')
  const red = Number.parseInt(clean.slice(0, 2), 16)
  const green = Number.parseInt(clean.slice(2, 4), 16)
  const blue = Number.parseInt(clean.slice(4, 6), 16)
  return `rgb(${Math.round(red * amount)}, ${Math.round(green * amount)}, ${Math.round(blue * amount)})`
}

function toRad(value: number): number {
  return (value * Math.PI) / 180
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t
}

function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - t, 3)
}

function normalizeLongitude(longitude: number): number {
  return ((((longitude + 180) % 360) + 360) % 360) - 180
}
