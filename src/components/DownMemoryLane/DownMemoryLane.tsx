import { useEffect, useMemo, useRef, useState } from 'react'
import { useAppSelector } from '../../store/hooks'
import { useResolvedAvatarSrc } from '../../hooks/useResolvedAvatarSrc'
import type { GenericMinigameProps } from '../../minigames/reactComponents'
import { resolvePresentationAvatarCandidates } from '../../utils/presentationAvatar'
import {
  buildMemoryLanePreviewBank,
  buildMemoryLaneQuestionBank,
  deriveMemoryLaneAiAbility,
  simulateMemoryLaneAiDecision,
  type MemoryLaneAiDecision,
  type MemoryLaneQuestion,
} from './downMemoryLaneLogic'
import './DownMemoryLane.css'

const STARTING_LIVES = 5
const OPEN_BUZZ_WINDOW_MS = 8_000
const HUMAN_ANSWER_WINDOW_MS = 6_000
const BETWEEN_QUESTIONS_MS = 1_450

interface MemoryLanePortraitProps {
  id: string
  name: string
  avatar: string
  isUser?: boolean
  alt: string
}

function MemoryLanePortrait({ id, name, avatar, isUser, alt }: MemoryLanePortraitProps) {
  const { candidates: baseCandidates } = useResolvedAvatarSrc({ id, name, avatar, isUser })
  const candidates = [
    ...new Set(
      baseCandidates.flatMap((candidate) => [
        ...resolvePresentationAvatarCandidates(candidate),
        candidate,
      ])
    ),
  ]
  const nonDiceBear = candidates.filter((candidate) => !candidate.includes('api.dicebear.com'))
  const orderedCandidates = nonDiceBear.length > 0 ? nonDiceBear : candidates
  const candidateKey = orderedCandidates.join('|')
  const [candidateIndex, setCandidateIndex] = useState(0)

  useEffect(() => {
    setCandidateIndex(0)
  }, [candidateKey])

  const src = orderedCandidates[Math.min(candidateIndex, Math.max(0, orderedCandidates.length - 1))]
  if (!src) return <span aria-hidden="true">👤</span>

  return (
    <img
      src={src}
      alt={alt}
      onError={() =>
        setCandidateIndex((current) =>
          current + 1 < orderedCandidates.length ? current + 1 : current
        )
      }
    />
  )
}

function LifePips({ lives, side }: { lives: number; side: 'human' | 'ai' }) {
  return (
    <div className={`memory-lane__lives is-${side}`} aria-label={`${lives} lives remaining`}>
      {Array.from({ length: STARTING_LIVES }, (_, index) => (
        <span key={index} className={index < lives ? 'is-live' : 'is-lost'} />
      ))}
    </div>
  )
}

export default function DownMemoryLane({
  seed = 424242,
  participantIds = [],
  participants = [],
  onFinish,
}: GenericMinigameProps) {
  const game = useAppSelector((state) => state.game)

  const duelists = useMemo(() => {
    const ordered = participantIds
      .map((id) => participants.find((participant) => participant.id === id))
      .filter((participant): participant is NonNullable<typeof participant> => Boolean(participant))
    const source = ordered.length >= 2 ? ordered : participants
    const human = source.find((participant) => participant.isHuman) ?? source[0]
    const ai = source.find((participant) => participant.id !== human?.id) ?? source[1]
    return { human, ai }
  }, [participantIds, participants])

  const realQuestionBank = useMemo(() => buildMemoryLaneQuestionBank(game, seed), [game, seed])
  const usingLabPreview = import.meta.env.DEV && realQuestionBank.length < 4
  const questionBank = useMemo(
    () =>
      usingLabPreview
        ? buildMemoryLanePreviewBank(game.players, seed ^ 0x6d656d6f)
        : realQuestionBank,
    [game.players, realQuestionBank, seed, usingLabPreview]
  )

  const [screen, setScreen] = useState<'tutorial' | 'duel' | 'finished'>('tutorial')
  const [practiceDone, setPracticeDone] = useState(false)
  const [questionIndex, setQuestionIndex] = useState(0)
  const [humanLives, setHumanLives] = useState(STARTING_LIVES)
  const [aiLives, setAiLives] = useState(STARTING_LIVES)
  const [buzzOwner, setBuzzOwner] = useState<'human' | 'ai' | null>(null)
  const [aiPendingDecision, setAiPendingDecision] = useState<MemoryLaneAiDecision | null>(null)
  const [selectedAnswer, setSelectedAnswer] = useState<string | null>(null)
  const [feedback, setFeedback] = useState<string | null>(null)
  const [feedbackTone, setFeedbackTone] = useState<'good' | 'bad' | 'neutral'>('neutral')
  const [humanAnswerRemaining, setHumanAnswerRemaining] = useState(HUMAN_ANSWER_WINDOW_MS)
  const [winnerId, setWinnerId] = useState<string | null>(null)
  const timerRefs = useRef<number[]>([])

  const clearTimers = () => {
    timerRefs.current.forEach((timer) => window.clearTimeout(timer))
    timerRefs.current = []
  }

  useEffect(() => clearTimers, [])

  const currentQuestion: MemoryLaneQuestion | null =
    questionBank.length > 0 ? questionBank[questionIndex % questionBank.length] : null
  const memoryNumber = questionIndex + 1
  const questionCycle =
    questionBank.length > 0 ? Math.floor(questionIndex / questionBank.length) : 0

  const gamePlayersById = useMemo(
    () => new Map(game.players.map((player) => [player.id, player])),
    [game.players]
  )

  const opponentAbility = useMemo(() => {
    const profile = gamePlayersById.get(duelists.ai?.id ?? '')?.competitionProfile
    return deriveMemoryLaneAiAbility(profile)
  }, [duelists.ai?.id, gamePlayersById])

  const advanceQuestion = () => {
    clearTimers()
    setBuzzOwner(null)
    setAiPendingDecision(null)
    setSelectedAnswer(null)
    setFeedback(null)
    setFeedbackTone('neutral')
    setHumanAnswerRemaining(HUMAN_ANSWER_WINDOW_MS)
    setQuestionIndex((current) => current + 1)
  }

  const finishDuel = (nextWinnerId: string, nextHumanLives: number, nextAiLives: number) => {
    clearTimers()
    setWinnerId(nextWinnerId)
    setHumanLives(nextHumanLives)
    setAiLives(nextAiLives)
    setScreen('finished')
  }

  const applyDamage = (answeredBy: 'human' | 'ai', correct: boolean, answerId: string) => {
    if (!currentQuestion || !duelists.human || !duelists.ai || feedback) return

    setSelectedAnswer(answerId)
    const answerName =
      gamePlayersById.get(answerId)?.name ??
      participants.find((participant) => participant.id === answerId)?.name ??
      (answerId === '__timeout__' ? 'No answer' : 'That answer')

    if (answeredBy === 'human') {
      if (correct) {
        const nextAiLives = Math.max(0, aiLives - 1)
        setAiLives(nextAiLives)
        setFeedback(`${answerName} — correct. ${duelists.ai.name} loses a life.`)
        setFeedbackTone('good')
        if (nextAiLives === 0) {
          timerRefs.current.push(
            window.setTimeout(() => finishDuel(duelists.human!.id, humanLives, nextAiLives), 900)
          )
          return
        }
      } else {
        const nextHumanLives = Math.max(0, humanLives - 1)
        setHumanLives(nextHumanLives)
        setFeedback(
          answerId === '__timeout__'
            ? 'Too late after buzzing. You lose a life.'
            : `${answerName} — wrong. You lose a life.`
        )
        setFeedbackTone('bad')
        if (nextHumanLives === 0) {
          timerRefs.current.push(
            window.setTimeout(() => finishDuel(duelists.ai!.id, nextHumanLives, aiLives), 900)
          )
          return
        }
      }
    } else if (correct) {
      const nextHumanLives = Math.max(0, humanLives - 1)
      setHumanLives(nextHumanLives)
      setFeedback(`${duelists.ai.name} got it right. You lose a life.`)
      setFeedbackTone('bad')
      if (nextHumanLives === 0) {
        timerRefs.current.push(
          window.setTimeout(() => finishDuel(duelists.ai!.id, nextHumanLives, aiLives), 900)
        )
        return
      }
    } else {
      const nextAiLives = Math.max(0, aiLives - 1)
      setAiLives(nextAiLives)
      setFeedback(`${duelists.ai.name} missed it and loses a life.`)
      setFeedbackTone('good')
      if (nextAiLives === 0) {
        timerRefs.current.push(
          window.setTimeout(() => finishDuel(duelists.human!.id, humanLives, nextAiLives), 900)
        )
        return
      }
    }

    timerRefs.current.push(window.setTimeout(advanceQuestion, BETWEEN_QUESTIONS_MS))
  }

  useEffect(() => {
    if (
      screen !== 'duel' ||
      !currentQuestion ||
      buzzOwner ||
      feedback ||
      !duelists.ai ||
      !duelists.human
    ) {
      return
    }

    clearTimers()
    const aiDecision = simulateMemoryLaneAiDecision({
      seed: seed + questionIndex * 977 + questionCycle * 7919,
      question: currentQuestion,
      aiPlayerId: duelists.ai.id,
      aiAbility: opponentAbility,
      aiLives,
      humanLives,
    })

    if (aiDecision.willBuzz) {
      const aiTimer = window.setTimeout(() => {
        setAiPendingDecision(aiDecision)
        setBuzzOwner('ai')
      }, aiDecision.delayMs)
      timerRefs.current.push(aiTimer)
    }

    const expireTimer = window.setTimeout(() => {
      setFeedback('Nobody buzzed. That memory is gone.')
      setFeedbackTone('neutral')
      timerRefs.current.push(window.setTimeout(advanceQuestion, 850))
    }, OPEN_BUZZ_WINDOW_MS)
    timerRefs.current.push(expireTimer)

    return clearTimers
    // Deliberately keyed to the question and owner; lives are captured for the current round.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [screen, questionIndex, currentQuestion?.id, buzzOwner])

  useEffect(() => {
    if (screen !== 'duel' || buzzOwner !== 'ai' || !aiPendingDecision || feedback) return
    const timer = window.setTimeout(() => {
      applyDamage('ai', aiPendingDecision.correct, aiPendingDecision.answerPlayerId)
    }, 720)
    return () => window.clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [buzzOwner, aiPendingDecision, screen])

  useEffect(() => {
    if (screen !== 'duel' || buzzOwner !== 'human' || feedback) return
    setHumanAnswerRemaining(HUMAN_ANSWER_WINDOW_MS)
    const interval = window.setInterval(() => {
      setHumanAnswerRemaining((current) => Math.max(0, current - 100))
    }, 100)
    const timeout = window.setTimeout(() => {
      window.clearInterval(interval)
      if (currentQuestion) applyDamage('human', false, '__timeout__')
    }, HUMAN_ANSWER_WINDOW_MS)
    return () => {
      window.clearInterval(interval)
      window.clearTimeout(timeout)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [buzzOwner, screen])

  if (!duelists.human || !duelists.ai) {
    return (
      <div className="memory-lane memory-lane--empty">
        <strong>Down Memory Lane needs two finalists.</strong>
      </div>
    )
  }

  if (questionBank.length < 4) {
    return (
      <div className="memory-lane memory-lane--empty">
        <strong>Not enough season history yet.</strong>
        <span>This duel only uses questions with one clear answer.</span>
      </div>
    )
  }

  if (screen === 'tutorial') {
    return (
      <div className="memory-lane memory-lane--tutorial">
        <div className="memory-lane__aurora" aria-hidden="true" />
        <p className="memory-lane__kicker">Final 3 · Part 3</p>
        <h1>Down Memory Lane</h1>
        <p className="memory-lane__lede">
          Five lives each. Buzz first, then choose the hubmate who matches the season memory.
        </p>
        {usingLabPreview && (
          <div className="memory-lane__preview-note">
            Minigame Lab preview · practice questions are being used because no season has been
            played here yet.
          </div>
        )}
        <div className="memory-lane__tutorial-rule">
          <span>✓ Correct</span>
          <strong>Opponent −1 life</strong>
          <span>✕ Wrong</span>
          <strong>You −1 life</strong>
        </div>
        <div className="memory-lane__practice">
          <small>Try the buzzer once</small>
          <button
            type="button"
            className={practiceDone ? 'memory-lane__buzzer is-practiced' : 'memory-lane__buzzer'}
            onClick={() => setPracticeDone(true)}
          >
            <span>{practiceDone ? 'READY' : 'BUZZ'}</span>
          </button>
        </div>
        <button
          type="button"
          className="memory-lane__start"
          disabled={!practiceDone}
          onClick={() => setScreen('duel')}
        >
          Start the duel
        </button>
      </div>
    )
  }

  if (screen === 'finished') {
    const humanWon = winnerId === duelists.human.id
    const winner = humanWon ? duelists.human : duelists.ai
    return (
      <div className={`memory-lane memory-lane--finished ${humanWon ? 'is-win' : 'is-loss'}`}>
        <div className="memory-lane__aurora" aria-hidden="true" />
        <p className="memory-lane__kicker">Final memory</p>
        <h1>{humanWon ? 'You own the memories.' : `${duelists.ai.name} remembers.`}</h1>
        <div className="memory-lane__winner-medallion">
          <MemoryLanePortrait
            id={winner.id}
            name={winner.name}
            avatar={gamePlayersById.get(winner.id)?.avatar ?? winner.avatar}
            isUser={gamePlayersById.get(winner.id)?.isUser ?? humanWon}
            alt={winner.name}
          />
        </div>
        <strong className="memory-lane__winner-name">{winner.name} wins Part 3</strong>
        <p className="memory-lane__final-copy">
          Part 3 is decided. The winner earns the final LOH power.
        </p>
        <button
          type="button"
          className="memory-lane__start"
          onClick={() =>
            onFinish?.(humanLives, undefined, {
              authoritativeWinnerId: winnerId,
              authoritativeLastPlaceId: humanWon ? duelists.ai!.id : duelists.human!.id,
              rawValue: humanLives,
              rawResults: {
                [duelists.human!.id]: humanLives,
                [duelists.ai!.id]: aiLives,
              },
            })
          }
        >
          Confirm Part 3 winner
        </button>
      </div>
    )
  }

  if (!currentQuestion) return null

  const matchPoint = humanLives <= 1 || aiLives <= 1

  return (
    <div
      className={`memory-lane memory-lane--duel ${feedbackTone !== 'neutral' ? `is-${feedbackTone}` : ''} ${matchPoint ? 'is-match-point' : ''}`}
    >
      <div className="memory-lane__aurora" aria-hidden="true" />
      <header className="memory-lane__duel-header">
        <div className="memory-lane__fighter is-human">
          <div className="memory-lane__portrait">
            <MemoryLanePortrait
              id={duelists.human.id}
              name={duelists.human.name}
              avatar={gamePlayersById.get(duelists.human.id)?.avatar ?? duelists.human.avatar}
              isUser={gamePlayersById.get(duelists.human.id)?.isUser ?? true}
              alt={duelists.human.name}
            />
          </div>
          <div>
            <strong>{duelists.human.name}</strong>
            <LifePips lives={humanLives} side="human" />
          </div>
        </div>
        <div className="memory-lane__versus">VS</div>
        <div className="memory-lane__fighter is-ai">
          <div>
            <strong>{duelists.ai.name}</strong>
            <LifePips lives={aiLives} side="ai" />
          </div>
          <div className="memory-lane__portrait">
            <MemoryLanePortrait
              id={duelists.ai.id}
              name={duelists.ai.name}
              avatar={gamePlayersById.get(duelists.ai.id)?.avatar ?? duelists.ai.avatar}
              isUser={gamePlayersById.get(duelists.ai.id)?.isUser ?? false}
              alt={duelists.ai.name}
            />
          </div>
        </div>
      </header>

      {matchPoint && <div className="memory-lane__match-point">MATCH POINT</div>}

      <main className="memory-lane__question-stage">
        <div className="memory-lane__question-meta">
          <span>{currentQuestion.category}</span>
          <span>Memory {memoryNumber}</span>
        </div>
        <h2>{currentQuestion.prompt}</h2>

        {!buzzOwner && !feedback && (
          <>
            <div className="memory-lane__buzz-clock" key={`buzz-${questionIndex}`}>
              <i />
            </div>
            <button
              type="button"
              className="memory-lane__buzzer memory-lane__buzzer--live"
              onClick={() => {
                clearTimers()
                setBuzzOwner('human')
              }}
            >
              <span>BUZZ</span>
              <small>Tap when you know it</small>
            </button>
          </>
        )}

        {buzzOwner === 'ai' && !feedback && (
          <div className="memory-lane__ai-buzz" role="status">
            <span className="memory-lane__pulse-ring" />
            <strong>{duelists.ai.name} buzzed!</strong>
            <small>Answer locked…</small>
          </div>
        )}

        {buzzOwner === 'human' && !feedback && (
          <>
            <div className="memory-lane__answer-clock">
              <span>Choose</span>
              <strong>{Math.max(0, Math.ceil(humanAnswerRemaining / 1000))}</strong>
            </div>
            <div className="memory-lane__answers">
              {currentQuestion.optionPlayerIds.map((id) => {
                const player = gamePlayersById.get(id)
                const participant = participants.find((entry) => entry.id === id)
                const name = player?.name ?? participant?.name ?? id
                return (
                  <button
                    type="button"
                    key={id}
                    onClick={() => applyDamage('human', id === currentQuestion.correctPlayerId, id)}
                  >
                    <div className="memory-lane__answer-photo">
                      <MemoryLanePortrait
                        id={id}
                        name={name}
                        avatar={player?.avatar ?? participant?.avatar ?? ''}
                        isUser={player?.isUser ?? participant?.isHuman}
                        alt=""
                      />
                    </div>
                    <strong>{name}</strong>
                  </button>
                )
              })}
            </div>
          </>
        )}

        {feedback && (
          <div className={`memory-lane__feedback is-${feedbackTone}`} role="status">
            <strong>
              {feedbackTone === 'good' ? 'NICE MEMORY' : feedbackTone === 'bad' ? 'OOPS' : 'TIME'}
            </strong>
            <span>{feedback}</span>
            {selectedAnswer &&
              selectedAnswer !== '__timeout__' &&
              currentQuestion.correctPlayerId !== selectedAnswer && (
                <small>
                  Correct:{' '}
                  {gamePlayersById.get(currentQuestion.correctPlayerId)?.name ??
                    currentQuestion.correctPlayerId}
                </small>
              )}
            {currentQuestion.receipt && <em>{currentQuestion.receipt}</em>}
          </div>
        )}
      </main>
    </div>
  )
}
